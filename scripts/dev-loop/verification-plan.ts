#!/usr/bin/env node
/**
 * [WHO]: Provides verification plan loading and dev-loop:plan CLI output
 * [FROM]: Depends on node:fs/path/process/url and .dev-docs/vibe-coding/verification-plan.json
 * [TO]: Consumed by dev-loop runner, watch command, tests, and agents reading repository gates
 * [HERE]: scripts/dev-loop/verification-plan.ts within repo-level development loop infrastructure
 */

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { argv, cwd, exit, stderr, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import type { VerificationPlan } from "./types.js";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_VERIFICATION_PLAN_PATH = resolve(SCRIPT_DIR, "../../.dev-docs/vibe-coding/verification-plan.json");

export async function loadVerificationPlan(path = DEFAULT_VERIFICATION_PLAN_PATH): Promise<VerificationPlan> {
	const parsed = JSON.parse(await readFile(path, "utf8")) as VerificationPlan;
	validateVerificationPlan(parsed, path);
	return parsed;
}

export function selectVerificationCommands(plan: VerificationPlan, ids: string[]): VerificationPlan["commands"] {
	if (ids.length === 0) return plan.commands;
	const wanted = new Set(ids);
	const selected = plan.commands.filter((command) => wanted.has(command.id));
	const missing = ids.filter((id) => !selected.some((command) => command.id === id));
	if (missing.length > 0) {
		throw new Error(`Unknown verification command id(s): ${missing.join(", ")}`);
	}
	return selected;
}

function validateVerificationPlan(plan: VerificationPlan, path: string): void {
	if (plan.schemaVersion !== 1) throw new Error(`Unsupported verification plan schema in ${path}`);
	if (!plan.repository || !plan.description || !plan.artifactRoot) throw new Error(`Invalid verification plan metadata in ${path}`);
	if (!Array.isArray(plan.commands) || plan.commands.length === 0) throw new Error(`Verification plan has no commands: ${path}`);
	const ids = new Set<string>();
	for (const command of plan.commands) {
		if (
			!command.id ||
			!command.label ||
			!command.command ||
			typeof command.required !== "boolean" ||
			!command.category
		) {
			throw new Error(`Invalid verification command in ${path}`);
		}
		if (ids.has(command.id)) throw new Error(`Duplicate verification command id in ${path}: ${command.id}`);
		ids.add(command.id);
	}
	if (!plan.prChecks?.provider || !plan.prChecks.command || !plan.prChecks.watchCommand) {
		throw new Error(`Invalid PR check configuration in ${path}`);
	}
}

async function main(): Promise<void> {
	const path = readFlag(argv.slice(2), "--plan") ?? DEFAULT_VERIFICATION_PLAN_PATH;
	const plan = await loadVerificationPlan(resolve(cwd(), path));
	stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
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
