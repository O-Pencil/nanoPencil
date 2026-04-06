/**
 * [UPSTREAM]: Depends on core/sub-agent/*, core/workspace/*
 * [SURFACE]: SubAgent extension - /subagent commands
 * [LOCUS]: extensions/defaults/subagent/index.ts
 */

import type { ExtensionAPI } from "../../../core/extensions/types.js";
import { SubAgentRunner } from "./subagent-runner.js";
import { buildSubAgentHelp, parseSubAgentCommand } from "./subagent-parser.js";
import type { SubAgentRunReport } from "./subagent-types.js";

const SUBAGENT_MESSAGE_TYPE = "subagent";

// Global runner instance
let runner: SubAgentRunner | null = null;
let lastReport: SubAgentRunReport | null = null;

function getRunner(): SubAgentRunner {
	if (!runner) {
		runner = new SubAgentRunner();
	}
	return runner;
}

export default async function subagentExtension(pi: ExtensionAPI): Promise<void> {
	pi.registerCommand("subagent", {
		description: "SubAgent orchestration (/subagent run, stop, status, report)",
		handler: async (args: string, ctx) => {
			const input = "/subagent" + (args ? " " + args : "");
			const parsed = parseSubAgentCommand(input);

			if (!parsed) {
				ctx.ui.notify("Invalid /subagent command. Use /subagent help for usage.", "error");
				return;
			}

			const subRunner = getRunner();

			switch (parsed.command) {
				case "help": {
					pi.sendMessage({ customType: SUBAGENT_MESSAGE_TYPE, content: buildSubAgentHelp(), display: true });
					break;
				}

				case "run": {
					if (!parsed.task) {
						ctx.ui.notify("Usage: /subagent run <task> [--write]", "error");
						return;
					}

					// Get model from main session to reuse auth
					const model = (ctx as any).model;

					pi.sendMessage({
						customType: SUBAGENT_MESSAGE_TYPE,
						content: `Starting SubAgent run (${parsed.options?.write ? "with write access" : "read-only"})...\n\nTask: ${parsed.task}${model ? `\nModel: ${model.id ?? model.name ?? "unknown"}` : ""}`,
						display: true,
					});

					try {
						const report = await subRunner.run(parsed.task, {
							runRole: parsed.options?.write ? "implement" : "research",
							model,
						});
						lastReport = report;

						const content = report.success
							? `SubAgent run completed in ${Math.round(report.duration / 1000)}s:\n\n${report.summary}`
							: `SubAgent run failed: ${report.summary || "Unknown error"}`;

						pi.sendMessage({
							customType: SUBAGENT_MESSAGE_TYPE,
							content,
							display: true,
							details: report,
						});
					} catch (error: unknown) {
						const message = error instanceof Error ? error.message : String(error);
						ctx.ui.notify(`Error: ${message}`, "error");
					}
					break;
				}

				case "stop": {
					await subRunner.stop();
					pi.sendMessage({
						customType: SUBAGENT_MESSAGE_TYPE,
						content: "Stopping SubAgent run...",
						display: true,
					});
					break;
				}

				case "status": {
					const statusText = subRunner.getStatusText();
					pi.sendMessage({
						customType: SUBAGENT_MESSAGE_TYPE,
						content: statusText,
						display: true,
					});
					break;
				}

				case "report": {
					if (lastReport) {
						const lines = [
							"Last SubAgent Report:",
							"",
							`Run ID: ${lastReport.runId}`,
							`Duration: ${Math.round(lastReport.duration / 1000)}s`,
							`Success: ${lastReport.success ? "Yes" : "No"}`,
							"",
							"Summary:",
							lastReport.summary || "(no summary)",
						];
						pi.sendMessage({
							customType: SUBAGENT_MESSAGE_TYPE,
							content: lines.join("\n"),
							display: true,
							details: lastReport,
						});
					} else {
						pi.sendMessage({
							customType: SUBAGENT_MESSAGE_TYPE,
							content: "No SubAgent report available.",
							display: true,
						});
					}
					break;
				}
			}
		},
	});
}
