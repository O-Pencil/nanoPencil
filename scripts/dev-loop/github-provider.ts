#!/usr/bin/env node
/**
 * [WHO]: Provides gh CLI PR/check ingestion and GitHub failure IssueRecord conversion
 * [FROM]: Depends on node process utilities, dev-loop exec runner, parser, and artifact types
 * [TO]: Consumed by dev-loop:pr CLI, watch command, and tests for remote CI failure ingestion
 * [HERE]: scripts/dev-loop/github-provider.ts within repo-level development loop infrastructure
 */

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { argv, cwd, exit, stderr, stdout } from "node:process";
import { classifyFailureLog } from "./failure-parser.js";
import { execShellCommand } from "./run-verification.js";
import type { ExecCommand, IssueRecord } from "./types.js";
import { loadVerificationPlan } from "./verification-plan.js";

interface GhPrCheck {
	name?: string;
	state?: string;
	link?: string;
	workflow?: string;
	bucket?: string;
	description?: string;
	startedAt?: string;
	completedAt?: string;
}

export interface ParsePrChecksOptions {
	prNumber: number;
	logByCheckName?: Map<string, string>;
	observedAt?: string;
}

export interface IngestPrChecksOptions {
	repoRoot: string;
	prNumber: number;
	artifactRoot: string;
	runId?: string;
	execCommand?: ExecCommand;
}

export function parsePrChecks(json: string, options: ParsePrChecksOptions): IssueRecord[] {
	const checks = JSON.parse(json) as GhPrCheck[];
	const failed = checks.filter((check) => isFailedCheck(check));
	return failed.flatMap((check) => {
		const name = check.name ?? "unknown check";
		const workflow = check.workflow ?? "unknown workflow";
		const commandId = `github:${workflow}:${name}`;
		const log = options.logByCheckName?.get(name) ?? check.description ?? `${workflow} / ${name} failed`;
		const issues = classifyFailureLog({
			source: "github",
			commandId,
			command: `gh pr checks ${options.prNumber}`,
			exitCode: 1,
			log,
			logRef: check.link ?? `github-pr-${options.prNumber}:${name}`,
			observedAt: options.observedAt,
		});
		return issues.map((issue) => ({
			...issue,
			summary: `PR #${options.prNumber} ${workflow} / ${name}: ${issue.summary}`,
			commandId,
			command: `gh pr checks ${options.prNumber}`,
		}));
	});
}

export async function ingestPrChecks(options: IngestPrChecksOptions): Promise<IssueRecord[]> {
	const execCommand = options.execCommand ?? execShellCommand;
	const checks = await execCommand(
		`gh pr checks ${options.prNumber} --json name,state,link,workflow,bucket,description,startedAt,completedAt`,
		{ cwd: options.repoRoot },
	);
	if (checks.exitCode !== 0) {
		throw new Error(`gh pr checks failed: ${checks.stderr || checks.stdout}`);
	}

	const rawChecks = JSON.parse(checks.stdout) as GhPrCheck[];
	const logByCheckName = new Map<string, string>();
	for (const check of rawChecks.filter((entry) => isFailedCheck(entry))) {
		const name = check.name ?? "unknown check";
		const log = await fetchFailedCheckLog(execCommand, options.repoRoot, check);
		if (log) logByCheckName.set(name, log);
	}

	const issues = parsePrChecks(checks.stdout, { prNumber: options.prNumber, logByCheckName });
	const runId = options.runId ?? `pr-${options.prNumber}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
	const artifactDir = resolve(options.repoRoot, options.artifactRoot, runId);
	await mkdir(artifactDir, { recursive: true });
	await writeFile(resolve(artifactDir, "github-checks.json"), `${JSON.stringify(rawChecks, null, 2)}\n`);
	await writeFile(resolve(artifactDir, "issues.json"), `${JSON.stringify(issues, null, 2)}\n`);
	await writeFile(
		resolve(artifactDir, "state.json"),
		`${JSON.stringify(
			{
				schemaVersion: 1,
				runId,
				decision: issues.length > 0 ? "continue" : "complete",
				source: "github",
				prNumber: options.prNumber,
				issueCount: issues.length,
				currentIssueSignature: issues[0]?.signature,
			},
			null,
			2,
		)}\n`,
	);
	return issues;
}

function isFailedCheck(check: GhPrCheck): boolean {
	const value = `${check.state ?? ""} ${check.bucket ?? ""}`.toLowerCase();
	return value.includes("fail") || value.includes("error") || value.includes("cancel") || value.includes("timed");
}

async function fetchFailedCheckLog(execCommand: ExecCommand, repoRoot: string, check: GhPrCheck): Promise<string | undefined> {
	const runId = check.link?.match(/actions\/runs\/(\d+)/)?.[1];
	if (!runId) return check.description;
	const result = await execCommand(`gh run view ${runId} --log-failed`, { cwd: repoRoot });
	if (result.exitCode !== 0) return check.description;
	return [result.stdout, result.stderr].filter(Boolean).join("\n");
}

async function main(): Promise<void> {
	const args = argv.slice(2);
	const prArg = args.find((arg) => /^\d+$/.test(arg)) ?? readFlag(args, "--pr");
	if (!prArg) {
		stdout.write("Usage: npm run dev-loop:pr -- <number> [--artifact-root .catui/dev-loop]\n");
		return;
	}
	const plan = await loadVerificationPlan(readFlag(args, "--plan"));
	const issues = await ingestPrChecks({
		repoRoot: cwd(),
		prNumber: Number(prArg),
		artifactRoot: readFlag(args, "--artifact-root") ?? plan.artifactRoot,
		runId: readFlag(args, "--run-id"),
	});
	stdout.write(`${JSON.stringify(issues, null, 2)}\n`);
	if (issues.length > 0) exit(1);
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
