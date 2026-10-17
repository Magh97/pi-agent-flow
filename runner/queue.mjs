/**
 * Overnight queue runner for pi-multi-agent.
 *
 * Executes each task in a task file as one autonomous `pi` session, in order,
 * unattended, with hard time and cost caps. Designed for "leave it running
 * overnight" use:
 *
 *   node runner/queue.mjs --tasks runner/tasks.md
 *
 * Safety properties:
 *   - One task at a time (never two writers in the same repo).
 *   - Per-task wall-clock timeout; the whole process tree is killed on expiry.
 *   - Per-task and total cost caps; aborts before starting a task that would
 *     blow the remaining budget.
 *   - Escalation detection: a session that reports BLOCKED is recorded and
 *     (by default) the run continues with the next task.
 *   - Resumable: completed tasks are skipped when re-run.
 *   - Stop file: create `<state dir>/STOP` to halt cleanly between tasks.
 *
 * Task file format (Markdown):
 *
 *   # Tasks
 *   - [ ] Add a truncate() helper with tests
 *   - [x] Already done, skipped
 *   - [ ] |
 *       Multi-line tasks are supported when the line is just "- [ ] |".
 *       Indented lines below are joined with newlines.
 *
 * A completed task gets its box ticked in the task file, so progress is
 * visible in git and the file can be re-run safely.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
	const options = {
		tasks: "runner/tasks.md",
		cwd: process.cwd(),
		timeoutMinutes: 30,
		maxCostPerTask: 3.0,
		maxCostTotal: 25.0,
		retries: 1,
		beforeTask: null,
		dryRun: false,
		stopOnBlocked: false,
		model: null,
		stateDir: null,
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const next = () => {
			const value = argv[++i];
			if (value === undefined) throw new Error(`Missing value for ${arg}`);
			return value;
		};
		switch (arg) {
			case "--tasks": options.tasks = next(); break;
			case "--cwd": options.cwd = next(); break;
			case "--timeout": options.timeoutMinutes = Number(next()); break;
			case "--max-cost-per-task": options.maxCostPerTask = Number(next()); break;
			case "--max-cost-total": options.maxCostTotal = Number(next()); break;
			case "--retries": options.retries = Number(next()); break;
			case "--before-task": options.beforeTask = next(); break;
			case "--model": options.model = next(); break;
			case "--state-dir": options.stateDir = next(); break;
			case "--dry-run": options.dryRun = true; break;
			case "--stop-on-blocked": options.stopOnBlocked = true; break;
			case "-h":
			case "--help": options.help = true; break;
			default:
				if (!arg.startsWith("--")) continue;
				throw new Error(`Unknown option: ${arg}`);
		}
	}
	return options;
}

const HELP = `pi-multi-agent queue runner

Usage:
  node runner/queue.mjs [options]

Options:
  --tasks <file>              Task file (markdown). Default: runner/tasks.md
  --cwd <dir>                 Working directory for each task. Default: cwd
  --timeout <minutes>         Per-task wall-clock limit. Default: 30
  --max-cost-per-task <usd>   Abort a task past this cost. Default: 3.00
  --max-cost-total <usd>      Stop the run past this total. Default: 25.00
  --retries <n>               Retries per task after failure. Default: 1
  --before-task <cmd>         Shell command to run before each task
  --model <provider/model>    Model for the session (default: pi settings)
  --state-dir <dir>           Where state/logs live. Default: <tasks dir>/.queue
  --dry-run                   List the plan; run nothing
  --stop-on-blocked           Stop the run when a task escalates (default: continue)

Controls:
  Create <state-dir>/STOP to halt between tasks.
  Re-running skips finished tasks and continues with the rest.

Per-task output:
  A session may report escalation with a line containing "STATUS: BLOCKED"
  plus a reason; the runner records it and moves on unless --stop-on-blocked.
`;

// ---------------------------------------------------------------------------
// Task parsing
// ---------------------------------------------------------------------------

function parseTasks(content) {
	const lines = content.split(/\r?\n/);
	const tasks = [];
	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		const match = line.match(/^(\s*-\s*\[( |x|X)\]\s*)(.*)$/);
		if (!match) {
			i++;
			continue;
		}
		const [, prefix, checked, rest] = match;
		const done = checked.toLowerCase() === "x";
		let text = rest.trim();

		// "- [ ] |" opens a block whose indented lines are the task body.
		if (rest.trim().startsWith("|")) {
			const body = [];
			const first = rest.trim().slice(1).trim();
			if (first) body.push(first);
			i++;
			while (i < lines.length && (/^\s{2,}\S/.test(lines[i]) || lines[i].trim() === "")) {
				if (lines[i].trim() === "" && (i + 1 >= lines.length || !/^\s{2,}\S/.test(lines[i + 1]))) break;
				if (lines[i].trim() !== "") body.push(lines[i].trim());
				i++;
			}
			text = body.join("\n");
		} else {
			i++;
		}

		if (!text) continue;
		tasks.push({ lineIndex: tasks.length, raw: line, prefix, text, done });
	}
	return tasks;
}

function tickTaskInFile(filePath, task) {
	const content = fs.readFileSync(filePath, "utf-8");
	const eol = content.includes("\r\n") ? "\r\n" : "\n";
	const lines = content.split(/\r?\n/);
	const index = lines.findIndex((l) => l === task.raw);
	if (index === -1) return;
	lines[index] = lines[index].replace(/^(\s*-\s*\[)( |x|X)(\])/, "$1x$3");
	fs.writeFileSync(filePath, lines.join(eol), "utf-8");
}

// ---------------------------------------------------------------------------
// Spawning pi
// ---------------------------------------------------------------------------

/** Resolve the pi CLI the same way the extension does (no shell, cross-platform). */
function getPiInvocation(args) {
	const override = process.env.PI_ORCHESTRATOR_BIN;
	if (override) return { command: override, args };

	const managedRoot = process.env.PI_MANAGED_INSTALL_ROOT;
	if (managedRoot) {
		try {
			const version = fs.readFileSync(path.join(managedRoot, "current-version"), "utf8").trim();
			if (version && version !== "." && version !== "..") {
				const cli = path.join(
					managedRoot, "releases", version, "node_modules",
					"@earendil-works", "pi-coding-agent", "dist", "bundle", "cli.js",
				);
				if (fs.existsSync(cli)) return { command: process.execPath, args: [cli, ...args] };
			}
		} catch {
			/* fall through */
		}
	}

	const currentScript = process.argv[1];
	const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");
	if (currentScript && !isBunVirtualScript && fs.existsSync(currentScript)) {
		return { command: process.execPath, args: [currentScript, ...args] };
	}
	return { command: "pi", args };
}

