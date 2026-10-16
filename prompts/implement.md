---
description: Implement a feature or fix end-to-end with dev + independent QA verification
argument-hint: "<goal>"
---
You are the orchestrator. Deliver the following goal using the `orchestrate` tool:

Goal: $@

1. Recon with `scout` if you do not already know the relevant files and conventions.
2. Dispatch `dev` with a self-contained task: the goal, exact files/areas, interfaces to preserve, and acceptance criteria. Pass all scout findings in the `context` field.
3. Dispatch `qa` as a separate step to verify the acceptance criteria: run the relevant tests and return a PASS/FAIL verdict with commands and raw results.
4. If QA fails, send the specific findings back to `dev` (or the right specialist) with the failing evidence, then re-verify. At most one corrected retry per failure; otherwise stop and report.

Finish with the `## Goal / ## Status / ## Changes / ## Verification / ## Acceptance criteria / ## Risks` report. Never claim verification that was not executed.
