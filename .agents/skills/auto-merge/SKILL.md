---
name: auto-merge
description: >-
  現在の実装からPR作成→ローカル動作確認→CI通過後マージ→本番動作確認までを自動実行するオートマージモード。
  ユーザーが「オートマージモード」「auto-merge mode」「PRを作成してマージして」「CIが通ったらマージして本番確認」等と指示した時に使用。
  worktreeでPRを作成し、ローカルではvp check/build/testとchrome-devtools/gyazoでUI検証、CI成功後にマージしVercel本番を検証する。Renovate PRのバッチ処理にも対応。
---

# Auto Merge Skill 手順書

現在の実装内容からPRを作成し、ローカル動作確認 → CI通過後マージ → 本番動作確認までを自動で実行する汎用オートマージモード。
`AGENTS.md:29-39` の Worktree 運用ルールに従い、PRごとの開発は worktree を使用する。

## トリガー

- ユーザーが「オートマージモード」「auto-merge mode」「PR作成してCI通ったらマージ」「本番まで確認して」等と指示した時
- 旧トリガー「Renovate PRをCIが通り次第マージ」「CIが通っているものから順次マージ」も本skillで扱う（付録参照）

## 事前確認

- Worktree base path: `/Users/niboshi/ghq/github.com/mpppk/share2cosense.worktree` (`AGENTS.md:32`)
- `gh` CLI, `vp` (vite-plus), `vercel` CLI, `bun` が利用可能であること
- `git fetch origin` で最新を取得しておく
- Chrome DevTools MCP (`chrome-devtools_*` tools) が利用可能か確認。利用不可なら `npx -y chrome-devtools-mcp@latest` をMCP設定に追加するよう案内
- Gyazo は任意。`command -v gyazo` でCLIの有無を判定。CLIが無くてもリポジトリルートの `.env` に `GYAZO_API_TOKEN` があれば Gyazo APIでアップロード可能（2-2-c参照）

## 手順概要

1. 現在の実装内容でPRを作成
2. ローカル環境で動作確認（UIは chrome-devtools + Gyazo）
3. CIが通り次第マージ
4. 本番で動作確認（確認内容は2と同様）

---

### 1. 現在の実装内容でPRを作成

#### 1-1. 現在の差分とブランチ状態を確認

```bash
git status
git diff --stat
git diff
git log --oneline -10
git branch --show-current
git worktree list
git fetch origin
```

- 未コミットの変更があるか、既存ブランチ上のコミットかを確認
- `main` 直で作業している場合は新規ブランチ/worktreeを作成。既にfeatureブランチにいる場合はそのまま利用

#### 1-2. ブランチ/worktree作成（必要な場合）

AGENTS.md に従い worktree を作成:

```bash
mkdir -p /Users/niboshi/ghq/github.com/mpppk/share2cosense.worktree
# 新規PR用ブランチを作成する場合
git worktree add /Users/niboshi/ghq/github.com/mpppk/share2cosense.worktree/<branch-name> -b <branch-name> origin/main
# 既存ブランチをworktreeで開く場合
git worktree add /Users/niboshi/ghq/github.com/mpppk/share2cosense.worktree/<branch-name> <branch-name>
```

- `<branch-name>` は変更内容から命名（例: `feat/share-target-fix`, `fix/pwa-manifest`）。不明ならユーザーに確認
- worktree内で作業する場合、以降の `vp` / `git` コマンドは worktree ディレクトリで実行

#### 1-3. コミット & Push & PR作成

```bash
# 差分をステージング（意図しないファイルを含めないこと）
git add <files>
git commit -m "<commit message>"

# リポジトリの過去のコミットメッセージ形式に合わせる（git log --oneline -10 参照）
# 例: feat: ..., fix: ..., chore: ...

git push -u origin <branch-name>

gh pr create --title "<PR title>" --body "<PR body>" --base main
# PR URLを控える
gh pr view <branch-name> --json number,url,title,headRefName
```

- PR本文には変更概要・動作確認手順・関連issueを含める
- 既にPRが存在する場合は `gh pr view` で確認し、追加コミットは `git push` のみでOK（PRは更新される）

---

### 2. ローカル環境で動作確認

PR作成後、マージ前に必ずローカルで検証する。UI変更の有無に関わらず `vp check` / `vp build` は必須。UI変更がある場合は chrome-devtools での目視確認も必須。

