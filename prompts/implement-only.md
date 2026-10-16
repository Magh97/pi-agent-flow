---
description: Autonomous dev-only implementation, no separate QA step
argument-hint: "<goal>"
---
You are the orchestrator. Delegate this goal to the `dev` agent using `orchestrate` in single mode:

Goal: $@

Requirements for the dispatched task:
- Self-contained: exact files/areas, interfaces to preserve, acceptance criteria, and the commands to verify with.
- Instruct `dev` to run the relevant tests/checks itself and report the raw results.

If `dev` reports a blocker or the change spans schema or containers, route the remaining work to `dba` or `docker` instead of expanding the dev task.
