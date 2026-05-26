/**
 * [WHO]: parseGrubCommand, buildGrubHelp
 * [FROM]: Depends on ./grub-types
 * [TO]: Consumed by extension entry point (./index.ts)
 * [HERE]: extensions/defaults/grub/grub-parser.ts - /grub command parser with resume/status --json/--max-iter/--max-fail flags
 */

import type { ParsedGrubCommand } from "./grub-types.js";
import { grubText, type GrubLocale } from "./grub-i18n.js";

interface TokenizedArgs {
	positional: string[];
	flags: Record<string, string | boolean>;
}

function scanTokens(input: string): string[] {
	const tokens: string[] = [];
	let current = "";
	let quote: "'" | '"' | undefined;
	let escaping = false;

	for (const char of input.trim()) {
		if (escaping) {
			current += char;
			escaping = false;
			continue;
		}
		if (char === "\\" && quote !== "'") {
			escaping = true;
			continue;
		}
		if ((char === "'" || char === '"') && !quote) {
			quote = char;
			continue;
		}
		if (char === quote) {
			quote = undefined;
			continue;
		}
		if (/\s/.test(char) && !quote) {
			if (current) {
				tokens.push(current);
				current = "";
			}
			continue;
		}
		current += char;
	}

	if (escaping) current += "\\";
	if (current) tokens.push(current);
	return tokens;
}

function tokenize(input: string): TokenizedArgs {
	const tokens = scanTokens(input);
	const positional: string[] = [];
	const flags: Record<string, string | boolean> = {};
	const knownValueFlags = new Set(["max-iter", "max-iterations", "max-fail", "max-failures"]);
	for (let i = 0; i < tokens.length; i += 1) {
		const tok = tokens[i];
		if (tok === "--") {
			positional.push(...tokens.slice(i + 1));
			break;
		}
		if (tok.startsWith("--")) {
			const eq = tok.indexOf("=");
			if (eq !== -1) {
				const key = tok.slice(2, eq);
				if (knownValueFlags.has(key) || key === "json") {
					flags[key] = tok.slice(eq + 1);
				} else {
					positional.push(tok);
				}
				continue;
			}
			const key = tok.slice(2);
			const next = tokens[i + 1];
			if (knownValueFlags.has(key) && next !== undefined) {
				flags[key] = next;
				i += 1;
			} else if (key === "json") {
				flags[key] = true;
			} else {
				positional.push(tok);
			}
			continue;
		}
		positional.push(tok);
	}
	return { positional, flags };
}

function parsePositiveInt(value: string | boolean | undefined): number | undefined {
	if (typeof value !== "string") return undefined;
	const n = Number.parseInt(value, 10);
	if (!Number.isFinite(n) || n <= 0) return undefined;
	return n;
}

export function parseGrubCommand(input: string): ParsedGrubCommand {
	const raw = input.trim();
	if (!raw) {
		return { type: "help", reason: "empty" };
	}

	const { positional, flags } = tokenize(raw);
	const first = positional[0]?.toLowerCase() ?? "";

	if (first === "status" || first === "list") {
		const json = flags.json === true || flags.json === "true" || positional.includes("--json");
		return { type: "status", json };
	}
	if (first === "stop" || first === "clear" || first === "cancel") {
		return { type: "stop" };
	}
	if (first === "resume" || first === "continue") {
		return { type: "resume" };
	}
	if (first === "help") {
		return { type: "help" };
	}

	const goal = positional.join(" ").trim();
	if (!goal) {
		return { type: "help", reason: "empty" };
	}

	return {
		type: "start",
		goal,
		maxIterations: parsePositiveInt(flags["max-iter"]) ?? parsePositiveInt(flags["max-iterations"]),
		maxConsecutiveFailures: parsePositiveInt(flags["max-fail"]) ?? parsePositiveInt(flags["max-failures"]),
	};
}

export function buildGrubHelp(reason?: string, locale: GrubLocale = "en"): string {
	const text = grubText(locale);
	const lines: string[] = [];
	if (reason) {
		lines.push(`${text.prefix} ${reason}`);
	}
	lines.push(...text.usage);
	return lines.join("\n");
}
