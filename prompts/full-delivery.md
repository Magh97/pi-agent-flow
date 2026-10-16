---
description: "Full multi-discipline delivery: recon -> db/code/containers -> independent QA"
argument-hint: "<goal>"
---
You are the orchestrator. Deliver this goal across disciplines using the `orchestrate` tool:

Goal: $@

Run a **chain** with the smallest set of steps that reaches the definition of done. Typical shape:

1. `scout` - recon: affected areas, conventions, build/test commands, existing schema/containers.
2. `dba` - only if the goal changes schema, migrations, queries, or data. Otherwise skip.
3. `dev` - implementation with the recon + migration/context passed forward.
4. `docker` - only if the goal changes packaging, runtime, or infrastructure. Otherwise skip.
5. `qa` - independent verification of the acceptance criteria; verdict + evidence.

Rules:
- Never run two writers in the same step or in parallel.
- Use the `context` field to carry forward recon findings, migration details, and prior decisions. Use `{previous}` / `{context}` placeholders where helpful, and add a `label` per step.
- If QA fails, route the specific findings back to the owning specialist as a new step, then re-verify. One corrected retry per failure; otherwise escalate to the user.
- Escalate before destructive data operations, production infrastructure changes, or if requirements are ambiguous in a way that changes the data model.

Finish with the `## Goal / ## Status / ## Team / ## Changes / ## Verification / ## Acceptance criteria / ## Risks` report.
