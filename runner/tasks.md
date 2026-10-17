# Overnight tasks

Tasks run in order, one at a time, each as its own autonomous session.
Tick a box (`[x]`) to skip a task; the runner ticks boxes itself when a task
completes, so progress is visible in git and re-runs are safe.

## Example tasks

- [ ] Add input validation to the public API entrypoints and unit tests for the invalid cases.
- [ ] Review the repository for TODO/FIXME comments and resolve the ones that are safe, unambiguous fixes; report the rest instead of guessing.
- [ ] Add a `--help` flag to the CLI entrypoint with usage text, and a test that asserts it exits 0.
- [ ] Audit the dependency list for unused packages and remove only those with zero imports, verifying the build still passes.

## Tips

- Keep one task to one deliverable. If a task needs something verified, say so
  in the task ("...and verify with the test suite"); the orchestrator will route
  verification to the qa agent.
- Mention the acceptance criteria explicitly. The agents use them to decide
  when they are finished.
- Tasks that need credentials or touch production will come back as
  `STATUS: BLOCKED - <reason>` rather than being attempted blindly.
- For a large body of work, split it into several tasks instead of one giant
  task: each gets its own fresh context window and its own budget.

## Multi-line task example

- [ ] |
    Refactor the configuration loader so it validates required keys at startup
    instead of at first use. Keep the public interface unchanged, update the
    tests that assert on error messages, and run the full test suite.
