/**
 * [WHO]: debugExtension - /debug command, before_agent_start hook injects diagnostic system prompt, agent_end cleanup, dispatched via sendUserMessage for streaming UX
 * [FROM]: Depends on core/extensions/types, @pencil-agent/tui, ./collectors
 * [TO]: Auto-loaded by builtin-extensions.ts as a default extension
 * [HERE]: extensions/defaults/debug/index.ts - system diagnostics with three-layer analysis through full agent loop
 */

import { Box, Container, Spacer, Text, type Component } from "@pencil-agent/tui";
import type { ExtensionAPI, ExtensionCommandContext } from "../../../core/extensions/types.js";
import {
	type DiagnosticData,
	collectSystemInfo,
	collectModelInfo,
	collectSessionInfo,
	collectConfigInfo,
	collectGitInfo,
	collectAgentState,
	sanitizeForLLM,
	formatDiagnosticData,
} from "./collectors.js";

const DEBUG_MESSAGE_TYPE = "debug";
const DEBUG_PROMPT_PREFIX = "[DEBUG:";
const DEBUG_TAG = "[DEBUG]";

const DEBUG_SYSTEM_PROMPT = `You are a diagnostic analyst for nanoPencil (a terminal-native AI coding agent).
Analyze the provided system state and produce a structured three-layer diagnostic report.

Output format (use these exact section headers):

### Layer 1: Phenomenon (现象层) — "What's observable"
- Surface symptoms from the data
- Current state snapshot summary
- Environment conditions
- Any errors, warnings, or anomalies visible in the collected data
- If a diagnostic category failed to collect, note it as a symptom

### Layer 2: Essence (本质层) — "Why it breaks"
- Root cause chain analysis
- Dependency or coupling issues
- Violated invariants or misconfigurations
- Reference relevant file paths or config keys where applicable

### Layer 3: Philosophy (哲学层) — "How to design it right"
- Design principles at stake
- Long-term cost analysis of the current state
- Actionable remediation steps (numbered list, at least 3 items)
- Prevention strategies

Rules:
- Be direct and analytical — no filler
- If the user provided an issue description, focus analysis on that issue
- If no specific issue, perform a general health assessment
- Use concise language; prefer tables and bullet lists over prose
- If a diagnostic collection failed, treat that failure itself as a diagnostic signal
- Do NOT use any tools — this is a pure analysis task`;

// ============================================================================
// Pending diagnostic state (set by command handler, consumed by hooks)
// ============================================================================

let pendingDiagnosticPrompt: string | undefined;

function isDebugPrompt(text: string): boolean {
	return text.startsWith(DEBUG_PROMPT_PREFIX);
}

// ============================================================================
// Subcommand parsing
// ============================================================================

type DebugSubCommand = "full" | "env" | "session" | "model";

interface ParsedDebugArgs {
	subcommand: DebugSubCommand;
	issueDescription?: string;
}

function parseDebugArgs(args: string): ParsedDebugArgs {
	const trimmed = args.trim().toLowerCase();
	if (trimmed === "env") return { subcommand: "env" };
	if (trimmed === "session") return { subcommand: "session" };
	if (trimmed === "model") return { subcommand: "model" };
	return { subcommand: "full", issueDescription: args.trim() || undefined };
}

// ============================================================================
// Full diagnostic flow — collect then dispatch through agent loop
// ============================================================================

async function handleFullDiagnostic(
	args: string,
	ctx: ExtensionCommandContext,
	api: ExtensionAPI,
): Promise<void> {
	const parsed = parseDebugArgs(args);

	ctx.ui.setStatus("debug", "Collecting diagnostics...");

	try {
		const [system, model, session, config, git, agent] = await Promise.allSettled([
			collectSystemInfo(),
			collectModelInfo(ctx),
			collectSessionInfo(ctx),
			collectConfigInfo(ctx),
			collectGitInfo(ctx.cwd),
			collectAgentState(ctx),
		]);

		const raw: DiagnosticData = {
			system: system.status === "fulfilled" ? system.value : { data: null, error: String(system.reason) },
			model: model.status === "fulfilled" ? model.value : { data: null, error: String(model.reason) },
			session: session.status === "fulfilled" ? session.value : { data: null, error: String(session.reason) },
			config: config.status === "fulfilled" ? config.value : { data: null, error: String(config.reason) },
			git: git.status === "fulfilled" ? git.value : { data: null, error: String(git.reason) },
			agent: agent.status === "fulfilled" ? agent.value : { data: null, error: String(agent.reason) },
		};

		const data = sanitizeForLLM(raw);

		ctx.ui.setStatus("debug", undefined);

		const parts: string[] = [];
		parts.push(`${DEBUG_TAG} Perform a three-layer diagnostic analysis.`);
		if (parsed.issueDescription) {
			parts.push(`\nUser-Reported Issue: ${parsed.issueDescription}`);
		}
		parts.push(`\nCollected Diagnostics:\n`);
		parts.push(formatDiagnosticData(data));

		const prompt = `${DEBUG_PROMPT_PREFIX}${Date.now()}]\n${parts.join("\n")}`;
		pendingDiagnosticPrompt = prompt;

		api.sendUserMessage(prompt, { deliverAs: "followUp" });
	} catch (error) {
		ctx.ui.setStatus("debug", undefined);
		const message = error instanceof Error ? error.message : String(error);
		ctx.ui.notify(`Debug error: ${message}`, "error");
	}
}

