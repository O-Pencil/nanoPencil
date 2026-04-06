/**
 * [WHO]: parseLoopCommand, buildHelp
 * [FROM]: No external dependencies
 * [TO]: Consumed by extension entry point (./index.ts)
 * [HERE]: extensions/defaults/loop/loop-parser.ts -
 */

import type { ParsedLoopCommand } from "./loop-types.js";

export function parseLoopCommand(input: string): ParsedLoopCommand {
	const raw = input.trim();
	if (!raw) {
		return { type: "help", reason: "empty" };
	}

	const lower = raw.toLowerCase();
	if (lower === "status" || lower === "list") {
		return { type: "status" };
	}
	if (lower === "stop" || lower === "clear" || lower === "cancel") {
		return { type: "stop" };
	}
	if (lower === "help") {
		return { type: "help" };
	}

	return { type: "start", goal: raw };
}

export function buildHelp(reason?: string): string {
	const lines: string[] = [];
	if (reason) {
		lines.push(`[Grub] ${reason}`);
	}
	lines.push(
		"[Grub] Usage:",
		"  /grub <goal>      Start an autonomous digging task",
		"  /grub status      Show the active or last finished task",
		"  /grub stop        Stop the active task",
		"",
		"[Grub] The agent will keep iterating until it reports complete, reports blocked,",
		"or hits a safety limit such as the iteration or failure cap.",
	);
	return lines.join("\n");
}
