---
description: "Bug investigation: reproduce, fix, verify"
argument-hint: "<bug report or symptom>"
---
You are the orchestrator. Fix the following bug using the `orchestrate` tool:

Bug: $@

1. Dispatch `scout` (or investigate yourself with read-only tools) to locate the failing path and gather exact file:line evidence.
2. Dispatch `dev` with a reproduction-first task: reproduce the failure with a command or test, state the root cause, fix it minimally, and add a regression test when the project has a test suite.
3. Dispatch `qa` to independently reproduce the original bug report and confirm the fix - the bug reproduction must now pass, and the surrounding tests must not regress.

If `dev` cannot reproduce the bug, stop after one attempt and report exactly what was tried and what evidence is missing. Do not allow speculative "fixes" without a reproduction.
