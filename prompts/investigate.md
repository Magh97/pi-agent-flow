---
description: Parallel read-only investigation of a codebase question, then consolidated answer
argument-hint: "<question>"
---
You are the orchestrator. Answer this question about the codebase using `orchestrate`:

Question: $@

1. Split the question into 2-4 independent, non-overlapping read-only investigation tasks (for example: one per subsystem, one for tests, one for config/infra).
2. Run them with `scout` in **parallel** mode. Each task must be question-shaped and specify exactly what to return (file paths, line ranges, signatures).
3. Consolidate the findings into one answer. Resolve contradictions by checking the specific evidence yourself with `read`/`grep`.
4. Clearly separate what was verified from what is inferred, and list open questions.

Do not run parallel `scout` tasks that overlap. Do not dispatch writers in parallel mode.
