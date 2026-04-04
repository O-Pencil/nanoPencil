/**
 * [UPSTREAM]: Depends on @pencil-agent/tui, core/extensions/types.js
 * [SURFACE]: Extension interface
 * [LOCUS]: extensions/defaults/presence/index.ts - gentle opening and long-idle presence cues
 * [COVENANT]: Change proactive chat behavior → update product guidance and tests
 */

import { Box, Container, Spacer, Text } from "@pencil-agent/tui";
import type { ExtensionAPI, ExtensionContext, SessionStartEvent } from "../../../core/extensions/types.js";

const PRESENCE_MESSAGE_TYPE = "presence";
const OPENING_DELAY_MS = 1200;
const OPENING_RETRY_MS = 500;
const OPENING_RETRY_WINDOW_MS = 10_000;
const IDLE_POLL_MS = 15000;
const LONG_IDLE_MS = 4 * 60 * 1000;

const OPENING_LINES = [
	"I am here.",
	"Take your time. I am here.",
	"You are here. We can keep it simple.",
	"No rush. Start wherever you want.",
	"We can ease into it.",
];

const LONG_IDLE_LINES = [
	"I am still here. We can pick this up whenever you want.",
	"No rush. We can continue whenever it feels right.",
	"This can sit for a bit. We can pick it back up when you want.",
	"I am here whenever you want to continue.",
	"It is fine to leave this quiet for a moment.",
];

type PresenceState = {
	lastActivityAt: number;
	idleReminderSent: boolean;
	openingStartedAt?: number;
	openingSent: boolean;
	openingTimer?: ReturnType<typeof setTimeout>;
	idleTimer?: ReturnType<typeof setInterval>;
	unsubscribeInput?: () => void;
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
	touch(state);
}

function maybeSendOpening(pi: ExtensionAPI, ctx: ExtensionContext, state: PresenceState): boolean {
	if (state.openingSent) return true;
	if (!canSendPresence(ctx)) return false;
	const conversationCount = countConversationEntries(ctx);
	const lastConversationAt = getLastConversationTimestamp(ctx);
	const seed = conversationCount === 0 ? Date.now() : lastConversationAt ?? Date.now();
	sendPresence(pi, state, pickLine(OPENING_LINES, seed));
	state.openingSent = true;
	return true;
}

function scheduleOpening(pi: ExtensionAPI, ctx: ExtensionContext, state: PresenceState, delayMs: number): void {
	state.openingTimer = setTimeout(() => {
		const sent = maybeSendOpening(pi, ctx, state);
		if (sent) {
			state.openingTimer = undefined;
			return;
		}
		if (!state.openingStartedAt || Date.now() - state.openingStartedAt >= OPENING_RETRY_WINDOW_MS) {
			state.openingTimer = undefined;
			return;
		}
		scheduleOpening(pi, ctx, state, OPENING_RETRY_MS);
	}, delayMs);
}

function maybeSendIdleReminder(pi: ExtensionAPI, ctx: ExtensionContext, state: PresenceState): void {
	if (state.idleReminderSent) return;
	if (!canSendPresence(ctx)) return;
	if (Date.now() - state.lastActivityAt < LONG_IDLE_MS) return;
	sendPresence(pi, state, pickLine(LONG_IDLE_LINES, state.lastActivityAt));
	state.idleReminderSent = true;
}

function startPresenceLoop(pi: ExtensionAPI, _event: SessionStartEvent, ctx: ExtensionContext, state: PresenceState): void {
	clearTimers(state);
	touch(state);
	state.openingSent = false;
	state.openingStartedAt = Date.now();

	if (!ctx.hasUI) return;

	state.unsubscribeInput = ctx.ui.onTerminalInput((data) => {
		if (data.length > 0) {
			touch(state);
		}
		return undefined;
	});

	scheduleOpening(pi, ctx, state, OPENING_DELAY_MS);

	state.idleTimer = setInterval(() => {
		maybeSendIdleReminder(pi, ctx, state);
	}, IDLE_POLL_MS);
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
