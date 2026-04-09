/**
 * [WHO]: Extension interface, AI-driven personalized greetings and idle cues
 * [FROM]: Depends on @pencil-agent/tui, @pencil-agent/mem-core, core/extensions/types.js, core/i18n
 * [TO]: Loaded by core/extensions/loader.ts as extension entry point
 * [HERE]: extensions/defaults/presence/index.ts - AI-generated opening + idle presence lines from memory (episodes/preferences/lessons) + git snapshot (branch/last commit/changed files) + soul personality traits, injects last MAX_RECENT_PRESENCE lines into agent systemPrompt per turn, configurable via settings.presence.enabled
 */

import { Box, Container, Spacer, Text } from "@pencil-agent/tui";
import type { ExtensionAPI, ExtensionContext, SessionReadyEvent, SessionStartEvent } from "../../../core/extensions/types.js";
import { t, getLocale } from "../../../core/i18n/index.js";
import { join } from "node:path";
import { homedir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const PRESENCE_MESSAGE_TYPE = "presence";
const OPENING_DELAY_MS = 1200;
const IDLE_POLL_MS = 15000;
const LONG_IDLE_MS = 4 * 60 * 1000;
const GREETING_TIMEOUT_MS = 8000;
const PRESENCE_DEBOUNCE_MS = 30_000;
const GIT_TIMEOUT_MS = 200;

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
	soulManager?: any; // import("@pencil-agent/soul-core").SoulManager (dynamic, package may not be type-resolved)
	soulInitTried?: boolean;
	recentPresenceLines: string[]; // Last few presence lines (max 3) for per-turn agent injection
	lastPresenceAt?: number; // Timestamp of last sendPresence (debounce)
	idleGenerating?: boolean; // In-flight lock for async idle generation
};

const MAX_RECENT_PRESENCE = 3;

function createState(): PresenceState {
	return {
		lastActivityAt: Date.now(),
		idleReminderSent: false,
		openingSent: false,
		recentPresenceLines: [],
	};
}

async function initSoulManager(state: PresenceState): Promise<void> {
	if (state.soulManager || state.soulInitTried) return;
	state.soulInitTried = true;
	try {
		const { SoulManager, getSoulConfig } = await import("@pencil-agent/soul-core");
		const manager = new SoulManager({ config: getSoulConfig() });
		await manager.initialize();
		state.soulManager = manager;
	} catch {
		state.soulManager = undefined;
	}
}

function collectSoulHints(state: PresenceState): { traits: string[]; tone?: string } {
	const out: { traits: string[]; tone?: string } = { traits: [] };
	if (!state.soulManager) return out;
	try {
		const profile = state.soulManager.getProfile();
		const personality = (profile as any)?.personality;
		if (personality && typeof personality === "object") {
			const top = Object.entries(personality)
				.filter(([, v]) => typeof v === "number")
				.sort((a, b) => (b[1] as number) - (a[1] as number))
				.slice(0, 3)
				.map(([k, v]) => `${k}:${(v as number).toFixed(2)}`);
			out.traits = top;
		}
		const mood = (profile as any)?.emotionalState?.mood;
		if (typeof mood === "string") out.tone = mood;
	} catch {
		/* fail-soft */
	}
	return out;
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

type MemoryHighlights = { preferences: string[]; lessons: string[] };

async function collectMemoryHighlights(state: PresenceState): Promise<MemoryHighlights> {
	const out: MemoryHighlights = { preferences: [], lessons: [] };
	if (!state.memEngine) return out;
	try {
		const entries = await state.memEngine.getAllEntries();
		const prefs = [
			...entries.knowledge.filter((e) => e.type === "preference" || e.tags.includes("preference")),
			...entries.lessons.filter((e) => e.type === "preference" || e.tags.includes("preference")),
		].slice(0, 3);
		for (const p of prefs) {
			const text = (p.summary || p.detail || p.content || "").toString().slice(0, 80);
			if (text) out.preferences.push(`${p.name || "pref"}: ${text}`);
		}
		const lessons = (entries.lessons || [])
			.filter((e) => e.type !== "preference")
			.sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))
			.slice(0, 2);
		for (const l of lessons) {
			const text = (l.summary || l.detail || l.content || "").toString().slice(0, 80);
			if (text) out.lessons.push(`${l.name || "lesson"}: ${text}`);
		}
	} catch {
		/* fail-soft */
	}
	return out;
}

type ProjectSnapshot = { name: string; branch?: string; lastCommit?: string; changedFiles: string[] };

