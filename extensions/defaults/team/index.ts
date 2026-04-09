/**
 * [UPSTREAM]: Depends on core/sub-agent/*, core/workspace/*, ./team-runtime, ./team-parser, ./team-types
 * [SURFACE]: AgentTeam extension - /team commands
 * [LOCUS]: extensions/defaults/team/index.ts
 *
 * Phase B: True AgentTeam with persistent teammates.
 * Commands:
 *   /team                      - List teammates
 *   /team:spawn <role> [--name <id>] - Create teammate
 *   /team:send <name> <message>      - Send message to teammate
 *   /team:status [<name>]            - Show status
 *   /team:stop <name>                - Stop teammate turn
 *   /team:terminate <name>           - Destroy teammate
 *   /team:approve <request-id>       - Approve permission request
 *   /team:mode <name> <plan|execute|review> - Switch mode
 */

import { Box, Container, Spacer, Text } from "@pencil-agent/tui";
import type { ExtensionAPI } from "../../../core/extensions/types.js";
import { TeamRuntime } from "./team-runtime.js";
import { buildTeamHelp, parseTeamCommand } from "./team-parser.js";
import type { PersistedTeammate } from "./team-types.js";

const TEAM_MESSAGE_TYPE = "team";

// Global runtime instance
let runtime: TeamRuntime | null = null;

function getRuntime(): TeamRuntime {
	if (!runtime) {
		runtime = new TeamRuntime();
	}
	return runtime;
}

