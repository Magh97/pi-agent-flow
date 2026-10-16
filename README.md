# pi-multi-agent

A multi-agent orchestrator for [Pi](https://pi.dev): one `orchestrate` tool that
delegates work to specialized **child agents** running as isolated `pi`
subprocesses, plus workflow prompts that drive them.

```
you ──▶ orchestrator (main session, has the `orchestrate` tool)
           │
           ├─ scout  : read-only recon → compressed handoff context
           ├─ dba    : schema, migrations, queries, integrity
           ├─ dev    : autonomous senior engineer (code, tests, fixes)
           ├─ docker : images, compose, container runtime
           └─ qa     : independent verification, pass/fail verdict
```

## Why this design

Every child runs in its **own context window** (a fresh `pi --mode json`
process). That means:

- No context pollution: a 200k-token recon session never enters the
  implementer's window - only the compressed findings do.
- Independent verification: `qa` cannot see the implementer's reasoning, so
  it verifies evidence, not intent.
- Tool boundaries per role: `qa` and `scout` are declared read-only, so they
  cannot "helpfully" fix things they were supposed to report.
- The orchestrator carries the plan; children carry the work.

## What gets installed

| Location | Contents |
|---|---|
| `~/.pi/agent/extensions/multi-agent/index.ts` | The `orchestrate` tool (auto-discovered entry point) |
| `~/.pi/agent/extensions/multi-agent/agents.ts` | Agent discovery (frontmatter parsing) |
| `~/.pi/agent/agents/*.md` | `orchestrator`, `dev`, `qa`, `dba`, `docker`, `scout` |
| `~/.pi/agent/prompts/*.md` | `/implement`, `/implement-only`, `/bugfix`, `/db-migration`, `/dockerize`, `/review`, `/investigate`, `/full-delivery` |

On Windows the agent directory is `C:\Users\<you>\.pi\agent\...`.

## Install

```powershell
# from the package directory
node install.mjs            # copy into %USERPROFILE%\.pi\agent
node install.mjs --check    # verify an existing install without writing
```

Then restart Pi (or run `/reload`) and verify:

```
/skill:orchestrator                 # or simply:
Use the orchestrator to investigate how auth works
```

## Usage

### Workflow commands

```
/implement add a health endpoint returning build metadata   # scout → dev → qa
/bugfix login fails when the email has uppercase letters    # recon → dev (repro-first) → qa
/db-migration add a soft-delete column to orders            # scout → dba → dev → qa
/dockerize containerize the API service                     # scout → docker → qa
/review                                                     # parallel review → fix → re-verify
/investigate where is rate limiting enforced                # parallel read-only scouts
/full-delivery add SSO login                                # recon → dba → dev → docker → qa
```

### Direct orchestration

The main session has the `orchestrate` tool, so you can ask for chains and
parallel work explicitly:

```
Use orchestrate to run a chain: scout finds the payment code, dev adds a
retry with idempotency keys, qa verifies with the relevant tests.
```

```
Run two scouts in parallel: one maps the API routes, one maps the database
access layer.
```

The model may also issue **several `orchestrate` calls in one turn**. The
harness runs those calls concurrently too, which is the fastest way to combine
different modes (for example a parallel recon call plus a single `dev` call).

### Modes

| Mode | When | Shape |
|---|---|---|
| `single` | One specialist, one task | `{ agent: "dev", task: "...", context: "..." }` |
| `parallel` | Independent work — **true async, every task starts immediately** (max 8 per call) | `{ tasks: [{ agent: "scout", task, context }, ...] }` |
| `chain` | Only when a step consumes a prior step's output; writers serialized (max 12 steps) | `{ chain: [{ agent, task, context, label }, ...] }` |

Parallel mode has **no work queue**: all tasks spawn concurrently. Optional
`maxConcurrency` throttles them (use only for rate-limited providers).
Independent parallel fan-out does not consume the chain budget, so prefer it
over a chain whenever tasks do not actually depend on each other.

Chain placeholders: `{previous}` (last step's full output), `{context}`
(digest of all prior steps), `{step}` (step number). The `context` field is
prepended to the child's task and is how accumulated knowledge travels between
disciplines.

## Model selection

Child agents **inherit your active model and thinking level** by default, so
the package works with any provider out of the box. To route an agent to a
different model, add it to that agent's frontmatter:

```yaml
---
name: qa
description: ...
tools: read, bash, grep, find, ls
model: anthropic/claude-sonnet-4-5
---
```

Good candidate policies: a fast/cheap model for `scout`, a strong reasoning
model for `dev` and the `orchestrator`, a different model for `qa` than the one
that wrote the code.

## Operating rules baked into the agents

- **One writer at a time.** Parallel mode starts every task simultaneously, so
  never put two file-writing agents in the same parallel call — their edits can
  conflict. Writers run as separate sequential steps; parallel mode is for
  read-only investigations (`scout`, read-only `qa`).
- **Async by default.** Independent work goes in `parallel`, not `chain`.
  Only chain a step whose input is a prior step's output. Never serialize
  independent work — it only wastes wall-clock time.
- **Self-contained tasks.** Children start empty - the orchestrator must pass
  files, interfaces, decisions, and acceptance criteria in the task/context.
- **Independent verification.** Any implementation chain ends with `qa`,
  whose verdict must cite executed commands, not inspected code.
- **Escalation instead of guessing.** Destructive data operations, production
  infrastructure changes, contradictory requirements, and repeated failures
  stop and ask you.
- **Budget guard.** Prefer 2-4 steps. On failure: one corrected retry, then
  escalate. Every result reports turns and cost.

## Security

Child agents are separate `pi` processes with the same OS permissions as your
session, and `--tools` restricts what they are declared. The bundled agents
are **user-level** (`~/.pi/agent/agents`) and always load.

Project-level agents (`<repo>/.pi/agents/*.md`) are repository-controlled
prompts and are **not** used by default. To use them pass
`agentScope: "both"`; Pi then prompts for confirmation before running them in
an untrusted project. Only enable this for repositories you trust.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `orchestrate` tool missing | Extension not copied or Pi not restarted. Run `node install.mjs --check`, then `/reload`. The entry point must be `extensions/multi-agent/index.ts`. |
| `Unknown agent: "dev"` | Definitions missing from `~/.pi/agent/agents`. Re-run the installer. |
| Child fails instantly with empty output | `pi` not resolvable. Set `PI_ORCHESTRATOR_BIN` to the full path of `pi` (`pi.cmd` on Windows) or ensure `pi` is on `PATH`. |
| Agent uses the wrong model | A `model:` field in that agent's frontmatter overrides your active model. |
| Everything is slow / expensive | Prefer `single`/short chains, set a cheaper `model:` for `scout`, and remember each parallel task is a full child session. |

## Uninstall

Delete `~/.pi/agent/extensions/multi-agent/`, the six agent Markdown files,
and the eight workflow prompt files listed above.