async function collectProjectSnapshot(): Promise<ProjectSnapshot> {
	const cwd = process.cwd();
	const snap: ProjectSnapshot = { name: getProject(), changedFiles: [] };
	const deadline = Date.now() + 350;
	const tryGit = async (args: string[]) => {
		if (Date.now() > deadline) return undefined;
		try {
			const { stdout } = await execFileAsync("git", args, { cwd, timeout: GIT_TIMEOUT_MS });
			return stdout.trim() || undefined;
		} catch {
			return undefined;
		}
	};
	snap.branch = await tryGit(["rev-parse", "--abbrev-ref", "HEAD"]);
	snap.lastCommit = await tryGit(["log", "-1", "--format=%s"]);
	if (snap.lastCommit && snap.lastCommit.length > 80) snap.lastCommit = snap.lastCommit.slice(0, 80);
	const status = await tryGit(["status", "--porcelain"]);
	if (status) {
		snap.changedFiles = status
			.split("\n")
			.map((l) => l.trim().split(/\s+/).slice(-1)[0] || "")
			.filter(Boolean)
			.slice(0, 5);
	}
	return snap;
}

async function buildGreetingPrompt(
	state: PresenceState,
	detectedLocale: "en" | "zh",
	kind: "opening" | "idle" = "opening",
	lastUserMessage?: string,
): Promise<string | undefined> {
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

		const highlights = await collectMemoryHighlights(state);
		const snapshot = await collectProjectSnapshot();
		const soulHints = collectSoulHints(state);
		const project = snapshot.name;
		const now = new Date();
		const timeOfDay = now.getHours() < 12 ? "morning" : now.getHours() < 18 ? "afternoon" : "evening";

		if (detectedLocale === "zh") {
			const lines: string[] = [
				kind === "opening"
					? "根据下面的上下文，生成一句开场问候语。"
					: "用户安静了几分钟。轻轻问候一下，别打扰他。一句话就够。",
				"",
				"要求:",
				"- 像老朋友一样自然，不要太正式",
				"- 简短随意",
				kind === "idle" ? "- 不要重复你之前说过的开场白" : "- 如果有上下文，可以自然提一句",
				"",
				"项目状态:",
				`项目: ${project}`,
				...(snapshot.branch ? [`分支: ${snapshot.branch}`] : []),
				...(snapshot.lastCommit ? [`最近提交: ${snapshot.lastCommit}`] : []),
				`时间: ${now.toLocaleDateString("zh-CN", { weekday: "long", hour: "2-digit", minute: "2-digit" })}`,
			];

			if (recentEpisodes.length > 0) {
				lines.push("", "最近在做:");
				for (const ep of recentEpisodes.slice(0, 2)) {
					const summary = ep.summary?.slice(0, 80) || "无摘要";
					lines.push(`- ${summary}`);
				}
			}

			if (highlights.preferences.length > 0) {
				lines.push("", "你知道他的偏好:");
				for (const p of highlights.preferences) lines.push(`- ${p}`);
			}
			if (highlights.lessons.length > 0) {
				lines.push("", "记下的经验:");
				for (const l of highlights.lessons) lines.push(`- ${l}`);
			}

			if (snapshot.changedFiles.length > 0) {
				lines.push("", "他正在改的文件:");
				for (const f of snapshot.changedFiles) lines.push(`- ${f}`);
			}

			if (soulHints.traits.length > 0) {
				lines.push("", `你的人格倾向: ${soulHints.traits.join(", ")}${soulHints.tone ? ` (心情: ${soulHints.tone})` : ""}`);
			}

			if (state.recentPresenceLines.length > 0) {
				lines.push("", "你之前刚说过的（别重复）:");
				for (const l of state.recentPresenceLines) lines.push(`- ${l}`);
			}

			if (kind === "idle" && lastUserMessage) {
				lines.push("", `他最后说的是: "${lastUserMessage.slice(0, 120)}"`);
			}

			lines.push("", "直接说问候语，别加引号。");

			return lines.join("\n");
		} else {
			const lines: string[] = [
				kind === "opening"
					? "Generate a casual opening greeting based on the context below."
					: "The user has been quiet for a few minutes. Drop a soft, non-pushy check-in. One short sentence.",
				"",
				"Requirements:",
				"- Sound like a friend, not formal",
				"- Short and casual",
				kind === "idle" ? "- Do NOT repeat your earlier opening greeting" : "- If there's recent context, mention it naturally",
				"",
				"Project state:",
				`Project: ${project}`,
				...(snapshot.branch ? [`Branch: ${snapshot.branch}`] : []),
				...(snapshot.lastCommit ? [`Last commit: ${snapshot.lastCommit}`] : []),
				`Time: ${now.toLocaleDateString("en-US", { weekday: "long", hour: "2-digit", minute: "2-digit" })} (${timeOfDay})`,
			];

			if (recentEpisodes.length > 0) {
				lines.push("", "Recently worked on:");
				for (const ep of recentEpisodes.slice(0, 2)) {
					const summary = ep.summary?.slice(0, 80) || "No summary";
					lines.push(`- ${summary}`);
				}
			}

			if (highlights.preferences.length > 0) {
				lines.push("", "What you know about them:");
				for (const p of highlights.preferences) lines.push(`- ${p}`);
			}
			if (highlights.lessons.length > 0) {
				lines.push("", "Lessons remembered:");
				for (const l of highlights.lessons) lines.push(`- ${l}`);
			}

			if (snapshot.changedFiles.length > 0) {
				lines.push("", "Files they're currently editing:");
				for (const f of snapshot.changedFiles) lines.push(`- ${f}`);
			}

			if (soulHints.traits.length > 0) {
				lines.push("", `Your personality tilt: ${soulHints.traits.join(", ")}${soulHints.tone ? ` (mood: ${soulHints.tone})` : ""}`);
			}

			if (state.recentPresenceLines.length > 0) {
				lines.push("", "What you already said recently (don't repeat):");
				for (const l of state.recentPresenceLines) lines.push(`- ${l}`);
			}

			if (kind === "idle" && lastUserMessage) {
				lines.push("", `Their last message was: "${lastUserMessage.slice(0, 120)}"`);
			}

			lines.push("", "Just say the line, no quotes.");

			return lines.join("\n");
		}
	} catch {
		return undefined;
	}
}