#### 2-1. 静的検証（必須）

worktree（またはカレントブランチ）で実行:

```bash
vp install
vp check        # fmt + lint + typecheck
vp test         # テストが存在する場合
vp build        # 本番ビルドが成功することを確認
```

- `vp check` で失敗したら `vp check --fix` または手動修正 → 再コミット → `git push --force-with-lease` ではなく通常push（PR作成直後はforce不要、rebase時のみforce-with-lease）
- `bun.lock` のコンフリクトは手で解かず `git checkout --ours bun.lock && vp install && git add bun.lock` で再生成
- `vite` と `vite-plus` は常に同バージョンに揃える（片方のみ更新で `TS2321/TS2769` が出る）

#### 2-2. 起動確認 & UI検証

UI変更を判定:

```bash
git diff --name-only origin/main...HEAD
# src/**/*.tsx, src/**/*.ts, public/*, index.html, vite.config.ts 等が含まれればUI検証必須
```

UI検証が必要な場合、またはユーザーがUI確認を求めている場合は以下を実施:

**a. 開発サーバー起動**

```bash
# worktreeディレクトリで
vp dev &
# またはビルド成果物を検証する場合
vp build && vp preview &
# 起動待ち
for i in {1..15}; do curl -sf http://localhost:5173 >/dev/null && break || sleep 2; done
curl -s -I http://localhost:5173 | head -n 5
```

**b. Chrome DevTools MCP で検証**

```
chrome-devtools_navigate_page(url: "http://localhost:5173")
chrome-devtools_take_snapshot(verbose: false)  # DOM構造確認
chrome-devtools_take_screenshot(fullPage: true) # 目視確認
chrome-devtools_list_console_messages(types: ["error","warn"]) # エラー有無
chrome-devtools_list_network_requests(resourceTypes: ["document","script","stylesheet"]) # 致命的な404/500がないか
```

- コンソールに `error` があれば原因を特定し修正
- レイアウト崩れ・主要機能（例: Web Share Target の `/?title=&text=&url=` パラメータ処理、PWA manifest）が期待通りか snapshot/screenshot で確認
- 必要に応じて `chrome-devtools_evaluate_script` でインタラクションをテスト

**c. Gyazo キャプチャ（利用可能な場合）**

```bash
command -v gyazo >/dev/null 2>&1 && echo "gyazo available" || echo "gyazo not available"
# CLIが利用可能な場合
gyazo /path/to/screenshot.png
# または chrome-devtools_take_screenshot で保存したファイルを gyazo にアップロード
# 例: chrome-devtools_take_screenshot(filePath: "/tmp/local-preview.png") → gyazo /tmp/local-preview.png

# CLIが無い場合は .env の GYAZO_API_TOKEN で Gyazo APIに直接アップロードする
# （リポジトリルートの .env は1Passwordが生成するマウントファイル。AGENTS.md「.env からのトークン参照」参照）
set -a; source .env; set +a
curl -s -H "Authorization: Bearer ${GYAZO_API_TOKEN}" \
  -F "imagedata=@/tmp/local-preview.png" \
  -F "desc=<キャプチャの説明>" \
  https://upload.gyazo.com/api/upload | jq -r '.url'
```

- `gyazo` CLIが無くても `.env` に `GYAZO_API_TOKEN` があればAPIでアップロードする（CLIなしを理由にGyazoを諦めない）
- APIアップロード時の注意:
  - エンドポイントは `https://upload.gyazo.com/api/upload`（旧 `/api/v1/upload` は廃止済み）
  - トークンの値を stdout やログに出力しない（`${GYAZO_API_TOKEN}` 変数参照のまま使う）
  - ルートの `.env.local` は内容が古いためトークン源として使わない
- 上記も不可の環境では `chrome-devtools_take_screenshot` の画像をユーザーに提示することで代替
- 撮影したキャプチャURLをPRコメントまたは最終報告に含める: `gh pr comment <num> --body "Local preview: <gyazo-url>"`

**d. 検証結果の記録**

- 成功: PRに `Local verification: vp check/build passed, UI verified via chrome-devtools` 等をコメントまたはPR本文に追記
- 失敗: 修正コミットを追加し `git push` → 再検証

---

### 3. CIが通り次第マージ

#### 3-1. CI状況を確認

