---
name: auto-merge
description: >-
  Renovate PRをCIが通り次第マージし本番で動作確認するオートマージモード。
  ユーザーが「オートマージモード」「auto-merge mode」「Renovate PRをマージして」「CIが通っているものから順次マージ」等と指示した時に使用。
  worktreeを作成し、CI失敗PRは修正してから順次マージし、Vercel本番デプロイを検証する。
---

# Auto Merge Skill 手順書

Renovateが作成したPRをCI結果に応じて自動的にマージし、本番環境で動作確認する。
AGENTS.md の Worktree 運用ルールに従い、PRごとの開発は worktree を使用する。

## トリガー

- ユーザーが「オートマージモード」「auto-merge mode」「Renovate PRをCIが通り次第マージ」「CIが通っているものから順次マージして本番確認」等と指示した時

## 事前確認

- `AGENTS.md:22-32` の Worktree base path: `/Users/niboshi/ghq/github.com/mpppk/share2cosense.worktree`
- `gh` CLI, `vp` (vite-plus), `vercel` CLI, `bun` が利用可能であること
- `git fetch origin` で最新を取得しておく

## 手順

### 1. Renovate PR一覧とCI状況を確認

```bash
gh pr list --limit 20 --json number,title,headRefName,state,mergeable,mergeStateStatus,statusCheckRollup
gh run list --limit 20 --json databaseId,headBranch,status,conclusion,workflowName
```

- `statusCheckRollup[0].conclusion` が `SUCCESS` → 即マージ候補
- `FAILURE` → 要修正。`gh run view <runId> --log-failed | grep -A2 "error\|Formatting"` で原因特定

既知の失敗パターン:

- `renovate.json` フォーマットエラー (`vp check` が `Found formatting issues in 1 file`) → `main` では単行 `["config:recommended"]` が正。PRが古い `main` (69bd0d3) ベースの場合に発生。rebaseで解消
- `vite` / `vite-plus` 0.2.8→0.2.9 で `vite.config.ts:34 lazyPlugins` の `TS2321/TS2769` → `vite` と `vite-plus` は必ず同時に `0.2.9` に揃える。片方のみ更新のPRは両方を更新するfix commitを追加
- `actions/checkout v4` の Node 20 deprecation 警告 → `v5`/`v7` + `voidzero-dev/setup-vp@v1` に更新 (main では `2cfdfc7` / `2fc0463` で対応済み)

### 2. CI通過済みPRを即マージ

```bash
gh pr merge <num> --merge
git fetch origin && git checkout main && git pull --ff-only
```

- マージ方式は `Merge pull request` (merge commit) を使う。リポジトリの過去のマージ (例: `2fc0463`, `7602c79`) に合わせる
- マージ後は `git pull --ff-only` で `main` を更新し、残りPRの `mergeStateStatus` を再確認

### 3. CI失敗PRを worktree で修正

AGENTS.md に従い worktree を作成:

```bash
mkdir -p /Users/niboshi/ghq/github.com/mpppk/share2cosense.worktree
git worktree add /Users/niboshi/ghq/github.com/mpppk/share2cosense.worktree/renovate-<name> renovate/<name>
```

各 worktree で:

```bash
git fetch origin
git rebase origin/main
# コンフリクト時は package.json を手動解決し、bun.lock は vp install で再生成
vp install
vp check
vp build
```

- `package.json` の `vite` と `vite-plus` は常に同バージョンに揃える
- `AGENTS.md` の `## Tool Versions` は `vp config` が `0.2.9` で自動追加する差分。正当な変更としてコミットに含める
- `vp check --fix` はコミットフックで自動実行されるが、失敗時は手動で `vp check --fix` してからコミット

修正後に force push:

```bash
git push --force-with-lease origin renovate/<name>
```

push 後は `gh run list --branch renovate/<name>` で `in_progress` → `completed success` になるまでポーリング (10-15秒間隔)。

### 4. 残りPRを順次マージ & CI確認

- 再度 `gh pr list` で全て `CLEAN`/`SUCCESS` になったことを確認
- 1件ずつ `gh pr merge <num> --merge` → `git pull --ff-only`
- 依存が重なるPR (例: `vite` と `vite-plus` が共に `0.2.9` に収束) は片方をマージ後、もう片方は `gh pr close <num> --comment "duplicate of #<merged>"` でクローズし、`git push origin --delete renovate/<name>` でリモート削除
- マージごとに `gh run list --branch main` で `main` の CI (`df46dac` 等) が `success` になることを確認

### 5. 本番動作確認

```bash
# ローカルで最終検証
vp check
vp build

# Vercel デプロイ確認
vercel ls
curl -s -I https://share2cosense.vercel.app
curl -s https://share2cosense.vercel.app | grep -o 'index-.*\.js'
```

- `vercel ls` の最新 `Production` が `main` の最新コミット (`df46dac` 等) に対応しているか `api.vercel.com/v6/deployments?projectId=prj_vnyGGImwC2lCWvjuegVeFHJi572m` で `githubCommitSha` を確認
- 自動デプロイが発火しない場合 (本プロジェクトは `source: cli` の手動デプロイが過去の主流) は `vercel deploy --prod --yes` で手動デプロイ。ビルドログに `bun install` と `tsc -b && vp build` が成功し、新しい `index-CKa-l0M4.js` 等のハッシュが生成されることを確認
- 本番URL (`https://share2cosense.vercel.app` エイリアス `share2cosense-dj8whafno-...`) が `200` を返し、新しいアセットハッシュを配信していることを `curl` で検証

### 6. クリーンアップ

```bash
git worktree list
git worktree remove /Users/niboshi/ghq/github.com/mpppk/share2cosense.worktree/renovate-<name>
git branch -D renovate/<name>
mkdir -p /Users/niboshi/ghq/github.com/mpppk/share2cosense.worktree
git fetch --prune origin
```

- マージ済み/クローズ済みPRのローカル・リモートブランチを削除
- worktree base path ディレクトリは空の状態で残す (次回 `git worktree add` のため `mkdir -p` で保証)

## 注意

- `vp check` は `0.2.8` (oxfmt 0.61, oxlint 1.76) と `0.2.9` (oxfmt 0.62, oxlint 1.77, oxc 0.143) で結果が変わる。フォーマット・lintエラーが出た場合は `vp check --fix` ではなく型エラーの可能性を疑う
- `bun.lock` のコンフリクトは手で解かず `git checkout --ours bun.lock && vp install && git add bun.lock` で再生成するのが最も安全
- `GIT_EDITOR=true git rebase --continue` でエディタ起動を回避する
- 大きな `typescript` メジャー更新 (v6→v7) や `@types/node` メジャー更新は、Vite+ との組み合わせで型エラーが出ないか worktree で必ず `vp check` する
