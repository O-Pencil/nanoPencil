#!/usr/bin/env node
/**
 * [WHO]: Provides autonomy assessment and handoff summaries for dev-loop artifacts
 * [FROM]: Depends on node fs/path/process plus dev-loop verification artifact types
 * [TO]: Consumed by agents and dev-loop:handoff CLI to resume repair without rereading every log
 * [HERE]: scripts/dev-loop/handoff.ts within repo-level development loop infrastructure
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { argv, cwd, exit, stderr, stdout } from "node:process";
import type { AutonomyState, VerificationRun } from "./types.js";

export interface AssessAutonomyOptions {
	verificationRun: VerificationRun;
}

export function assessAutonomyState(options: AssessAutonomyOptions): AutonomyState {
	const run = options.verificationRun;
	const failedCommands = run.commands.filter((command) => command.exitCode !== 0);
	const requiredFailures = failedCommands.filter((command) => command.required).map((command) => command.id);
	const optionalFailures = failedCommands.filter((command) => !command.required).map((command) => command.id);
	const openIssues = run.issues.filter((issue) => issue.status !== "fixed");
	const currentIssue = openIssues.find((issue) => issue.signature === run.currentIssueSignature) ?? openIssues[0];

	if (run.decision === "blocked") {
		return {
			schemaVersion: 1,
			readiness: "blocked",
			decision: "blocked",
			nextAction: run.blockedReason ?? "Ask a human to resolve the blocked dev-loop state.",
			nextIssueSignature: currentIssue?.signature,
			requiredFailures,
			optionalFailures,
			handoffMarkdown: renderHandoffMarkdown(run, "blocked", currentIssue, requiredFailures, optionalFailures),
		};
	}

	if (run.decision === "complete" && requiredFailures.length === 0) {
		return {
			schemaVersion: 1,
			readiness: optionalFailures.length > 0 ? "needs-evidence" : "green",
			decision: "complete",
			nextAction:
				optionalFailures.length > 0
					? `Review optional evidence from ${optionalFailures.join(", ")} before claiming full confidence.`
					: "Repository required verification is green. Escalate to PR checks or final review if needed.",
			requiredFailures,
			optionalFailures,
			handoffMarkdown: renderHandoffMarkdown(run, optionalFailures.length > 0 ? "needs-evidence" : "green", currentIssue, requiredFailures, optionalFailures),
		};
	}

	return {
		schemaVersion: 1,
		readiness: currentIssue ? "repair-ready" : "needs-evidence",
		decision: "continue",
		nextAction: currentIssue
			? `Repair ${currentIssue.signature}, then rerun: npm run dev-loop:verify -- --only ${currentIssue.commandId}`
			: "Run a focused verification command to collect a concrete issue before changing code.",
		nextIssueSignature: currentIssue?.signature,
		requiredFailures,
		optionalFailures,
		handoffMarkdown: renderHandoffMarkdown(run, currentIssue ? "repair-ready" : "needs-evidence", currentIssue, requiredFailures, optionalFailures),
	};
}

function renderHandoffMarkdown(
	run: VerificationRun,
	readiness: AutonomyState["readiness"],
	currentIssue: VerificationRun["issues"][number] | undefined,
	requiredFailures: string[],
	optionalFailures: string[],
): string {
	const lines = [
		`# Dev Loop Handoff ${run.runId}`,
		"",
		`Readiness: ${readiness}`,
		`Decision: ${run.decision}`,
		`Artifact Dir: ${run.artifactDir}`,
		"",
		"## Next Action",
		"",
		currentIssue
			? `Repair \`${currentIssue.signature}\`, then run \`npm run dev-loop:verify -- --only ${currentIssue.commandId}\`.`
			: run.decision === "complete"
				? "Required local verification is green. Run PR checks or final review if this is branch completion."
				: "Collect focused verification evidence before editing.",
		"",
		"## Current Issue",
		"",
		currentIssue ? `- ${currentIssue.summary}` : "- none",
		currentIssue ? `- signature: \`${currentIssue.signature}\`` : "",
		currentIssue ? `- last log: \`${currentIssue.lastFailureLogRef}\`` : "",
		currentIssue ? `- attempts: ${currentIssue.attemptCount}` : "",
		"",
		"## Failed Commands",
		"",
		`- required: ${requiredFailures.length > 0 ? requiredFailures.join(", ") : "none"}`,
		`- optional: ${optionalFailures.length > 0 ? optionalFailures.join(", ") : "none"}`,
		"",
		"## Commands To Continue",
		"",
		currentIssue ? `\`\`\`bash\nnpm run dev-loop:verify -- --only ${currentIssue.commandId}\n\`\`\`` : "```bash\nnpm run dev-loop:plan\n```",
		"",
		"## Safety",
		"",
		"- Do not commit, push, or mutate PR state unless the user explicitly asks.",
		"- Treat partial verification as partial evidence, not full green.",
		"",
	].filter((line) => line !== "");
	return `${lines.join("\n")}\n`;
}

async function main(): Promise<void> {
	const args = argv.slice(2);
	const artifactDir = readFlag(args, "--artifact-dir");
	if (!artifactDir || args.includes("--help")) {
		stdout.write("Usage: npm run dev-loop:handoff -- --artifact-dir .catui/dev-loop/<run-id> [--output handoff.md]\n");
		return;
	}

	const absoluteArtifactDir = resolve(cwd(), artifactDir);
	const run = JSON.parse(await readFile(resolve(absoluteArtifactDir, "verification-run.json"), "utf8")) as VerificationRun;
	const state = assessAutonomyState({ verificationRun: run });
	const output = readFlag(args, "--output") ?? "handoff.md";
	await mkdir(absoluteArtifactDir, { recursive: true });
	await writeFile(resolve(absoluteArtifactDir, "autonomy-state.json"), `${JSON.stringify(state, null, 2)}\n`);
	await writeFile(resolve(absoluteArtifactDir, output), state.handoffMarkdown);
	stdout.write(`${JSON.stringify(state, null, 2)}\n`);
	if (state.decision === "blocked") exit(2);
}

function readFlag(args: string[], flag: string): string | undefined {
	const index = args.indexOf(flag);
	return index >= 0 ? args[index + 1] : undefined;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((error: unknown) => {
		stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
		exit(1);
	});
}