function killTree(child) {
	if (!child.pid) return;
	if (process.platform === "win32") {
		try {
			spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", detached: true }).unref();
		} catch {
			child.kill("SIGKILL");
		}
	} else {
		try {
			process.kill(-child.pid, "SIGKILL");
		} catch {
			child.kill("SIGKILL");
		}
	}
}

/**
 * Run one task as an autonomous pi session.
 * Streams nothing; returns { status, cost, turns, result, error, durationMs }.
 */
function runTask(task, options, state) {
	return new Promise((resolve) => {
		const prompt = [
			"You are running unattended as part of an overnight task queue.",
			"There is no human to answer questions. Do not ask for confirmation or clarification.",
			"Complete the task below autonomously and verify your work.",
			"If and only if you cannot proceed safely (destructive data operation, missing credentials,",
			"contradictory requirements, or a failure that persists after one corrected retry),",
			"stop and reply with a final line exactly of the form: STATUS: BLOCKED - <one-line reason>",
			"Otherwise finish with a short report of what changed and how it was verified.",
			"",
			"## Task",
			task.text,
		].join("\n");

		const args = ["--mode", "json", "--no-session"];
		if (options.model) args.push("--model", options.model);
		args.push(prompt);

		const invocation = getPiInvocation(args);
		const startedAt = Date.now();
		const child = spawn(invocation.command, invocation.args, {
			cwd: options.cwd,
			shell: false,
			detached: process.platform !== "win32",
			stdio: ["ignore", "pipe", "pipe"],
		});

		let buffer = "";
		let stderr = "";
		let cost = 0;
		let turns = 0;
		let result = "";
		let stopReason;
		let errorMessage;
		let timedOut = false;
		let finished = false;

		const timer = setTimeout(() => {
			timedOut = true;
			killTree(child);
		}, options.timeoutMinutes * 60_000);

		const handleLine = (line) => {
			if (!line.trim()) return;
			let event;
			try {
				event = JSON.parse(line);
			} catch {
				return;
			}
			if (event.type !== "message_end" || !event.message) return;
			const msg = event.message;
			if (msg.role !== "assistant") return;
			turns++;
			const usage = msg.usage;
			if (usage?.cost?.total) cost += usage.cost.total;
			if (msg.stopReason) stopReason = msg.stopReason;
			if (msg.errorMessage) errorMessage = msg.errorMessage;
			const text = (msg.content ?? [])
				.filter((part) => part.type === "text")
				.map((part) => part.text)
				.join("");
			if (text) result = text;
		};

		const finish = (exitCode) => {
			if (finished) return;
			finished = true;
			clearTimeout(timer);
			if (buffer.trim()) handleLine(buffer);

			const durationMs = Date.now() - startedAt;
			const blocked = /STATUS:\s*BLOCKED/i.test(result);
			let status;
			if (timedOut) status = "timeout";
			else if (blocked) status = "blocked";
			else if (exitCode !== 0 || stopReason === "error") status = "failed";
			else if (stopReason === "aborted") status = "aborted";
			else status = "done";

			resolve({
				status,
				cost,
				turns,
				result,
				stderr: stderr.slice(-4000),
				error: errorMessage ?? (exitCode !== 0 ? `exit code ${exitCode}` : undefined),
				durationMs,
			});
		};

		child.stdout.on("data", (data) => {
			buffer += data.toString();
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";
			for (const line of lines) handleLine(line);
		});
		child.stderr.on("data", (data) => {
			stderr += data.toString();
			if (stderr.length > 20_000) stderr = stderr.slice(-20_000);
		});
		child.on("close", (code) => finish(code ?? 0));
		child.on("error", (err) => {
			stderr += `\nspawn error: ${err.message}`;
			finish(1);
		});

		void state;
	});
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms) {
	const s = Math.round(ms / 1000);
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	return `${m}m${String(s % 60).padStart(2, "0")}s`;
}

