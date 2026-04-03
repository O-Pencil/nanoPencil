/**
 * [UPSTREAM]: No external dependencies
 * [SURFACE]: parseLoopCommand, buildHelp
 * [LOCUS]: extensions/defaults/loop/loop-parser.ts - 
 * [COVENANT]: Change → update this header
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
		lines.push(`[Loop] ${reason}`);
	}
	lines.push(
		"[Loop] Usage:",
		"  /loop <goal>      Start an autonomous task loop",
		"  /loop status      Show the active or last finished loop",
		"  /loop stop        Stop the active loop",
		"",
		"[Loop] The agent will keep iterating until it reports complete, reports blocked,",
		"or hits a safety limit such as the iteration or failure cap.",
	);
	return lines.join("\n");
}
