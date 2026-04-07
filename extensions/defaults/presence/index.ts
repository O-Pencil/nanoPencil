/**
 * [WHO]: Extension interface, AI-driven personalized greetings and idle cues
 * [FROM]: Depends on @pencil-agent/tui, @pencil-agent/mem-core, core/extensions/types.js, core/i18n
 * [TO]: Loaded by core/extensions/loader.ts as extension entry point
 * [HERE]: extensions/defaults/presence/index.ts - AI-generated presence messages with memory context, configurable via settings.presence.enabled
 */

import { Box, Container, Spacer, Text } from "@pencil-agent/tui";
import type { ExtensionAPI, ExtensionContext, SessionReadyEvent, SessionStartEvent } from "../../../core/extensions/types.js";
import { t, getLocale } from "../../../core/i18n/index.js";
import { join } from "node:path";
import { homedir } from "node:os";

const PRESENCE_MESSAGE_TYPE = "presence";
const OPENING_DELAY_MS = 1200;
const IDLE_POLL_MS = 15000;
const LONG_IDLE_MS = 4 * 60 * 1000;
const GREETING_TIMEOUT_MS = 8000;

// Fallback messages for when AI generation fails or memory is empty
function getFallbackOpeningLines(locale?: "en" | "zh"): string[] {
	const useLocale = locale || getLocale();
	const lines = t("msg.presence.opening");
	if (Array.isArray(lines)) return lines;
	// More human-like fallback messages
	if (useLocale === "zh") {
		return [
			"来了啊。",
			"嘿，有什么想做的吗？",
			"准备开始吧。",
			"随时可以开始。",
			"有什么要聊聊的吗？",
		];
	}
	return [
		"Hey, what's up?",
		"Ready when you are.",
		"What do you want to work on?",
		"Any ideas?",
		"Let's do this.",
	];
}

function getFallbackIdleLines(locale?: "en" | "zh"): string[] {
	const useLocale = locale || getLocale();
	const lines = t("msg.presence.idle");
	if (Array.isArray(lines)) return lines;
	if (useLocale === "zh") {
		return [
			"还在，有需要随时说。",
			"不急，慢慢来。",
			"我在，随时继续。",
			"有空了就继续吧。",
			"没关系的，想什么时候继续都行。",
		];
	}
	return [
		"Still here when you need me.",
		"No rush, take your time.",
		"Ready when you are.",
		"I'll be here.",
		"Whenever you're ready.",
	];
}

type PresenceState = {
	lastActivityAt: number;
	idleReminderSent: boolean;
	openingStartedAt?: number;
	openingSent: boolean;
	openingTimer?: ReturnType<typeof setTimeout>;
	idleTimer?: ReturnType<typeof setInterval>;
	unsubscribeInput?: () => void;
	memEngine?: import("@pencil-agent/mem-core").NanoMemEngine;
	lastGreeting?: string; // Store greeting for agent context injection
	greetingInjected?: boolean; // Track if greeting was injected to agent context
};

function createState(): PresenceState {
	return {
		lastActivityAt: Date.now(),
		idleReminderSent: false,
		openingSent: false,
	};
}

function touch(state: PresenceState): void {
	state.lastActivityAt = Date.now();
	state.idleReminderSent = false;
}

function clearTimers(state: PresenceState): void {
	if (state.openingTimer) {
		clearTimeout(state.openingTimer);
		state.openingTimer = undefined;
	}
	if (state.idleTimer) {
		clearInterval(state.idleTimer);
		state.idleTimer = undefined;
	}
	state.unsubscribeInput?.();
	state.unsubscribeInput = undefined;
}

function getMemoryDir(): string {
	// Use the same memory directory as the main app
	return process.env.NANOMEM_MEMORY_DIR || join(homedir(), ".nanomem", "memory");
}

async function initMemEngine(state: PresenceState): Promise<void> {
	if (state.memEngine) return;
	try {
		// Dynamic import for bundled package compatibility
		const { NanoMemEngine, getConfig } = await import("@pencil-agent/mem-core");
		const memoryDir = getMemoryDir();
		const config = getConfig({ memoryDir, locale: getLocale() === "zh" ? "zh" : "en" });
		state.memEngine = new NanoMemEngine(config);
	} catch {
		// NanoMem not available, use fallback messages
		state.memEngine = undefined;
	}
}

