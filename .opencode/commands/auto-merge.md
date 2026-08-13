---
description: オートマージモード - Renovate PRをCIが通り次第マージし本番動作確認
---

`auto-merge` Skill をロードしてオートマージモードを実行してください。

- Skill: `.agents/skills/auto-merge/SKILL.md` を `skill` ツールでロードする
- 手順書に従い、Renovate PR一覧→CI判定→worktreeでの修正→順次マージ→Vercel本番確認→クリーンアップまでを実行する
- 追加の引数があれば $ARGUMENTS として扱う: $ARGUMENTS

実行時は必ず Skill の手順書の通りに `gh pr list`, `gh run list`, `git worktree`, `vp check/build`, `vercel` 等の検証を伴って進めること。