function getLastUserMessage(ctx: ExtensionContext): string | undefined {
	const entries = ctx.sessionManager.getEntries();
	for (let i = entries.length - 1; i >= 0; i -= 1) {
		const entry = entries[i] as any;
		if (entry.type !== "message") continue;
		if (entry.role !== "user") continue;
		const c = entry.content;
		if (typeof c === "string") return c;
		if (Array.isArray(c)) {
			const text = c.find((p: any) => p?.type === "text")?.text;
			if (typeof text === "string") return text;
		}
		return undefined;
	}
	return undefined;
}

async function generatePresenceLine(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: PresenceState,
	kind: "opening" | "idle",
): Promise<string> {
	const detectedLocale = await detectLanguageFromMemory(state);
	const locale = (detectedLocale || getLocale()) as "en" | "zh";
	const fallback = () =>
		pickLine(
			kind === "opening" ? getFallbackOpeningLines(locale) : getFallbackIdleLines(locale),
			Date.now(),
		);

	const lastUser = kind === "idle" ? getLastUserMessage(ctx) : undefined;
	const prompt = await buildGreetingPrompt(state, locale, kind, lastUser);
	if (!prompt) return fallback();

	const systemPrompt = (() => {
		if (locale === "zh") {
			return kind === "opening"
				? "你是个程序员的好朋友，现在来打个招呼。说得随意自然点。"
				: "你是个程序员的好朋友。轻声问候，不打扰。一句话。";
		}
		return kind === "opening"
			? "You're a developer's coding buddy saying hi. Keep it casual and human."
			: "You're a developer's coding buddy doing a quiet check-in. One short, non-pushy line.";
	})();

	try {
		const line = await ctx.completeSimple(systemPrompt, prompt);
		if (line && line.trim().length > 0 && line.trim().length < 200) {
			return line.trim();
		}
	} catch {
		/* fall through */
	}
	return fallback();
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
	const now = Date.now();
	if (state.lastPresenceAt && now - state.lastPresenceAt < PRESENCE_DEBOUNCE_MS) {
		return;
	}
	pi.sendMessage({
		customType: PRESENCE_MESSAGE_TYPE,
		content: line,
		display: true,
	});
	state.recentPresenceLines.push(line);
	if (state.recentPresenceLines.length > MAX_RECENT_PRESENCE) {
		state.recentPresenceLines.splice(0, state.recentPresenceLines.length - MAX_RECENT_PRESENCE);
	}
	state.lastPresenceAt = now;
	touch(state);
}

async function maybeSendOpening(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	state: PresenceState,
): Promise<boolean> {
	if (state.openingSent) return true;
	if (!canSendOpening(ctx)) return false;

	// Initialize memory + soul engines if not already done
	await initMemEngine(state);
	await initSoulManager(state);

	// Generate AI-powered greeting
	const greeting = await generatePresenceLine(pi, ctx, state, "opening");
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
	if (state.idleGenerating) return;
	if (!canSendPresence(ctx)) return;
	if (Date.now() - state.lastActivityAt < LONG_IDLE_MS) return;
	state.idleGenerating = true;
	void (async () => {
		try {
			await initMemEngine(state);
			await initSoulManager(state);
			const line = await generatePresenceLine(pi, ctx, state, "idle");
			if (canSendPresence(ctx)) {
				sendPresence(pi, state, line);
				state.idleReminderSent = true;
			}
		} finally {
			state.idleGenerating = false;
		}
	})();
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

	// Inject the latest presence line into the agent's system prompt every turn,
	// so the main conversation always perceives what presence said to the user.
	pi.on("before_agent_start", (event) => {
		const lines = state.recentPresenceLines;
		if (!lines.length) return undefined;
		const list = lines.map((l) => `- "${l}"`).join("\n");
		const injection = `\n\n## Recent Presence Lines\nYou (via the presence extension) recently showed the user these lines, in order:\n${list}\nAcknowledge them naturally if relevant; do not repeat them verbatim.`;
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