```bash
gh pr view <num> --json number,title,headRefName,mergeable,mergeStateStatus,statusCheckRollup
gh pr checks <num>
gh run list --branch <branch-name> --limit 10 --json databaseId,headBranch,status,conclusion,workflowName
```

- `statusCheckRollup[].conclusion == "SUCCESS"` または `gh pr checks` が全て `pass` → 即マージ可能
- `FAILURE` / `CANCELLED` → ログ確認して修正

#### 3-2. CI失敗時の修正

```bash
gh run view <runId> --log-failed | grep -A5 "error\|FAIL\|Formatting"
# 失敗原因を特定し worktree で修正
vp check --fix
vp check
vp build
git add <files>
git commit -m "fix: <cause>"
git push --force-with-lease origin <branch-name>
# 再度ポーリング
gh run list --branch <branch-name> --limit 5 --json status,conclusion
```

既知の失敗パターン:

- `renovate.json` フォーマットエラー (`Found formatting issues in 1 file`) → `main` では単行 `["config:recommended"]` が正。PRが古いbaseの場合 `git rebase origin/main` で解消
- `vite` / `vite-plus` バージョン不整合 `TS2321/TS2769` → 両方を同バージョン（例: `0.2.9`）に揃える
- `actions/checkout v4` deprecation 警告 → `v5`/`v7` + `voidzero-dev/setup-vp@v1` に更新

ポーリングは 10-15秒間隔で `in_progress` → `completed success` になるまで待つ:

```bash
for i in {1..20}; do gh run list --branch <branch-name> --limit 1 --json status,conclusion --jq '.[0] | "\(.status) \(.conclusion)"'; sleep 15; done
```

#### 3-3. マージ

CIが `SUCCESS` になったらマージ:

```bash
gh pr merge <num> --merge
# リポジトリの過去のマージ (例: 2fc0463, 7602c79) に合わせ Merge pull request (merge commit) を使用
# --squash / --rebase は使わない

git fetch origin
git checkout main
git pull --ff-only
gh pr view <num> --json state,mergedAt
gh run list --branch main --limit 5 --json status,conclusion,headSha
```

- マージ後は `main` のCIが `success` になることも確認（`gh run list --branch main`）
- 複数PRを連続で扱う場合は1件ずつ `merge → pull --ff-only → 次のPRのmergeStateStatus再確認` の順で実施

---

### 4. 本番で動作確認（確認内容は2と同様）

ローカルと同様の観点で本番環境を検証する。

#### 4-1. Vercel デプロイ確認

```bash
vercel ls --limit 5
# または API で直接確認
curl -s "https://api.vercel.com/v6/deployments?projectId=prj_vnyGGImwC2lCWvjuegVeFHJi572m&limit=5" -H "Authorization: Bearer $VERCEL_TOKEN" | jq '.deployments[] | {url, state, githubCommitSha, source}'

curl -s -I https://share2cosense.vercel.app | head -n 10
curl -s https://share2cosense.vercel.app | grep -o 'index-.*\.js' | head -n 5
```

- 最新 `Production` デプロイの `githubCommitSha` が `main` の最新コミットと一致することを確認
- 本プロジェクトは過去 `source: cli` の手動デプロイが主流だったため、自動デプロイが発火しない場合は手動デプロイ:

```bash
vercel deploy --prod --yes
# ビルドログに bun install と tsc -b && vp build が成功し、新しいハッシュの index-*.js が生成されることを確認
```

- 本番URL (`https://share2cosense.vercel.app`) が `200` を返し、新しいアセットハッシュを配信していることを `curl` で検証

#### 4-2. 本番UI検証（2と同様）

ローカルと同手順で本番URLを検証:

```
chrome-devtools_navigate_page(url: "https://share2cosense.vercel.app")
chrome-devtools_take_snapshot(verbose: false)
chrome-devtools_take_screenshot(fullPage: true, filePath: "/tmp/prod-preview.png")
chrome-devtools_list_console_messages(types: ["error","warn"])
chrome-devtools_list_network_requests(resourceTypes: ["document","script","stylesheet","image"])
# 必要なら Lighthouse / Performance trace
chrome-devtools_performance_start_trace(autoStop: true, reload: true)
```

- ローカルで確認した観点（レイアウト、主要機能、PWA、Share Targetパラメータ）を本番でも再確認
- コンソールエラー、404/500、レイアウト崩れがないか確認
- 差分があれば `vp build` の成果物と本番配信ハッシュが一致しているか `curl` で突き合わせ