export default async function teamExtension(pi: ExtensionAPI): Promise<void> {
	const teamRuntime = getRuntime();
	await teamRuntime.load();

	pi.on("session_shutdown", async () => {
		await teamRuntime.dispose();
	});

	// Register message renderer
	pi.registerMessageRenderer(TEAM_MESSAGE_TYPE, (message, _options, theme) => {
		const text =
			typeof message.content === "string"
				? message.content
				: message.content
						.filter((part): part is { type: "text"; text: string } => part.type === "text")
						.map((part) => part.text)
						.join("\n");

		const box = new Box(1, 1, (value) => theme.bg("customMessageBg", value));
		box.addChild(new Text(theme.fg("customMessageText", text), 0, 0));

		const container = new Container();
		container.addChild(new Spacer(1));
		container.addChild(box);
		return container;
	});

	// Register commands
	const commandNames = [
		"team",
		"team:spawn",
		"team:send",
		"team:status",
		"team:stop",
		"team:terminate",
		"team:approve",
		"team:mode",
	] as const;

	for (const commandName of commandNames) {
		pi.registerCommand(commandName, {
			description: getCommandDescription(commandName),
			handler: async (args: string, ctx) => {
				const parsed = parseTeamCommand(commandName, args);

				if (!parsed) {
					ctx.ui.notify(`Invalid /team command. Use /team for usage.`, "error");
					return;
				}

				switch (parsed.command) {
					case "help": {
						pi.sendMessage({
							customType: TEAM_MESSAGE_TYPE,
							content: buildTeamHelp(),
							display: true,
						});
						break;
					}

					case "list": {
						const teammates = teamRuntime.getAllTeammates();
						const lines = formatTeammateList(teammates);
						pi.sendMessage({
							customType: TEAM_MESSAGE_TYPE,
							content: lines.join("\n"),
							display: true,
						});
						break;
					}

					case "spawn": {
						if (!parsed.role) {
							ctx.ui.notify("Usage: /team:spawn <role> [--name <name>]", "error");
							return;
						}

						pi.sendMessage({
							customType: TEAM_MESSAGE_TYPE,
							content: `Spawning ${parsed.role} teammate${parsed.name ? ` named "${parsed.name}"` : ""}...`,
							display: true,
						});

						try {
							const teammate = await teamRuntime.spawn({
								role: parsed.role,
								name: parsed.name,
								baseCwd: ctx.cwd,
							});

							const lines = [
								`Teammate spawned successfully:`,
								`  Name: ${teammate.identity.name}`,
								`  Role: ${teammate.identity.role}`,
								`  Mode: ${teammate.mode}`,
								`  Status: ${teammate.status}`,
								...(teammate.worktreePath ? [`  Worktree: ${teammate.worktreePath}`] : []),
							];

							pi.sendMessage({
								customType: TEAM_MESSAGE_TYPE,
								content: lines.join("\n"),
								display: true,
							});
						} catch (error: unknown) {
							const message = error instanceof Error ? error.message : String(error);
							ctx.ui.notify(`Failed to spawn teammate: ${message}`, "error");
						}
						break;
					}

					case "send": {
						if (!parsed.target || !parsed.message) {
							ctx.ui.notify("Usage: /team:send <name> <message>", "error");
							return;
						}

						const model = (ctx as any).model;

						pi.sendMessage({
							customType: TEAM_MESSAGE_TYPE,
							content: `Sending message to ${parsed.target}...`,
							display: true,
						});

						try {
							const result = await teamRuntime.send(parsed.target, parsed.message, model);

							if (result.success) {
								const lines = [
									`Response from ${result.teammateName} (${Math.round(result.durationMs / 1000)}s):`,
									"",
									result.response,
								];
								pi.sendMessage({
									customType: TEAM_MESSAGE_TYPE,
									content: lines.join("\n"),
									display: true,
								});
							} else {
								ctx.ui.notify(
									`Teammate ${result.teammateName} failed: ${result.error ?? "Unknown error"}`,
									"error",
								);
							}
						} catch (error: unknown) {
							const message = error instanceof Error ? error.message : String(error);
							ctx.ui.notify(`Failed to send message: ${message}`, "error");
						}
						break;
					}

					case "status": {
						if (parsed.target) {
							const teammate = teamRuntime.getTeammate(parsed.target);
							if (!teammate) {
								ctx.ui.notify(`Teammate "${parsed.target}" not found`, "error");
								return;
							}
							const lines = formatTeammateStatus(teammate);
							pi.sendMessage({
								customType: TEAM_MESSAGE_TYPE,
								content: lines.join("\n"),
								display: true,
							});
						} else {
							const teammates = teamRuntime.getAllTeammates();
							const lines = formatTeammateList(teammates);
							pi.sendMessage({
								customType: TEAM_MESSAGE_TYPE,
								content: lines.join("\n"),
								display: true,
							});
						}
						break;
					}

					case "stop": {
						if (!parsed.target) {
							ctx.ui.notify("Usage: /team:stop <name>", "error");
							return;
						}

						const success = await teamRuntime.stop(parsed.target);
						if (success) {
							pi.sendMessage({
								customType: TEAM_MESSAGE_TYPE,
								content: `Stopped ${parsed.target}'s current turn.`,
								display: true,
							});
						} else {
							ctx.ui.notify(`Teammate "${parsed.target}" not found`, "error");
						}
						break;
					}

					case "terminate": {
						if (!parsed.target) {
							ctx.ui.notify("Usage: /team:terminate <name>", "error");
							return;
						}

						const success = await teamRuntime.terminate(parsed.target);
						if (success) {
							pi.sendMessage({
								customType: TEAM_MESSAGE_TYPE,
								content: `Terminated teammate "${parsed.target}".`,
								display: true,
							});
						} else {
							ctx.ui.notify(`Teammate "${parsed.target}" not found`, "error");
						}
						break;
					}

					case "mode": {
						if (!parsed.target || !parsed.mode) {
							ctx.ui.notify("Usage: /team:mode <name> <plan|execute|review>", "error");
							return;
						}

						const result = await teamRuntime.setMode(parsed.target, parsed.mode);
						if (!result.ok) {
							ctx.ui.notify(`Teammate "${parsed.target}" not found`, "error");
							break;
						}
						if (result.pending) {
							pi.sendMessage({
								customType: TEAM_MESSAGE_TYPE,
								content:
									`Mode change for ${parsed.target} → ${parsed.mode} requires approval.\n` +
									`Approve with: /team:approve ${result.pending.requestId}`,
								display: true,
							});
						} else {
							pi.sendMessage({
								customType: TEAM_MESSAGE_TYPE,
								content: `Changed ${parsed.target}'s mode to "${parsed.mode}".`,
								display: true,
							});
						}
						break;
					}

					case "approve": {
						if (!parsed.requestId) {
							// No id → list pending requests for convenience.
							const pending = teamRuntime.getPermissionStore().listPending();
							if (pending.length === 0) {
								pi.sendMessage({
									customType: TEAM_MESSAGE_TYPE,
									content: "No pending permission requests.",
									display: true,
								});
							} else {
								const lines = ["Pending permission requests:", ""];
								for (const req of pending) {
									lines.push(`  ${req.id}`);
									lines.push(`    teammate: ${req.teammateName}`);
									lines.push(`    action:   ${req.action}`);
									lines.push(`    detail:   ${req.detail}`);
								}
								lines.push("", "Approve with: /team:approve <id>");
								pi.sendMessage({
									customType: TEAM_MESSAGE_TYPE,
									content: lines.join("\n"),
									display: true,
								});
							}
							break;
						}

						const ok = teamRuntime.approvePermission(parsed.requestId);
						if (ok) {
							pi.sendMessage({
								customType: TEAM_MESSAGE_TYPE,
								content: `Approved request ${parsed.requestId}.`,
								display: true,
							});
						} else {
							ctx.ui.notify(
								`Permission request "${parsed.requestId}" not found or already resolved.`,
								"error",
							);
						}
						break;
					}
				}
			},
		});
	}
}