function getProject(): string {
	const parts = process.cwd().split("/").filter(Boolean);
	return parts.length >= 2
		? `${parts[parts.length - 2]}/${parts[parts.length - 1]}`
		: parts[parts.length - 1] || "default";
}

// Detect user's language preference from memory
async function detectLanguageFromMemory(state: PresenceState): Promise<"en" | "zh" | undefined> {
	if (!state.memEngine) return undefined;

	try {
		// Get all entries
		const entries = await state.memEngine.getAllEntries();
		const preferences = [
			...entries.knowledge.filter((e) => e.type === "preference" || e.tags.includes("preference")),
			...entries.lessons.filter((e) => e.type === "preference" || e.tags.includes("preference")),
		];

		// Also search for language-related entries
		try {
			const langResults = await state.memEngine.searchEntries("language 语言 中文 Chinese");
			for (const entry of langResults) {
				if (entry.type === "preference" || entry.tags.some((t) => ["language", "语言", "locale"].includes(t))) {
					preferences.push(entry);
				}
			}
		} catch { /* ignore */ }

		// Check preference content for language indicators
		for (const pref of preferences) {
			const text = `${pref.name || ""} ${pref.summary || ""} ${pref.detail || ""} ${pref.content || ""}`.toLowerCase();

			// Check for Chinese preference
			if (/中文|chinese|zh-hans|mandarin|普通话/.test(text)) {
				if (!text.includes("don't") && !text.includes("no chinese") && !text.includes("不用中文")) {
					return "zh";
				}
			}

			// Check for explicit English preference
			if (/英文|english|en-us/.test(text)) {
				if (!text.includes("don't") && !text.includes("no english") && !text.includes("不用英文")) {
					return "en";
				}
			}
		}

		// Check recent episodes for language patterns
		const episodes = await state.memEngine.getAllEpisodes();
		const recentEpisodes = episodes.slice(-10);

		let chineseContent = 0;
		let englishContent = 0;

		for (const ep of recentEpisodes) {
			const text = ep.summary || ep.userGoal || "";
			const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
			if (chineseChars > 5) chineseContent++;
			if (/^[a-zA-Z\s.,!?'"()-]+$/.test(text.slice(0, 50))) englishContent++;
		}

		if (chineseContent > englishContent) return "zh";
		if (englishContent > chineseContent && englishContent > 2) return "en";

		return undefined;
	} catch {
		return undefined;
	}
}

async function buildGreetingPrompt(state: PresenceState, detectedLocale: "en" | "zh"): Promise<string | undefined> {
	if (!state.memEngine) return undefined;

	try {
		// Get recent episodes for context
		const episodes = await state.memEngine.getAllEpisodes();
		const recentEpisodes = episodes
			.filter((ep) => ep.date && !ep.consolidated)
			.sort((a, b) => {
				const aTime = a.endedAt || a.startedAt || "";
				const bTime = b.endedAt || b.startedAt || "";
				return bTime.localeCompare(aTime);
			})
			.slice(0, 3);

		// Get user preferences
		const stats = await state.memEngine.getStats();
		const project = getProject();
		const now = new Date();
		const timeOfDay = now.getHours() < 12 ? "morning" : now.getHours() < 18 ? "afternoon" : "evening";

		if (detectedLocale === "zh") {
			const lines: string[] = [
				"你是一个程序员的好搭档，根据用户的记忆上下文，生成一句开场问候语。",
				"",
				"要求:",
				"- 像老朋友一样自然，不要太正式",
				"- 简短随意，1-2句话就好",
				"- 如果有上次聊天的上下文，可以提一句",
				"- 语气轻松，像同事打招呼",
				"",
				"当前信息:",
				`项目: ${project}`,
				`时间: ${now.toLocaleDateString("zh-CN", { weekday: "long", hour: "2-digit", minute: "2-digit" })}`,
			];

			if (recentEpisodes.length > 0) {
				lines.push("", "最近在做:");
				for (const ep of recentEpisodes.slice(0, 2)) {
					const summary = ep.summary?.slice(0, 80) || "无摘要";
					lines.push(`- ${summary}`);
				}
			}

			lines.push("", "直接说问候语，别加引号。");

			return lines.join("\n");
		} else {
			const lines: string[] = [
				"You're a developer's coding buddy. Generate a casual opening greeting based on the user's memory context.",
				"",
				"Requirements:",
				"- Sound like a friend, not formal",
				"- Keep it short and casual, 1-2 sentences",
				"- If there's recent context, mention it naturally",
				"- Relaxed tone, like a coworker saying hi",
				"",
				"Current info:",
				`Project: ${project}`,
				`Time: ${now.toLocaleDateString("en-US", { weekday: "long", hour: "2-digit", minute: "2-digit" })} (${timeOfDay})`,
			];

			if (recentEpisodes.length > 0) {
				lines.push("", "Recently worked on:");
				for (const ep of recentEpisodes.slice(0, 2)) {
					const summary = ep.summary?.slice(0, 80) || "No summary";
					lines.push(`- ${summary}`);
				}
			}

			lines.push("", "Just say the greeting, no quotes.");

			return lines.join("\n");
		}
	} catch {
		return undefined;
	}
}

async function generateGreeting(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: PresenceState,
): Promise<string> {
	// Detect language from memory, fallback to settings
	const detectedLocale = await detectLanguageFromMemory(state);
	const locale = detectedLocale || getLocale();

	// Try AI-generated greeting
	const prompt = await buildGreetingPrompt(state, locale as "en" | "zh");
	if (!prompt) {
		return pickLine(getFallbackOpeningLines(locale as "en" | "zh"), Date.now());
	}

	// Use completeSimple to generate greeting - make it sound human
	const systemPrompt = locale === "zh"
		? "你是个程序员的好朋友，现在来打个招呼。说得随意自然点。"
		: "You're a developer's coding buddy saying hi. Keep it casual and human.";

	try {
		const greeting = await ctx.completeSimple(systemPrompt, prompt);
		if (greeting && greeting.trim().length > 0 && greeting.trim().length < 200) {
			return greeting.trim();
		}
	} catch {
		// Fall through to fallback
	}

	// Fallback to static messages
	return pickLine(getFallbackOpeningLines(locale as "en" | "zh"), Date.now());
}

function countConversationEntries(ctx: ExtensionContext): number {
	return ctx.sessionManager
		.getEntries()
		.filter((entry) => entry.type === "message" || entry.type === "custom_message").length;
}

function getLastConversationTimestamp(ctx: ExtensionContext): number | undefined {
	const entries = ctx.sessionManager.getEntries();
	for (let i = entries.length - 1; i >= 0; i -= 1) {
		const entry = entries[i];
		if (entry.type !== "message" && entry.type !== "custom_message") continue;
		const timestamp = Date.parse(entry.timestamp);
		if (Number.isFinite(timestamp)) {
			return timestamp;
		}
	}
	return undefined;
}

function hasDraftText(ctx: ExtensionContext): boolean {
	if (!ctx.hasUI) return false;
	try {
		return ctx.ui.getEditorText().trim().length > 0;
	} catch {
		return false;
	}
}

function canSendPresence(ctx: ExtensionContext): boolean {
	return ctx.hasUI && ctx.isIdle() && !ctx.hasPendingMessages() && !hasDraftText(ctx);
}

function canSendOpening(ctx: ExtensionContext): boolean {
	return ctx.hasUI && !hasDraftText(ctx);
}

function pickLine(lines: readonly string[], seed: number): string {
	const index = Math.abs(seed) % lines.length;
	return lines[index] ?? lines[0]!;
}

function sendPresence(pi: ExtensionAPI, state: PresenceState, line: string): void {
	pi.sendMessage({
		customType: PRESENCE_MESSAGE_TYPE,
		content: line,
		display: true,
	});
	state.lastGreeting = line; // Store for agent context injection
	state.greetingInjected = false;
	touch(state);
}

async function maybeSendOpening(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: PresenceState,
): Promise<boolean> {
	if (state.openingSent) return true;
	if (!canSendOpening(ctx)) return false;

	// Initialize memory engine if not already done
	await initMemEngine(state);

	// Generate AI-powered greeting
	const greeting = await generateGreeting(pi, ctx, state);
	sendPresence(pi, state, greeting);
	state.openingSent = true;
	return true;
}

function scheduleOpening(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: PresenceState,
	delayMs: number,
): void {
	state.openingTimer = setTimeout(async () => {
		const sent = await maybeSendOpening(pi, ctx, state);
		if (sent) {
			state.openingTimer = undefined;
			return;
		}
		if (!state.openingStartedAt || Date.now() - state.openingStartedAt >= GREETING_TIMEOUT_MS) {
			state.openingTimer = undefined;
			return;
		}
		scheduleOpening(pi, ctx, state, 500);
	}, delayMs);
}

function maybeSendIdleReminder(pi: ExtensionAPI, ctx: ExtensionContext, state: PresenceState): void {
	if (state.idleReminderSent) return;
	if (!canSendPresence(ctx)) return;
	if (Date.now() - state.lastActivityAt < LONG_IDLE_MS) return;
	const locale = getLocale() as "en" | "zh";
	sendPresence(pi, state, pickLine(getFallbackIdleLines(locale), state.lastActivityAt));
	state.idleReminderSent = true;
}

function startPresenceLoop(
	pi: ExtensionAPI,
	_event: SessionStartEvent,
	ctx: ExtensionContext,
	state: PresenceState,
): void {
	clearTimers(state);
	touch(state);
	state.openingSent = false;
	state.openingStartedAt = Date.now();

	// Check if presence is enabled (default: true for backward compatibility)
	const settings = ctx.getSettings?.();
	const presenceEnabled = settings?.presence?.enabled ?? true;
	if (!presenceEnabled) return;

	if (!ctx.hasUI) return;

	state.unsubscribeInput = ctx.ui.onTerminalInput((data) => {
		if (data.length > 0) {
			touch(state);
		}
		return undefined;
	});

	state.idleTimer = setInterval(() => {
		maybeSendIdleReminder(pi, ctx, state);
	}, IDLE_POLL_MS);
}

function handleSessionReady(
	pi: ExtensionAPI,
	_event: SessionReadyEvent,
	ctx: ExtensionContext,
	state: PresenceState,
): void {
	if (!ctx.hasUI || state.openingSent) return;
	// Check if presence is enabled (default: true)
	const settings = ctx.getSettings?.();
	const presenceEnabled = settings?.presence?.enabled ?? true;
	if (!presenceEnabled) return;
	state.openingStartedAt = Date.now();
	scheduleOpening(pi, ctx, state, OPENING_DELAY_MS);
}

export default async function presenceExtension(pi: ExtensionAPI) {
	const state = createState();

	pi.registerMessageRenderer(PRESENCE_MESSAGE_TYPE, (message, _options, theme) => {
		const text =
			typeof message.content === "string"
				? message.content
				: message.content
						.filter((part): part is { type: "text"; text: string } => part.type === "text")
						.map((part) => part.text)
						.join("\n");

		const box = new Box(1, 1, (value) => theme.bg("customMessageBg", value));
		box.addChild(new Text(theme.fg("dim", text), 0, 0));

		const container = new Container();
		container.addChild(new Spacer(1));
		container.addChild(box);
		return container;
	});

	pi.on("session_start", (event, ctx) => {
		startPresenceLoop(pi, event, ctx, state);
	});

	pi.on("session_ready", (event, ctx) => {
		handleSessionReady(pi, event, ctx, state);
	});

	// Inject greeting into agent context so agent knows what it said
	pi.on("before_agent_start", (event) => {
		if (!state.lastGreeting || state.greetingInjected) return undefined;

		// Mark as injected to avoid repeating
		state.greetingInjected = true;
		const greeting = state.lastGreeting;

		// Inject into system prompt so agent knows its own greeting
		const injection = `\n\n## Your Opening Greeting\nYou already said this to the user when they arrived:\n"${greeting}"\n\nContinue naturally from this greeting. If the user responds, react as if you just said it.`;

		return { systemPrompt: `${event.systemPrompt}${injection}` };
	});

	pi.on("input", () => {
		touch(state);
	});

	pi.on("agent_start", () => {
		touch(state);
	});

	pi.on("agent_end", () => {
		touch(state);
	});

	pi.on("message_end", () => {
		touch(state);
	});

	pi.on("session_shutdown", () => {
		clearTimers(state);
	});
}
