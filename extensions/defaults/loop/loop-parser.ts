/**
 * Parse /loop command arguments (without the /loop prefix).
 */

import type { ParsedLoopCommand } from "./loop-types.js";

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000;
const MIN_INTERVAL_MS = 60 * 1000;

/** Parse interval token like 30s, 10m, 2h, 1d. Seconds round up to whole minutes (min 1m). */
export function parseInterval(token: string): number | null {
	const t = token.trim();
	const m = /^(\d+(?:\.\d+)?)\s*([smhd])$/i.exec(t);
	if (!m) return null;
	const n = Number(m[1]);
	if (!Number.isFinite(n) || n <= 0) return null;
	const unit = m[2].toLowerCase();
	let ms: number;
	switch (unit) {
		case "s":
			ms = Math.ceil(n) * 1000;
			ms = Math.max(MIN_INTERVAL_MS, Math.ceil(ms / MIN_INTERVAL_MS) * MIN_INTERVAL_MS);
			break;
		case "m":
			ms = Math.ceil(n) * 60 * 1000;
			break;
		case "h":
			ms = Math.ceil(n) * 60 * 60 * 1000;
			break;
		case "d":
			ms = Math.ceil(n) * 24 * 60 * 60 * 1000;
			break;
		default:
			return null;
	}
	if (ms < MIN_INTERVAL_MS) ms = MIN_INTERVAL_MS;
	return ms;
}

export function formatInterval(ms: number): string {
	if (ms % (24 * 60 * 60 * 1000) === 0) return `${ms / (24 * 60 * 60 * 1000)}d`;
	if (ms % (60 * 60 * 1000) === 0) return `${ms / (60 * 60 * 1000)}h`;
	if (ms % (60 * 1000) === 0) return `${ms / (60 * 1000)}m`;
	if (ms % 1000 === 0) return `${ms / 1000}s`;
	return `${ms}ms`;
}

/** Parse args after `/loop`. */
export function parseLoopCommand(input: string): ParsedLoopCommand {
	const raw = input.trim();
	if (!raw) {
		return { type: "help", reason: "empty" };
	}

	const lower = raw.toLowerCase();
	if (lower === "list") return { type: "list" };
	if (lower === "clear") return { type: "clear" };

	const del = /^delete\s+(\S+)\s*$/i.exec(raw);
	if (del) return { type: "delete", taskId: del[1] };

	const every = /^(.*?)\s+every\s+(\S+)\s*$/i.exec(raw);
	if (every) {
		const prompt = every[1].trim();
		const intervalMs = parseInterval(every[2]);
		if (!intervalMs) return { type: "help", reason: "bad_interval" };
		if (!prompt) return { type: "help", reason: "empty_prompt" };
		return { type: "create", prompt, intervalMs };
	}

	const space = raw.indexOf(" ");
	if (space !== -1) {
		const first = raw.slice(0, space).trim();
		const rest = raw.slice(space + 1).trim();
		const intervalMs = parseInterval(first);
		if (intervalMs !== null) {
			if (!rest) return { type: "help", reason: "interval_only" };
			return { type: "create", prompt: rest, intervalMs };
		}
	}

	return { type: "create", prompt: raw, intervalMs: DEFAULT_INTERVAL_MS };
}
