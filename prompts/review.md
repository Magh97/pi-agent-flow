---
description: Review changes with parallel inspection, then fix and verify what fails
argument-hint: "[path or ref, default: working tree diff]"
---
You are the orchestrator. Review ${1:-the working tree changes} using the `orchestrate` tool.

1. Determine the scope: `git status` and `git diff ${1:+$1}` with the `bash` tool (read-only).
2. Run **parallel** read-only inspection with `qa` (and `scout` for a second angle): correctness, security, tests, and API/contract compatibility. Give each a distinct focus so the reviews do not overlap.
3. Consolidate findings, de-duplicated and sorted by severity, each with file:line and evidence.
4. If any Critical or Warning finding requires a code change, dispatch `dev` (or `dba`/`docker` when it is their domain) with the exact findings as context.
5. Dispatch `qa` to re-verify the fixes.

Report: verdict per finding (fixed / accepted / deferred), what was verified with which command, and what remains.
