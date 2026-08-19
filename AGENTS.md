<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

## Development Workflow - Git Worktree

### 作業開始時に行うこと

このリポジトリ (main) のファイルを変更・作成・削除してはならない。変更が必要な場合は必ず以下の手順で worktree を用意してから作業を開始すること。

1. まず `git branch --show-current` を実行して現在のブランチを確認する。
2. 現在のブランチが `main` の場合は、作業を開始する前に必ず次のコマンドで PR 用の worktree を作成し、そのディレクトリで作業を行う:
   ```bash
   git worktree add /Users/niboshi/ghq/github.com/mpppk/share2cosense.worktree/<branch-name> -b <branch-name>
   ```
3. worktree 作成後は、ファイルの変更・`git commit`・`git push`・PR 作成のすべてを worktree 内で行う。

### worktree の管理

- worktree の base path: `/Users/niboshi/ghq/github.com/mpppk/share2cosense.worktree`
- worktree 一覧の確認: `git worktree list`
- 作業完了後の削除: `git worktree remove /Users/niboshi/ghq/github.com/mpppk/share2cosense.worktree/<branch-name>`

## Dev Server - Port

`vite.config.ts:7` で `server.port` を `0` に設定し、OSが空きポートをランダムに割り当てる。複数の git worktree で同時に `vp dev` を実行してもポート衝突しない。各インスタンスは起動ログの `Local: http://localhost:<port>/` で確認する。
