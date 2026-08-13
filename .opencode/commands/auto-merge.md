---
description: オートマージモード - 現在の実装からPR作成→ローカル動作確認→CI通過後マージ→本番動作確認
---

`auto-merge` Skill をロードしてオートマージモードを実行してください。

- Skill: `.agents/skills/auto-merge/SKILL.md` を `skill` ツールでロードする
- 手順書に従い、以下の4ステップで実行する:
  1. 現在の実装内容でPRを作成
  2. ローカル環境で動作確認（`vp check`/`vp build`/`vp test` + 必要に応じて chrome-devtools MCP でUI検証、Gyazoでキャプチャ）
  3. CIが通り次第マージ（`gh pr checks`/`gh run list` でポーリング、失敗時は修正して再push）
  4. 本番で動作確認（2と同様 + `vercel`/`curl` でVercel本番検証、chrome-devtools/GyazoでUI再確認）
- Renovate等の複数PRバッチ処理も付録に従い対応する
- 追加の引数があれば $ARGUMENTS として扱う: $ARGUMENTS

実行時は必ず Skill の手順書の通りに `git worktree`, `gh pr create/list`, `gh run list`, `vp check/build/test`, `chrome-devtools_*`, `gyazo`, `vercel` 等の検証を伴って進めること。
