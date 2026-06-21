#!/usr/bin/env node
/**
 * [WHO]: Provides failure log parsing, fingerprinting, and IssueRecord merging
 * [FROM]: Depends on node:crypto/fs/process/path and scripts/dev-loop/types for artifact contracts
 * [TO]: Consumed by local verification runner, GitHub provider, tests, and dev-loop:parse CLI
 * [HERE]: scripts/dev-loop/failure-parser.ts within repo-level development loop infrastructure
 */

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { argv, cwd, exit, stderr, stdout } from "node:process";
import type { IssueEvidence, IssueRecord, IssueSource } from "./types.js";

export interface ClassifyFailureInput {
	source: IssueSource;
	commandId: string;
	command: string;
	exitCode: number | null;
	log: string;
	logRef: string;
	observedAt?: string;
}

interface FailureMatch {
	kind: string;
	signature: string;
	summary: string;
	excerpt: string;
}

const TS_DIAGNOSTIC_RE = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/gm;
const NODE_TEST_RE = /(?:^# Subtest:\s*(.+)$|^not ok \d+ -\s*(.+)$)/gm;
const DIP_RE = /^(FATAL|SEVERE)(?:-\d+)?:?\s+(.+)$/gm;
const BOUNDARY_RE = /(?:boundary|cycle|package).*?(?:violation|error)|(?:violation|error).*?(?:boundary|cycle|package)/i;

export function classifyFailureLog(input: ClassifyFailureInput): IssueRecord[] {
	const matches = collectMatches(input);
	const observedAt = input.observedAt ?? new Date().toISOString();

	return matches.map((match) => {
		const evidence: IssueEvidence = {
			source: input.source,
			commandId: input.commandId,
			command: input.command,
			exitCode: input.exitCode,
			summary: match.summary,
			logRef: input.logRef,
			excerpt: match.excerpt,
			observedAt,
		};
		return {
			id: stableId(match.signature),
			source: input.source,
			commandId: input.commandId,
			command: input.command,
			exitCode: input.exitCode,
			kind: match.kind,
			signature: match.signature,
			summary: match.summary,
			evidence: [evidence],
			status: "open",
			attemptCount: 1,
			lastFailureLogRef: input.logRef,
		};
	});
}

export function mergeIssueRecords(existing: IssueRecord[], incoming: IssueRecord[]): IssueRecord[] {
	const bySignature = new Map<string, IssueRecord>();

	for (const issue of [...existing, ...incoming]) {
		const current = bySignature.get(issue.signature);
		if (!current) {
			bySignature.set(issue.signature, { ...issue, evidence: [...issue.evidence] });
			continue;
		}

		current.attemptCount += issue.attemptCount;
		current.exitCode = issue.exitCode;
		current.summary = issue.summary;
		current.lastFailureLogRef = issue.lastFailureLogRef;
		current.status = current.status === "blocked" || issue.status === "blocked" ? "blocked" : "open";
		current.evidence.push(...issue.evidence);
	}

	return [...bySignature.values()];
}

export function compactLog(log: string, maxLines = 80): string {
	const lines = log.split(/\r?\n/);
	const focused = lines.filter((line) =>
		/(\berror\b|FAIL|not ok|AssertionError|FATAL|SEVERE|boundary|cycle|package)/i.test(line),
	);
	const selected = focused.length > 0 ? focused : lines;
	return selected.slice(0, maxLines).join("\n");
}

function collectMatches(input: ClassifyFailureInput): FailureMatch[] {
	const matches: FailureMatch[] = [];

	TS_DIAGNOSTIC_RE.lastIndex = 0;
	let tsMatch: RegExpExecArray | null;
	while ((tsMatch = TS_DIAGNOSTIC_RE.exec(input.log))) {
		const [, file, line, column, code, message] = tsMatch;
		const signature = `typescript:${normalizePath(file)}:${line}:${column}:${code}`;
		matches.push({
			kind: "typescript",
			signature,
			summary: `${code} in ${normalizePath(file)}:${line}:${column}: ${message}`,
			excerpt: tsMatch[0],
		});
	}

	NODE_TEST_RE.lastIndex = 0;
	let testMatch: RegExpExecArray | null;
	while ((testMatch = NODE_TEST_RE.exec(input.log))) {
		const name = (testMatch[1] ?? testMatch[2] ?? "unknown test").trim();
		const excerpt = excerptAround(input.log, testMatch.index);
		matches.push({
			kind: "node-test",
			signature: `node-test:${input.commandId}:${sanitizeFingerprintPart(name)}`,
			summary: `Node test failed: ${name}`,
			excerpt,
		});
	}

	DIP_RE.lastIndex = 0;
	let dipMatch: RegExpExecArray | null;
	while ((dipMatch = DIP_RE.exec(input.log))) {
		const [, severity, message] = dipMatch;
		matches.push({
			kind: "dip",
			signature: `dip:${sanitizeFingerprintPart(message)}`,
			summary: `${severity}: ${message}`,
			excerpt: dipMatch[0],
		});
	}

	if (matches.length === 0 && BOUNDARY_RE.test(input.log)) {
		matches.push({
			kind: "quality-boundary",
			signature: `quality:${stableId(compactLog(input.log, 12))}`,
			summary: `Quality/package boundary failure in ${input.commandId}`,
			excerpt: compactLog(input.log, 12),
		});
	}

	if (matches.length === 0 && input.exitCode !== 0 && input.exitCode !== null) {
		matches.push({
			kind: "command",
			signature: `command:${input.commandId}:${stableId(compactLog(input.log, 20))}`,
			summary: `Command failed: ${input.command}`,
			excerpt: compactLog(input.log, 20),
		});
	}

	return matches;
}

function excerptAround(log: string, index: number): string {
	const before = log.slice(0, index).split(/\r?\n/).slice(-2);
	const after = log.slice(index).split(/\r?\n/).slice(0, 6);
	return [...before, ...after].filter(Boolean).join("\n");
}

function normalizePath(value: string): string {
	return value.replaceAll("\\", "/");
}

function sanitizeFingerprintPart(value: string): string {
	return value.trim().replace(/\s+/g, " ").slice(0, 160);
}

function stableId(value: string): string {
	return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

async function main(): Promise<void> {
	const [, , logPath, ...rest] = argv;
	if (!logPath || rest.includes("--help")) {
		stdout.write("Usage: npm run dev-loop:parse -- <log-path> [--command-id id] [--command command] [--output issues.json]\n");
		return;
	}

	const commandId = readFlag(rest, "--command-id") ?? basename(logPath);
	const command = readFlag(rest, "--command") ?? commandId;
	const output = readFlag(rest, "--output");
	const log = await readFile(resolve(cwd(), logPath), "utf8");
	const issues = classifyFailureLog({
		source: "local",
		commandId,
		command,
		exitCode: 1,
		log,
		logRef: logPath,
	});
	const json = `${JSON.stringify(issues, null, 2)}\n`;
	if (output) {
		await writeFile(resolve(cwd(), output), json);
	} else {
		stdout.write(json);
	}
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
