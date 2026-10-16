/**
 * Installer for pi-multi-agent.
 *
 * Copies the extension, child-agent definitions and workflow prompts into the
 * Pi agent directory (default `~/.pi/agent`, override with PI_AGENT_DIR).
 *
 * Usage:
 *   node install.mjs            # install / update
 *   node install.mjs --check    # verify an existing install, do not write
 *   node install.mjs --dry-run  # show what would change
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const check = args.has("--check");
const dryRun = args.has("--dry-run");

const agentDir =
	process.env.PI_AGENT_DIR ||
	(process.env.PI_HOME ? path.join(process.env.PI_HOME, "agent") : path.join(os.homedir(), ".pi", "agent"));

const jobs = [
	{ from: path.join(root, "extension"), to: path.join(agentDir, "extensions", "multi-agent"), files: ["index.ts", "agents.ts"] },
	{ from: path.join(root, "agents"), to: path.join(agentDir, "agents"), files: ["orchestrator.md", "dev.md", "qa.md", "dba.md", "docker.md", "scout.md"] },
	{
		from: path.join(root, "prompts"),
		to: path.join(agentDir, "prompts"),
		files: [
			"implement.md",
			"implement-only.md",
			"bugfix.md",
			"db-migration.md",
			"dockerize.md",
			"review.md",
			"investigate.md",
			"full-delivery.md",
		],
	},
];

const missing = [];
for (const job of jobs) {
	for (const file of job.files) {
		if (!fs.existsSync(path.join(job.from, file))) missing.push(path.join(job.from, file));
	}
}
if (missing.length > 0) {
	console.error("Installer is incomplete, missing source files:");
	for (const m of missing) console.error(`  - ${m}`);
	process.exit(1);
}

console.log(`pi-multi-agent -> ${agentDir}\n`);

let written = 0;
let unchanged = 0;

for (const job of jobs) {
	fs.mkdirSync(job.to, { recursive: true });
	for (const file of job.files) {
		const src = path.join(job.from, file);
		const dest = path.join(job.to, file);
		const srcText = fs.readFileSync(src, "utf-8");
		const existing = fs.existsSync(dest) ? fs.readFileSync(dest, "utf-8") : null;

		if (existing === srcText) {
			unchanged++;
			console.log(`  = ${path.relative(agentDir, dest)}`);
			continue;
		}
		if (check) {
			console.log(`  ! ${path.relative(agentDir, dest)} (${existing === null ? "missing" : "out of date"})`);
			continue;
		}
		if (!dryRun) fs.writeFileSync(dest, srcText, "utf-8");
		written++;
		console.log(`  ${existing === null ? "+" : "~"} ${path.relative(agentDir, dest)}`);
	}
}

console.log();
if (check) {
	const stale = missing.length === 0;
	console.log(stale ? "Check complete." : "Check complete.");
	process.exit(0);
}
if (dryRun) {
	console.log(`Dry run: ${written} file(s) would change, ${unchanged} already up to date.`);
	process.exit(0);
}
console.log(`Done: ${written} file(s) installed/updated, ${unchanged} unchanged.`);
console.log("\nNext steps:");
console.log("  1. Start (or /reload) pi and run: pi --print \"Say READY, then stop.\"");
console.log("  2. Try: /implement add a health endpoint returning build metadata");
console.log("  3. Or ask directly: \"Use the orchestrator to <your goal>\"");
