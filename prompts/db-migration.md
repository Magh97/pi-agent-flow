---
description: Design and apply a database migration safely (dba + verification)
argument-hint: "<schema/query change>"
---
You are the orchestrator. Handle this database change using the `orchestrate` tool:

Change: $@

1. Dispatch `scout` if the migration framework, schema location, or connection setup is unknown.
2. Dispatch `dba` with a self-contained task: the change, engine and migration framework, existing schema context, and safety constraints. Require: a versioned migration (never editing an applied one), a rollback path, and an explicit destructive-operation declaration.
3. If the dba change requires application-code updates (models, queries, repositories), dispatch `dev` afterwards with the migration as context.
4. Dispatch `qa` to verify: migration applies cleanly to a scratch/local database (or explain why it cannot), queries still work, and no criteria regressed.

Stop and escalate to the user before any destructive operation on real data (DROP/TRUNCATE/unfiltered DELETE/column removal). Never guess credentials or connection details.