// ============================================================================
// Quick subcommand — show raw data without agent loop
// ============================================================================

async function handleQuickSub(
	subcommand: "env" | "session" | "model",
	ctx: ExtensionCommandContext,
	api: ExtensionAPI,
): Promise<void> {
	let result: string;

	switch (subcommand) {
		case "env": {
			const info = await collectSystemInfo();
			result = info.data
				? `| System | |\n|---|---|\n${Object.entries(info.data)
						.map(([k, v]) => `| ${k} | ${v} |`)
						.join("\n")}`
				: `> Collection failed: ${info.error}`;
			break;
		}
		case "session": {
			const info = await collectSessionInfo(ctx);
			result = info.data
				? `| Session | |\n|---|---|\n${Object.entries(info.data)
						.map(([k, v]) => `| ${k} | ${v} |`)
						.join("\n")}`
				: `> Collection failed: ${info.error}`;
			break;
		}
		case "model": {
			const info = await collectModelInfo(ctx);
			result = info.data
				? `| Model | |\n|---|---|\n${Object.entries(info.data)
						.map(([k, v]) => `| ${k} | ${v} |`)
						.join("\n")}`
				: `> Collection failed: ${info.error}`;
			break;
		}
	}

	api.sendMessage({
		customType: DEBUG_MESSAGE_TYPE,
		content: result,
		display: true,
	});
}

// ============================================================================
// Command handler
// ============================================================================

async function handleDebugCommand(args: string, ctx: ExtensionCommandContext, api: ExtensionAPI): Promise<void> {
	const parsed = parseDebugArgs(args);

	if (parsed.subcommand !== "full") {
		await handleQuickSub(parsed.subcommand, ctx, api);
	} else {
		await handleFullDiagnostic(args, ctx, api);
	}
}

// ============================================================================
// Extension entry
// ============================================================================

export default async function debugExtension(api: ExtensionAPI): Promise<void> {
	api.registerMessageRenderer(DEBUG_MESSAGE_TYPE, (message, _options, theme): Component => {
		const text =
			typeof message.content === "string"
				? message.content
				: message.content
						.filter((part): part is { type: "text"; text: string } => part.type === "text")
						.map((part) => part.text)
						.join("\n");

		const box = new Box(1, 1, (v) => theme.bg("customMessageBg", v));
		box.addChild(new Text(theme.fg("dim", text), 0, 0));

		const container = new Container();
		container.addChild(new Spacer(1));
		container.addChild(box);
		return container;
	});

	api.on("before_agent_start", (event) => {
		if (!isDebugPrompt(event.prompt)) return;
		return { appendSystemPrompt: DEBUG_SYSTEM_PROMPT };
	});

	api.on("agent_end", () => {
		if (pendingDiagnosticPrompt) {
			pendingDiagnosticPrompt = undefined;
		}
	});

	api.registerCommand("debug", {
		description: "Run system diagnostics (/debug [env|session|model|preferences|<issue>])",
		handler: (args, ctx) => handleDebugCommand(args, ctx, api),
	});

	// Register /set-locale command
	api.registerCommand("set-locale", {
		description: "Set language preference (/set-locale zh|en)",
		handler: async (args, ctx) => {
			const trimmed = args.trim().toLowerCase();
			if (trimmed !== "zh" && trimmed !== "en") {
				ctx.ui.notify("Usage: /set-locale zh or /set-locale en", "info");
				return;
			}

			// Get memory directory
			const os = await import("node:os");
			const fs = await import("node:fs");
			const path = await import("node:path");
			const memoryDir = process.env.NANOMEM_MEMORY_DIR || path.join(os.homedir(), ".nanopencil", "agent", "memory");
			const prefsPath = path.join(memoryDir, "preferences.json");

			try {
				let prefs: Record<string, unknown>[] = [];
				if (fs.existsSync(prefsPath)) {
					prefs = JSON.parse(fs.readFileSync(prefsPath, "utf-8"));
				}

				// Check if language preference already exists
				const existingIndex = prefs.findIndex((p) => {
					const name = (p.name as string) || "";
					return name.includes("用户偏好") || name.includes("language preference") || name.includes("locale");
				});

				const newPref = {
					id: `set-locale-${Date.now()}`,
					type: "preference",
					name: trimmed === "zh" ? "用户偏好中文" : "Language Preference (English)",
					summary: trimmed === "zh" ? "用户希望我用中文回复" : "User prefers English",
					detail: trimmed === "zh" ? "用户通过 /set-locale 命令明确设置语言为中文" : "User explicitly set language to English via /set-locale command",
					content: trimmed === "zh" ? "用户希望用中文回复" : "User prefers English responses",
					tags: ["locale", "language", trimmed === "zh" ? "中文" : "english"],
					importance: 10,
					strength: 1000,
					created: new Date().toISOString(),
					eventTime: new Date().toISOString(),
					accessCount: 0,
					retention: "core",
					salience: 10,
					stability: "stable",
					relations: [],
				};

				if (existingIndex >= 0) {
					prefs[existingIndex] = newPref;
				} else {
					prefs.push(newPref);
				}

				fs.writeFileSync(prefsPath, JSON.stringify(prefs, null, 2));
				ctx.ui.notify(`Locale set to ${trimmed === "zh" ? "中文" : "English"}. Restart or run /debug preferences to verify.`, "info");
			} catch (error) {
				ctx.ui.notify(`Failed to set locale: ${error}`, "error");
			}
		},
	});
}
