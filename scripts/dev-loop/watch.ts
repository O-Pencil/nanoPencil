#!/usr/bin/env node
/**
 * [WHO]: Provides dev-loop:watch babysit CLI for repeated local/PR verification checks
 * [FROM]: Depends on dev-loop runner, GitHub provider, watch-state, verification plan, and Node timers/process
 * [TO]: Consumed by developers or agents that need to continue until green or explicitly blocked
 * [HERE]: scripts/dev-loop/watch.ts within repo-level development loop infrastructure
 */

import { setTimeout as delay } from "node:timers/promises";
import { argv, cwd, exit, stderr, stdout } from "node:process";
import { mergeIssueRecords } from "./failure-parser.js";
import { ingestPrChecks } from "./github-provider.js";
import { runVerificationCommands } from "./run-verification.js";
import type { IssueRecord } from "./types.js";
import { loadVerificationPlan, selectVerificationCommands } from "./verification-plan.js";
import { decideWatchState } from "./watch-state.js";

async function main(): Promise<void> {
	const args = argv.slice(2);
	const plan = await loadVerificationPlan(readFlag(args, "--plan"));
	const artifactRoot = readFlag(args, "--artifact-root") ?? plan.artifactRoot;
	const intervalMs = Number(readFlag(args, "--interval-ms") ?? 10 * 60 * 1000);
	const maxRounds = Number(readFlag(args, "--max-rounds") ?? 1);
	const maxAttemptsPerIssue = Number(readFlag(args, "--max-attempts") ?? 3);
	const commandIds = readListFlag(args, "--only");
	const prNumber = readFlag(args, "--pr");

	let accumulatedIssues: IssueRecord[] = [];
	for (let round = 1; round <= maxRounds; round++) {
		const run = await runVerificationCommands({
			repoRoot: cwd(),
			artifactRoot,
			runId: `watch-${round}-${new Date().toISOString().replace(/[:.]/g, "-")}`,
			commands: selectVerificationCommands(plan, commandIds),
		});
		accumulatedIssues = mergeIssueRecords(accumulatedIssues, run.issues);

		let remoteGreen: boolean | null = null;
		if (prNumber) {
			const remoteIssues = await ingestPrChecks({
				repoRoot: cwd(),
				prNumber: Number(prNumber),
				artifactRoot,
			});
			accumulatedIssues = mergeIssueRecords(accumulatedIssues, remoteIssues);
			remoteGreen = remoteIssues.length === 0;
		}

		const decision = decideWatchState({
			localGreen: run.decision === "complete",
			remoteGreen,
			issues: accumulatedIssues,
			maxAttemptsPerIssue,
		});
		stdout.write(`${JSON.stringify({ round, ...decision }, null, 2)}\n`);
		if (decision.decision === "complete") return;
		if (decision.decision === "blocked") exit(2);
		if (round < maxRounds) await delay(intervalMs);
	}

	exit(1);
}

function readFlag(args: string[], flag: string): string | undefined {
	const index = args.indexOf(flag);
	return index >= 0 ? args[index + 1] : undefined;
}

function readListFlag(args: string[], flag: string): string[] {
	const value = readFlag(args, flag);
	return value ? value.split(",").map((item) => item.trim()).filter(Boolean) : [];
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((error: unknown) => {
		stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
		exit(1);
	});
}
