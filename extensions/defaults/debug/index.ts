/**
 * [WHO]: debugExtension - registers /debug command and DEBUG_MESSAGE_TYPE renderer
 * [FROM]: Depends on core/extensions/types, @pencil-agent/tui, ./collectors
 * [TO]: Auto-loaded by builtin-extensions.ts as a default extension
 * [HERE]: extensions/defaults/debug/index.ts - system diagnostics with three-layer analysis
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
const DEBUG_TIMEOUT_MS = 45_000;

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
- If a diagnostic collection failed, treat that failure itself as a diagnostic signal`;

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
// Full diagnostic flow
// ============================================================================

async function handleFullDiagnostic(
	args: string,
	ctx: ExtensionCommandContext,
	api: ExtensionAPI,
): Promise<void> {
	const parsed = parseDebugArgs(args);

	// Show status indicator
	ctx.ui.setStatus("debug", "Collecting diagnostics...");

	try {
		// Collect all categories in parallel
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

		// Build user message for LLM
		const parts: string[] = [];
		if (parsed.issueDescription) {
			parts.push(`## User-Reported Issue\n${parsed.issueDescription}\n`);
		}
		parts.push("## Collected Diagnostics\n");
		parts.push(formatDiagnosticData(data));
		const userMessage = parts.join("\n");

		// Call LLM with timeout
		const response = await Promise.race([
			ctx.completeSimple(DEBUG_SYSTEM_PROMPT, userMessage),
			new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), DEBUG_TIMEOUT_MS)),
		]);

		ctx.ui.setStatus("debug", undefined);

		if (response) {
			api.sendMessage({
				customType: DEBUG_MESSAGE_TYPE,
				content: response,
				display: true,
			});
		} else {
			// LLM unavailable — show raw data as fallback
			api.sendMessage({
				customType: DEBUG_MESSAGE_TYPE,
				content: `**LLM analysis unavailable** (timeout or no API key). Raw diagnostics:\n\n${formatDiagnosticData(data)}`,
				display: true,
			});
		}
	} catch (error) {
		ctx.ui.setStatus("debug", undefined);
		const message = error instanceof Error ? error.message : String(error);
		ctx.ui.notify(`Debug error: ${message}`, "error");
	}
}

// ============================================================================
// Quick subcommand — show raw data without LLM
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
	// Register debug message renderer (same pattern as btw)
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

	// Register /debug command
	api.registerCommand("debug", {
		description: "Run system diagnostics with three-layer analysis (/debug [env|session|model|<issue>])",
		handler: (args, ctx) => handleDebugCommand(args, ctx, api),
	});
}