function getCommandDescription(commandName: string): string {
	switch (commandName) {
		case "team:spawn":
			return "Create a persistent teammate (/team:spawn <role> [--name <name>])";
		case "team:send":
			return "Send message to a teammate (/team:send <name> <message>)";
		case "team:status":
			return "Show team or teammate status";
		case "team:stop":
			return "Stop teammate's current turn";
		case "team:terminate":
			return "Destroy a teammate";
		case "team:approve":
			return "Approve a permission request";
		case "team:mode":
			return "Switch teammate mode (/team:mode <name> <plan|execute|review>)";
		default:
			return "AgentTeam management";
	}
}

function formatTeammateList(teammates: PersistedTeammate[]): string[] {
	if (teammates.length === 0) {
		return ["No teammates. Use /team:spawn to create one."];
	}

	const lines = [
		`Team (${teammates.length} teammate${teammates.length === 1 ? "" : "s"}):`,
		"",
	];

	for (const t of teammates) {
		const statusIcon = getStatusIcon(t.status);
		lines.push(`${statusIcon} ${t.identity.name} (${t.identity.role}) - ${t.mode} mode`);
	}

	return lines;
}

function formatTeammateStatus(teammate: PersistedTeammate): string[] {
	const lines = [
		`Teammate: ${teammate.identity.name}`,
		`  ID: ${teammate.identity.id}`,
		`  Role: ${teammate.identity.role}`,
		`  Mode: ${teammate.mode}`,
		`  Status: ${teammate.status}`,
		`  Created: ${new Date(teammate.identity.createdAt).toLocaleString()}`,
		`  Last Active: ${new Date(teammate.lastActiveAt).toLocaleString()}`,
		`  Working Directory: ${teammate.cwd}`,
	];

	if (teammate.worktreePath) {
		lines.push(`  Worktree: ${teammate.worktreePath}`);
		if (teammate.worktreeBranch) {
			lines.push(`  Branch: ${teammate.worktreeBranch}`);
		}
	}

	if (teammate.lastError) {
		lines.push(`  Last Error: ${teammate.lastError}`);
	}

	lines.push(`  Messages: ${teammate.messages.length}`);

	return lines;
}

function getStatusIcon(status: PersistedTeammate["status"]): string {
	switch (status) {
		case "idle":
			return "○";
		case "running":
			return "●";
		case "stopped":
			return "◐";
		case "error":
			return "✗";
		case "terminated":
			return "⊗";
		default:
			return "?";
	}
}
