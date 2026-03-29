/**
 * [INPUT]: NanoPencil ExtensionAPI
 * [OUTPUT]: Registers lifecycle hooks that drive NanoMemEngine
 * [POS]: Thin adapter — bridges NanoPencil events to the host-agnostic engine
 *
 * This file is the ONLY module that depends on @pencil-agent/nano-pencil types.
 * For non-NanoPencil hosts, import from the package root instead.
 */

import { writeFileSync } from "node:fs";
import { basename } from "node:path";
import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, ExtensionContext } from "@pencil-agent/nano-pencil";
import { NanoMemEngine } from "./engine.js";
import { renderFullInsightsHtml } from "./full-insights-html.js";
import { renderInsightsHtml } from "./insights-html.js";
import { extractTags } from "./scoring.js";

type LlmCapableContext = ExtensionContext & {
	completeSimple?: (systemPrompt: string, userMessage: string) => Promise<string | undefined>;
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | undefined> {
	return new Promise((resolve) => {
		const timer = setTimeout(() => resolve(undefined), timeoutMs);
		promise
			.then((value) => {
				clearTimeout(timer);
				resolve(value);
			})
			.catch(() => {
				clearTimeout(timer);
				resolve(undefined);
			});
	});
}

function getProject(): string {
	const parts = process.cwd().split("/").filter(Boolean);
	return parts.length >= 2
		? `${parts[parts.length - 2]}/${parts[parts.length - 1]}`
		: parts[parts.length - 1] || "default";
}

function getMessageText(msg: { role: string; content?: unknown }): string {
	if (msg.role !== "user") return "";
	const c = msg.content;
	if (typeof c === "string") return c;
	if (Array.isArray(c)) {
		return c
			.filter((b): b is { type: string; text?: string } => typeof b === "object" && b !== null && "type" in b)
			.filter((b) => b.type === "text" && typeof b.text === "string")
			.map((b) => b.text!)
			.join("\n");
	}
	return "";
}

function getAssistantMessageText(msg: { role: string; content?: unknown }): string {
	if (msg.role !== "assistant") return "";
	const c = msg.content;
	if (!Array.isArray(c)) return "";
	return c
		.filter((b): b is { type: string; text?: string } => typeof b === "object" && b !== null && "type" in b)
		.filter((b) => b.type === "text" && typeof b.text === "string")
		.map((b) => b.text!)
		.join("\n");
}

function buildTranscript(
	messages: Array<{ role: string; content?: unknown }>,
	maxMessages = 24,
	maxChars = 12000,
): string {
	const lines: string[] = [];
	let total = 0;
	const slice = messages.slice(-maxMessages);
	for (const msg of slice) {
		const text = msg.role === "user" ? getMessageText(msg) : getAssistantMessageText(msg);
		if (!text.trim()) continue;
		const prefix = msg.role === "user" ? "User: " : "Assistant: ";
		const line = prefix + text.trim().replace(/\n/g, " ");
		if (total + line.length > maxChars) break;
		lines.push(line);
		total += line.length;
	}
	return lines.join("\n");
}

function extractObservation(
	toolName: string,
	args: Record<string, unknown>,
	result: unknown,
	isError: boolean,
): { observation?: string; lesson?: string; file?: string } {
	const filePath = (args.file_path ?? args.path ?? args.file) as string | undefined;
	switch (toolName) {
		case "read":
			return { file: filePath };
		case "edit":
			if (filePath) {
				const old = String(args.old_string ?? "").slice(0, 50);
				const nw = String(args.new_string ?? "").slice(0, 50);
				return { file: filePath, observation: `Edit ${basename(filePath)}: "${old}" -> "${nw}"` };
			}
			return {};
		case "write":
			return filePath ? { file: filePath, observation: `Write ${basename(filePath)}` } : {};
		case "bash": {
			const cmd = String(args.command ?? "").slice(0, 100);
			if (isError && typeof result === "string") return { lesson: `\`${cmd}\` failed: ${result.slice(0, 120)}` };
			return cmd ? { observation: `Run: ${cmd}` } : {};
		}
		case "grep":
		case "find":
			return { observation: `Search: ${String(args.pattern ?? args.glob ?? "")}` };
		default:
			return {};
	}
}

export default function nanomemExtension(pi: ExtensionAPI) {
	const project = getProject();
	const ctxTags = extractTags(process.cwd());
	const engine = new NanoMemEngine();

	const pendingArgs = new Map<string, Record<string, unknown>>();
	const observations: string[] = [];
	const filesModified = new Set<string>();
	const toolsUsed: Record<string, number> = {};
	const errors: string[] = [];
	let sessionId = `nm-${Date.now()}`;
	let sessionGoal: string | undefined;
	let cachedInjection: string | undefined;
	let lastInjectionAt = 0;
	let injectionRefreshInFlight: Promise<void> | undefined;

	const refreshInjection = async () => {
		if (injectionRefreshInFlight) return;
		injectionRefreshInFlight = (async () => {
			try {
				const injection = await engine.getMemoryInjection(project, ctxTags);
				cachedInjection = injection || undefined;
				lastInjectionAt = Date.now();
			} catch {
				// keep previous cache
			} finally {
				injectionRefreshInFlight = undefined;
			}
		})();
		await injectionRefreshInFlight;
	};

	pi.on("session_start", async (_event, ctx) => {
		const file = ctx.sessionManager.getSessionFile();
		if (file) sessionId = basename(file, ".jsonl");
		try {
			await engine.consolidate();
		} catch {
			/* silent */
		}
	});

	pi.on("before_agent_start", async (event) => {
		if (sessionGoal === undefined && event.prompt?.trim()) sessionGoal = event.prompt.trim().slice(0, 300);
		const cacheFresh = cachedInjection && Date.now() - lastInjectionAt < 30_000;
		if (cacheFresh) {
			void refreshInjection();
			return { systemPrompt: `${event.systemPrompt}\n\n${cachedInjection}` };
		}

		const freshInjection = await withTimeout(engine.getMemoryInjection(project, ctxTags), 600);
		if (freshInjection) {
			cachedInjection = freshInjection;
			lastInjectionAt = Date.now();
			return { systemPrompt: `${event.systemPrompt}\n\n${freshInjection}` };
		}

		void refreshInjection();
		return undefined;
	});

	pi.on("tool_execution_start", async (event) => {
		pendingArgs.set(event.toolCallId, event.args);
		toolsUsed[event.toolName] = (toolsUsed[event.toolName] || 0) + 1;
	});

	pi.on("tool_execution_end", async (event) => {
		const args = pendingArgs.get(event.toolCallId) ?? {};
		pendingArgs.delete(event.toolCallId);
		const { observation, lesson, file } = extractObservation(event.toolName, args, event.result, event.isError);

		if (file) filesModified.add(file);
		if (observation) observations.push(observation);
		if (event.isError) errors.push(lesson ?? `${event.toolName} failed`);
	});

	pi.on("agent_end", async (event, ctx) => {
		const llmCtx = ctx as LlmCapableContext;
		if (llmCtx.completeSimple) {
			engine.setLlmFn(async (systemPrompt: string, userMessage: string) => {
				const out = await llmCtx.completeSimple?.(systemPrompt, userMessage);
				return out ?? "";
			});
		}

		const transcript = buildTranscript(event.messages);
		if (!transcript.trim()) return;

		// Avoid blocking the main turn lifecycle (which delays next user message rendering).
		void (async () => {
			await engine.extractAndStore(transcript, project);
			// Always try to extract work if there's meaningful conversation
			// (not just tool activity)
			const hasSubstantialConversation = transcript.length > 100;
			const hadActivity = observations.length > 0 || errors.length > 0;
			if (hadActivity || hasSubstantialConversation) {
				await engine.extractAndStoreWork(transcript, project, sessionGoal);
			}
		})().catch(() => {
			/* silent */
		});
	});

	pi.on("session_shutdown", async () => {
		// Save episode if there was tool activity OR substantial conversation goal
		const hasActivity = observations.length > 0 || errors.length > 0;
		const hasGoal = sessionGoal && sessionGoal.length > 10;
		if (!hasActivity && !hasGoal) return;

		await engine.saveEpisode({
			sessionId,
			project,
			date: new Date().toISOString().slice(0, 10),
			summary: observations.slice(0, 10).join("; ") || sessionGoal?.slice(0, 100) || "Conversation session",
			userGoal: sessionGoal,
			filesModified: [...filesModified],
			toolsUsed: { ...toolsUsed },
			keyObservations: observations.slice(0, 20),
			errors: [...errors],
			tags: [...extractTags(project), ...extractTags([...filesModified].join(" "))],
			importance: Math.min(10, 3 + errors.length * 2 + Math.min(observations.length, 5)),
			consolidated: false,
		});
	});

	pi.registerCommand("mem-search", {
		description: "Search NanoMem memories",
		handler: async (query, ctx) => {
			const results = await engine.searchEntries(query || project);
			if (!results.length) {
				ctx.ui.notify("NanoMem: no matching memories found", "info");
				return;
			}
			for (const e of results.slice(0, 10)) ctx.ui.notify(`[${e.type}] ${(e.summary || e.detail || e.content || "").slice(0, 80)}`, "info");
		},
	});

	pi.registerCommand("mem-stats", {
		description: "NanoMem memory statistics",
		handler: async (_args, ctx) => {
			const s = await engine.getStats();
			ctx.ui.notify(
				`NanoMem: ${s.totalSessions} sessions | ${s.knowledge} knowledge | ${s.lessons} lessons | ${s.preferences} prefs | ${s.work} work | ${s.episodes} episodes`,
				"info",
			);
		},
	});

	pi.registerCommand("mem-insights", {
		description: "Generate NanoMem full insights HTML report (uses LLM when available)",
		handler: async (args, ctx) => {
			const llmCtx = ctx as LlmCapableContext;
			if (llmCtx.completeSimple) {
				engine.setLlmFn(async (systemPrompt: string, userMessage: string) => {
					const out = await llmCtx.completeSimple?.(systemPrompt, userMessage);
					return out ?? "";
				});
			}

			const outputPath = args?.trim() || "./nanomem-insights.html";
			ctx.ui.notify("NanoMem: Generating full insights report...", "info");

			const enhanced = await engine.generateEnhancedInsights();
			const html = renderFullInsightsHtml(
				({
					...enhanced.report,
					persona: enhanced.persona,
					humanInsights: enhanced.humanInsights,
					rootCauses: enhanced.rootCauses,
				} as typeof enhanced.report & {
					persona?: typeof enhanced.persona;
					humanInsights: typeof enhanced.humanInsights;
					rootCauses: typeof enhanced.rootCauses;
				}),
				engine.cfg.locale,
			);

			writeFileSync(outputPath, html, "utf-8");
			ctx.ui.notify(`NanoMem: Insights report written to ${outputPath}`, "info");
		},
	});

	// ─── Progressive Recall Agent Tools ─────────────────────────

	pi.registerTool({
		name: "nanomem_recall",
		label: "Recall Memory",
		description:
			"Retrieve full details of a specific memory entry by its ID. " +
			"Use this when you see a memory cue (name + summary) in context and need the complete information. " +
			"The ID looks like k_101, l_42, p_7, etc.",
		parameters: Type.Object({
			id: Type.String({ description: "The memory entry ID shown in [ID: xxx] cues" }),
		}),
		async execute(_toolCallId, params) {
			const entry = await engine.getEntryById(params.id);
			if (!entry) {
				return {
					content: [{ type: "text" as const, text: `No memory found with ID: ${params.id}` }],
					details: undefined,
				};
			}

			// Reinforce the entry (spaced repetition: bump accessCount, lastAccessed, strength)
			await engine.reinforceEntryById(params.id);

			const name = entry.name || "Untitled";
			const summary = entry.summary || "";
			const detail = entry.detail || entry.content || "";
			const lines = [`[${entry.type}] ${name}`];
			if (summary) lines.push("", summary);
			if (detail && detail !== summary) lines.push("", detail);
			if (entry.tags?.length) lines.push("", `Tags: ${entry.tags.join(", ")}`);

			return {
				content: [{ type: "text" as const, text: lines.join("\n") }],
				details: undefined,
			};
		},
	});

	pi.registerTool({
		name: "nanomem_search",
		label: "Search All Memories",
		description:
			"Search across ALL stored memories including dormant ones not shown in the current context. " +
			"Use this to find relevant past knowledge, lessons, preferences, or decisions " +
			"when the memory cues in context don't cover what you need.",
		parameters: Type.Object({
			query: Type.String({ description: "Search keywords or phrase" }),
			limit: Type.Optional(Type.Number({ description: "Max results (default 10)", default: 10 })),
		}),
		async execute(_toolCallId, params) {
			const limit = params.limit ?? 10;
			const results = await engine.searchAllEntries(params.query, limit);
			if (!results.length) {
				return {
					content: [{ type: "text" as const, text: `No memories found matching: ${params.query}` }],
					details: undefined,
				};
			}

			const lines = [`Found ${results.length} memories for "${params.query}":\n`];
			for (const e of results) {
				const name = e.name || "Untitled";
				const summary = e.summary || e.content?.slice(0, 100) || "";
				lines.push(`- [ID: ${e.id}] [${e.type}] **${name}**: ${summary}`);
			}
			lines.push("", "Use `nanomem_recall` with an ID to get full details.");

			return {
				content: [{ type: "text" as const, text: lines.join("\n") }],
				details: undefined,
			};
		},
	});
}