Gyazoが利用可能な場合（CLI、または `.env` の `GYAZO_API_TOKEN` によるAPIアップロード。手順は2-2-c参照）:

```bash
gyazo /tmp/prod-preview.png
# CLIが無い場合は API でアップロード
# set -a; source .env; set +a
# curl -s -H "Authorization: Bearer ${GYAZO_API_TOKEN}" -F "imagedata=@/tmp/prod-preview.png" \
#   https://upload.gyazo.com/api/upload | jq -r '.url'
# URLを最終報告に含める
```

- ローカルキャプチャと本番キャプチャを並べて差分がないか確認できると理想的

#### 4-3. 報告

- PRコメントまたは最終出力で「本番確認: Production deployment <url> verified (200, console clean, screenshot: <gyazo-url>)」を報告
- 問題があれば即座に修正PRを作成するか `vercel rollback` を検討

---

### 5. クリーンアップ

```bash
git worktree list
git worktree remove /Users/niboshi/ghq/github.com/mpppk/share2cosense.worktree/<branch-name>
git branch -D <branch-name>  # 既にマージ済みなら -d でも可
mkdir -p /Users/niboshi/ghq/github.com/mpppk/share2cosense.worktree
git fetch --prune origin
```

- worktree base path ディレクトリは空の状態で残す（次回 `git worktree add` のため `mkdir -p` で保証）
- マージ済み/クローズ済みPRのローカル・リモートブランチを削除

---

## 付録: Renovate等の複数PRをバッチ処理する場合

ユーザーが「Renovate PRをまとめて」「CIが通っているものから順次マージ」等と指示した場合は、上記 1-4 を各PRに適用しつつ、以下で一覧と依存関係を管理する。

### A-1. PR一覧とCI状況を俯瞰

```bash
gh pr list --limit 20 --json number,title,headRefName,state,mergeable,mergeStateStatus,statusCheckRollup
gh run list --limit 20 --json databaseId,headBranch,status,conclusion,workflowName
```

- `SUCCESS` → 即マージ候補（手順3-3へ）
- `FAILURE` → 要修正（手順3-2と同様に worktree で修正）

### A-2. 依存が重なるPRの扱い

- `vite` と `vite-plus` が共に `0.2.9` に収束する等、内容が重複するPRは片方をマージ後、もう片方は `gh pr close <num> --comment "duplicate of #<merged>"` でクローズし `git push origin --delete renovate/<name>` でリモート削除
- マージごとに `git pull --ff-only` と `gh run list --branch main` で `main` のCIを確認してから次へ進む

### A-3. 失敗PRの worktree 修正フロー

```bash
mkdir -p /Users/niboshi/ghq/github.com/mpppk/share2cosense.worktree
git worktree add /Users/niboshi/ghq/github.com/mpppk/share2cosense.worktree/renovate-<name> renovate/<name>
# worktree内で
git fetch origin
git rebase origin/main
# コンフリクト時は package.json を手動解決し bun.lock は vp install で再生成
vp install
vp check
vp build
git push --force-with-lease origin renovate/<name>
```

- `AGENTS.md` の `## Tool Versions` は `vp config` が自動追加する差分。正当な変更として含める
- `GIT_EDITOR=true git rebase --continue` でエディタ起動を回避

---

## 注意

- `vp check` は `0.2.8` (oxfmt 0.61, oxlint 1.76) と `0.2.9` (oxfmt 0.62, oxlint 1.77, oxc 0.143) で結果が変わる。フォーマット・lintエラーが出た場合は型エラーの可能性も疑う
- `bun.lock` のコンフリクトは `git checkout --ours bun.lock && vp install && git add bun.lock` で再生成が最も安全
- Chrome DevTools MCP が使えない環境では `curl -I` と `vp preview` の目視で代替するが、可能な限り chrome-devtools を使う
- Gyazo は任意。`gyazo` CLIが無くても `.env` の `GYAZO_API_TOKEN` でAPIアップロード可能（2-2-c参照）。どちらも不可の環境では `chrome-devtools_take_screenshot` の画像を直接提示する
- `vercel deploy --prod` は課金・レート制限に注意。自動デプロイが有効な場合は手動デプロイ不要
