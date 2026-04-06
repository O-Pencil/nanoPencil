/**
 * [WHO]: parseSchedulerCommand, buildSchedulerHelp
 * [FROM]: Depends on ./scheduler-types.js
 * [TO]: Consumed by extension entry point (./index.ts)
 * [HERE]: extensions/defaults/loop/scheduler-parser.ts - scheduled loop parser
 */

import type { ParsedSchedulerCommand } from "./scheduler-types.js";

const DURATION_TOKEN = /(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)/gi;
const DEFAULT_INTERVAL_MS = 10 * 60 * 1000;
const DEFAULT_INTERVAL_LABEL = "10m";

function normalizeDurationLabel(parts: Array<{ value: number; unit: string }>): string {
	return parts
		.map(({ value, unit }) => {
			const shortUnit =
				unit.startsWith("s") ? "s" : unit.startsWith("m") ? "m" : unit.startsWith("h") ? "h" : "d";
			return `${value}${shortUnit}`;
		})
		.join(" ");
}

export function parseDurationSpec(raw: string): { intervalMs: number; intervalLabel: string } | undefined {
	const normalized = raw.trim().toLowerCase();
	if (!normalized) return undefined;

	if (normalized === "hourly") {
		return { intervalMs: 60 * 60 * 1000, intervalLabel: "1h" };
	}
	if (normalized === "daily") {
		return { intervalMs: 24 * 60 * 60 * 1000, intervalLabel: "1d" };
	}

	const matches = [...normalized.matchAll(DURATION_TOKEN)];
	if (matches.length === 0) {
		return undefined;
	}

	let consumed = "";
	let totalMs = 0;
	const parts: Array<{ value: number; unit: string }> = [];
	for (const match of matches) {
		consumed += match[0];
		const value = Number.parseInt(match[1] ?? "", 10);
		const unit = match[2] ?? "";
		if (!Number.isFinite(value) || value <= 0) {
			return undefined;
		}

		if (unit.startsWith("s")) totalMs += value * 1000;
		else if (unit.startsWith("m")) totalMs += value * 60 * 1000;
		else if (unit.startsWith("h")) totalMs += value * 60 * 60 * 1000;
		else totalMs += value * 24 * 60 * 60 * 1000;

		parts.push({ value, unit });
	}

	if (consumed.replace(/\s+/g, "") !== normalized.replace(/\s+/g, "")) {
		return undefined;
	}
	if (totalMs < 60 * 1000) {
		return {
			intervalMs: 60 * 1000,
			intervalLabel: "1m",
		};
	}

	return {
		intervalMs: totalMs,
		intervalLabel: normalizeDurationLabel(parts),
	};
}

export function parseSchedulerCommand(input: string): ParsedSchedulerCommand {
	const raw = input.trim();
	if (!raw) {
		return { type: "help", reason: "empty" };
	}

	const lower = raw.toLowerCase();
	if (lower === "help") return { type: "help" };
	if (lower === "status" || lower === "list" || lower === "ls") return { type: "list" };
	if (lower === "clear" || lower === "stop all" || lower === "cancel all" || lower === "remove all") {
		return { type: "clear" };
	}

	const cancelMatch = raw.match(/^(?:cancel|remove|delete|stop)\s+(.+)$/i);
	if (cancelMatch) {
		const id = cancelMatch[1]?.trim();
		if (!id) return { type: "help", reason: "cancel" };
		return { type: "cancel", id };
	}

	const everyPrefix = raw.match(/^every\s+(.+?)\s+(.+)$/i);
	if (everyPrefix) {
		const duration = parseDurationSpec(everyPrefix[1] ?? "");
		const scheduledInput = (everyPrefix[2] ?? "").trim();
		if (!duration) return { type: "help", reason: "interval" };
		if (!scheduledInput) return { type: "help", reason: "input" };
		return { type: "start", input: scheduledInput, ...duration };
	}

	const everySuffix = raw.match(/^(.+?)\s+every\s+(.+)$/i);
	if (everySuffix) {
		const scheduledInput = (everySuffix[1] ?? "").trim();
		const duration = parseDurationSpec(everySuffix[2] ?? "");
		if (!duration) return { type: "help", reason: "interval" };
		if (!scheduledInput) return { type: "help", reason: "input" };
		return { type: "start", input: scheduledInput, ...duration };
	}

	const firstToken = raw.match(/^(\S+)\s+(.+)$/);
	if (firstToken) {
		const duration = parseDurationSpec(firstToken[1] ?? "");
		const scheduledInput = (firstToken[2] ?? "").trim();
		if (duration) {
			if (!scheduledInput) return { type: "help", reason: "input" };
			return { type: "start", input: scheduledInput, ...duration };
		}
	}

	return {
		type: "start",
		input: raw,
		intervalMs: DEFAULT_INTERVAL_MS,
		intervalLabel: DEFAULT_INTERVAL_LABEL,
	};
}

export function buildSchedulerHelp(reason?: "empty" | "interval" | "input" | "cancel"): string {
	const lines: string[] = [];

	if (reason === "empty") lines.push("[Loop] Missing loop arguments.");
		if (reason === "interval") lines.push("[Loop] Invalid interval. Claude-style loop uses minute granularity; sub-minute values round up to 1m.");
	if (reason === "input") lines.push("[Loop] Missing scheduled prompt or slash command.");
	if (reason === "cancel") lines.push("[Loop] Missing task id to cancel.");

	lines.push(
			"[Loop] Usage:",
			"  /loop check the build",
			"  /loop every 10m Review test failures",
			"  /loop 30m Run /grub status",
			"  /loop Check npm updates every 1d",
		"  /loop list",
		"  /loop cancel <id>",
		"  /loop clear",
		"",
			"[Loop] Notes:",
			"  - If no interval is provided, /loop defaults to every 10 minutes.",
			"  - Schedules are session-scoped and run only while this NanoPencil session stays open.",
			"  - Due tasks wait until the agent is idle; missed intervals collapse to one pending run.",
			"  - Seconds are rounded up to the nearest minute.",
			"  - Scheduled slash commands run through the same slash-command dispatcher as interactive input.",
		);

	return lines.join("\n");
}