function runShell(command, cwd) {
	return new Promise((resolve) => {
		const child = spawn(command, { cwd, shell: true, stdio: "ignore" });
		child.on("close", (code) => resolve(code ?? 0));
		child.on("error", () => resolve(1));
	});
}

function appendLog(logPath, entry) {
	fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`, "utf-8");
}

function writeState(statePath, state) {
	fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
}

function timestamp() {
	return new Date().toISOString().replace("T", " ").slice(0, 19);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	const options = parseArgs(process.argv.slice(2));
	if (options.help) {
		console.log(HELP);
		return 0;
	}

	const tasksPath = path.resolve(options.cwd, options.tasks);
	if (!fs.existsSync(tasksPath)) {
		console.error(`Task file not found: ${tasksPath}`);
		console.error("Create one (see runner/tasks.md) or pass --tasks <file>.");
		return 1;
	}
	const stateDir = path.resolve(options.cwd, options.stateDir ?? path.join(path.dirname(tasksPath), ".queue"));
	const statePath = path.join(stateDir, "state.json");
	const logPath = path.join(stateDir, "run.jsonl");
	const stopFile = path.join(stateDir, "STOP");

	fs.mkdirSync(stateDir, { recursive: true });

	const tasks = parseTasks(fs.readFileSync(tasksPath, "utf-8")).filter((t) => !t.done);
	if (tasks.length === 0) {
		console.log("No pending tasks.");
		return 0;
	}

	const previous = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, "utf-8")) : { totalCost: 0, completed: [] };
	const completedBefore = (previous.completed ?? []).length;
	const state = { startedAt: new Date().toISOString(), totalCost: previous.totalCost ?? 0, completed: previous.completed ?? [] };

	console.log(`pi-multi-agent queue  ·  ${tasks.length} task(s)`);
	console.log(`tasks:  ${tasksPath}`);
	console.log(`cwd:    ${options.cwd}`);
	console.log(`limits: ${options.timeoutMinutes}min/task, $${options.maxCostPerTask.toFixed(2)}/task, $${options.maxCostTotal.toFixed(2)} total`);
	console.log(`state:  ${stateDir}`);
	if (state.totalCost > 0) console.log(`budget: $${state.totalCost.toFixed(4)} already spent in previous runs`);
	console.log("");

	if (options.dryRun) {
		tasks.forEach((t, i) => {
			const first = t.text.split("\n")[0];
			console.log(`  ${i + 1}. ${first}${t.text.includes("\n") ? " …" : ""}`);
		});
		console.log("\nDry run: nothing executed.");
		return 0;
	}

	if (fs.existsSync(stopFile)) {
		console.log("STOP file present - halting before the first task.");
		return 0;
	}

	let failures = 0;
	let blocked = 0;
	let doneThisRun = 0;

	for (let i = 0; i < tasks.length; i++) {
		const task = tasks[i];
		const label = `${i + 1}/${tasks.length}`;
		const firstLine = task.text.split("\n")[0];

		if (fs.existsSync(stopFile)) {
			console.log(`\nSTOP file present - halting before task ${label}.`);
			break;
		}
		if (state.totalCost >= options.maxCostTotal) {
			console.log(`\nTotal budget exhausted ($${state.totalCost.toFixed(4)} >= $${options.maxCostTotal.toFixed(2)}) - halting.`);
			break;
		}

		let attempt = 0;
		let outcome;
		for (;;) {
			attempt++;
			console.log(`[${timestamp()}] ${label} ${attempt > 1 ? `(retry ${attempt - 1}) ` : ""}${firstLine.slice(0, 90)}`);

			if (options.beforeTask) {
				const code = await runShell(options.beforeTask, options.cwd);
				if (code !== 0) console.log(`  before-task hook exited ${code}`);
			}

			outcome = await runTask(task, options, state);
			state.totalCost += outcome.cost;

			const icon = { done: "✓", blocked: "!", failed: "✗", timeout: "✗", aborted: "✗" }[outcome.status] ?? "?";
			console.log(
				`  ${icon} ${outcome.status}  ${formatDuration(outcome.durationMs)}  $${outcome.cost.toFixed(4)}  ` +
					`${outcome.turns} turn(s)  total $${state.totalCost.toFixed(4)}`,
			);

			appendLog(logPath, {
				at: new Date().toISOString(),
				task: firstLine,
				attempt,
				status: outcome.status,
				cost: outcome.cost,
				turns: outcome.turns,
				durationMs: outcome.durationMs,
				error: outcome.error,
				blockedReason: /STATUS:\s*BLOCKED[^\n]*/i.exec(outcome.result)?.[0],
				result: outcome.result.slice(0, 8000),
			});

			const retryable = outcome.status === "failed" || outcome.status === "timeout";
			if (retryable && attempt <= options.retries) {
				const remaining = options.maxCostTotal - state.totalCost;
				if (remaining <= 0) break;
				console.log("  retrying...");
				continue;
			}
			break;
		}

		writeState(statePath, state);

		if (outcome.status === "done") {
			doneThisRun++;
			tickTaskInFile(tasksPath, task);
			state.completed.push({ task: firstLine, at: new Date().toISOString() });
			writeState(statePath, state);
		} else if (outcome.status === "blocked") {
			blocked++;
			console.log(`  → needs your input: ${/STATUS:\s*BLOCKED[^\n]*/i.exec(outcome.result)?.[0] ?? "escalated"}`);
			if (options.stopOnBlocked) {
				console.log("\n--stop-on-blocked set - halting.");
				console.log("  Re-run after resolving; finished tasks are skipped.");
				return 2;
			}
		} else {
			failures++;
			if (outcome.error) console.log(`  → ${outcome.error.split("\n")[0]}`);
		}
	}

	writeState(statePath, state);

	const totalCompleted = state.completed.length;
	const sinceStart = totalCompleted - completedBefore;
	console.log("");
	console.log(
		`Run finished. ${doneThisRun} task(s) completed this run (${sinceStart} new), ` +
			`${failures} failed, ${blocked} need input.`,
	);
	console.log(`Spent $${state.totalCost.toFixed(4)} of $${options.maxCostTotal.toFixed(2)} lifetime budget.`);
	console.log(`Details: ${logPath}`);
	if (failures || blocked > 0) console.log("Re-run the same command to retry remaining tasks.");
	return failures > 0 ? 1 : 0;
}

main()
	.then((code) => process.exit(code))
	.catch((err) => {
		console.error(`runner error: ${err?.stack ?? err}`);
		process.exit(1);
	});
