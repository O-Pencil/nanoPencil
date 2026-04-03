/**
 * [UPSTREAM]: 
 * [SURFACE]: 
 * [LOCUS]: extensions/defaults/team/team-parser.ts - 
 * [COVENANT]: Change → update this header
 */
import type { TeamCommandMode } from "./team-types.js";

export type TeamCommand =
	| { type: "help"; reason?: string }
	| { type: "status" }
	| { type: "stop" }
	| { type: "run"; mode: TeamCommandMode; goal: string };

export function parseTeamCommand(input: string): TeamCommand {
	const trimmed = input.trim();
	if (!trimmed) {
		return { type: "help", reason: "Missing team goal." };
	}

	const [head, ...rest] = trimmed.split(/\s+/);
	const lowerHead = head.toLowerCase();
	if (lowerHead === "help") return { type: "help" };
	if (lowerHead === "status") return { type: "status" };
	if (lowerHead === "stop") return { type: "stop" };
	if (lowerHead === "research" || lowerHead === "execute" || lowerHead === "auto") {
		const goal = rest.join(" ").trim();
		if (!goal) {
			return { type: "help", reason: `Missing goal for ${lowerHead} mode.` };
		}
		return { type: "run", mode: lowerHead as TeamCommandMode, goal };
	}

	return { type: "run", mode: "auto", goal: trimmed };
}

export function buildTeamHelp(reason?: string): string {
	const lines: string[] = [];
	if (reason) lines.push(`[Team] ${reason}`);
	lines.push("[Team] Multi-agent team orchestration");
	lines.push("Usage:");
	lines.push("  /agent team <goal>");
	lines.push("  /agent team auto <goal>");
	lines.push("  /agent team research <goal>");
	lines.push("  /agent team execute <goal>");
	lines.push("  /agent team status");
	lines.push("  /agent team stop");
	lines.push("");
	lines.push("Prompt trigger:");
	lines.push('  Ask explicitly for Agent team usage, for example "You must use Agent team for this task."');
	lines.push("");
	lines.push("Modes:");
	lines.push("  auto      Let the planner decide whether to stop at research or continue through implementation and review.");
	lines.push("  research  Run planner + parallel read-only workers and return a handoff report.");
	lines.push("  execute   Run planner + research + one implementation worker + one review worker.");
	return lines.join("\n");
}
