/**
 * [WHO]: Team command parser - /team:* subcommands
 * [FROM]: No external deps
 * [TO]: Consumed by index.ts
 * [HERE]: extensions/defaults/team/team-parser.ts
 *
 * Parses /team series commands per Phase B spec:
 *   /team                      - List teammates
 *   /team:spawn <role> [--name <id>] - Create teammate
 *   /team:send <name> <message>      - Send message to teammate
 *   /team:status [<name>]            - Show status
 *   /team:stop <name>                - Stop teammate turn
 *   /team:terminate <name>           - Destroy teammate
 *   /team:approve <request-id>       - Approve permission request
 *   /team:mode <name> <plan|execute|review> - Switch mode
 */

import type { TeammateMode, TeammateRole } from "./team-types.js";

export type TeamSubcommand =
	| "list"
	| "spawn"
	| "send"
	| "status"
	| "stop"
	| "terminate"
	| "approve"
	| "mode"
	| "help";

export interface ParsedTeamCommand {
	command: TeamSubcommand;
	/** For spawn: role name */
	role?: TeammateRole;
	/** For spawn: optional name override */
	name?: string;
	/** For send/status/stop/terminate/approve/mode: target teammate name or request id */
	target?: string;
	/** For send: message content */
	message?: string;
	/** For mode: target mode */
	mode?: TeammateMode;
	/** For approve: request id */
	requestId?: string;
}

const VALID_ROLES: TeammateRole[] = ["researcher", "reviewer", "implementer", "planner", "generic"];
const VALID_MODES: TeammateMode[] = ["research", "plan", "execute", "review"];

/**
 * Parse a /team command invocation.
 */
export function parseTeamCommand(commandName: string, args = ""): ParsedTeamCommand | null {
	const trimmedArgs = args.trim();

	switch (commandName) {
		case "team":
			if (!trimmedArgs) {
				return { command: "list" };
			}
			if (trimmedArgs === "help") {
				return { command: "help" };
			}
			// Try to parse as subcommand with colon syntax fallback
			if (trimmedArgs.startsWith("spawn ")) {
				return parseSpawnArgs(trimmedArgs.slice(6));
			}
			if (trimmedArgs.startsWith("send ")) {
				return parseSendArgs(trimmedArgs.slice(5));
			}
			if (trimmedArgs.startsWith("status")) {
				return parseStatusArgs(trimmedArgs.slice(6).trim());
			}
			if (trimmedArgs.startsWith("stop ")) {
				return { command: "stop", target: trimmedArgs.slice(5).trim() };
			}
			if (trimmedArgs.startsWith("terminate ")) {
				return { command: "terminate", target: trimmedArgs.slice(10).trim() };
			}
			if (trimmedArgs === "approve") {
				return { command: "approve" };
			}
			if (trimmedArgs.startsWith("approve ")) {
				return { command: "approve", requestId: trimmedArgs.slice(8).trim() || undefined };
			}
			if (trimmedArgs.startsWith("mode ")) {
				return parseModeArgs(trimmedArgs.slice(5));
			}
			// If just a name, treat as list filter (or could be status)
			return { command: "list" };

		case "team:spawn":
			return parseSpawnArgs(trimmedArgs);
		case "team:send":
			return parseSendArgs(trimmedArgs);
		case "team:status":
			return parseStatusArgs(trimmedArgs);
		case "team:stop":
			return trimmedArgs ? { command: "stop", target: trimmedArgs } : null;
		case "team:terminate":
			return trimmedArgs ? { command: "terminate", target: trimmedArgs } : null;
		case "team:approve":
			return trimmedArgs ? { command: "approve", requestId: trimmedArgs } : { command: "approve" };
		case "team:mode":
			return parseModeArgs(trimmedArgs);
		default:
			return null;
	}
}

function parseSpawnArgs(rawArgs: string): ParsedTeamCommand | null {
	const parts = rawArgs.trim().split(/\s+/);
	if (parts.length === 0) return null;

	const role = parts[0] as TeammateRole;
	if (!VALID_ROLES.includes(role)) {
		return null;
	}

	let name: string | undefined;
	for (let i = 1; i < parts.length; i++) {
		if (parts[i] === "--name" && i + 1 < parts.length) {
			name = parts[i + 1];
			i++;
		}
	}

	return { command: "spawn", role, name };
}

function parseSendArgs(rawArgs: string): ParsedTeamCommand | null {
	const trimmed = rawArgs.trim();
	const spaceIdx = trimmed.indexOf(" ");
	if (spaceIdx === -1) {
		// No message provided
		return null;
	}

	const target = trimmed.slice(0, spaceIdx);
	const message = trimmed.slice(spaceIdx + 1).trim();
	if (!target || !message) return null;

	return { command: "send", target, message };
}

function parseStatusArgs(rawArgs: string): ParsedTeamCommand | null {
	const target = rawArgs.trim();
	return { command: "status", target: target || undefined };
}

function parseModeArgs(rawArgs: string): ParsedTeamCommand | null {
	const parts = rawArgs.trim().split(/\s+/);
	if (parts.length < 2) return null;

	const target = parts[0];
	const mode = parts[1] as TeammateMode;
	if (!VALID_MODES.includes(mode)) {
		return null;
	}

	return { command: "mode", target, mode };
}

/**
 * Build help text for /team commands.
 */
export function buildTeamHelp(): string {
	return `
Team Commands (Phase B - AgentTeam):
  /team                           - List all teammates
  /team:spawn <role> [--name <n>] - Create a persistent teammate
  /team:send <name> <message>     - Send message to a teammate
  /team:status [<name>]           - Show team or teammate status
  /team:stop <name>               - Stop teammate's current turn
  /team:terminate <name>          - Destroy a teammate
  /team:approve <request-id>      - Approve a permission request
  /team:mode <name> <mode>        - Switch teammate mode

Roles: researcher, reviewer, implementer, planner, generic
Modes: research, plan, execute, review

Examples:
  /team:spawn implementer --name alice
  /team:send alice "Implement login feature"
  /team:status alice
  /team:mode alice execute
  /team:terminate alice
`.trim();
}
