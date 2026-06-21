import assert from "node:assert/strict";
import test from "node:test";
import { Container, TUI } from "@catui/tui";
import type { Message } from "@catui/ai/types";
import { StreamRenderController, type StreamRenderContext } from "../modes/interactive/controllers/stream-render-controller.js";
import { InteractiveState } from "../modes/interactive/state/interactive-state.js";

function createController(state: InteractiveState, calls: { added: number; pendingUpdates: number; renders: number }) {
	const ui = new TUI();
	const chat = new Container();
	const status = new Container();
	const context: StreamRenderContext = {
		state: { get: () => state },
		layout: {
			getUi: () => ui,
			getChatContainer: () => chat as never,
			getStatusContainer: () => status,
			addMessageToChat: () => {
				calls.added += 1;
			},
			updatePendingMessagesDisplay: () => {
				calls.pendingUpdates += 1;
			},
			rebuildChatFromMessages: () => {},
			requestRender: () => {
				calls.renders += 1;
			},
			invalidateFooter: () => {},
		},
		loaders: {
			getSessionId: () => "test-session",
			getDefaultWorkingMessage: () => "Working...",
			getInterruptKeyHint: () => "Esc",
			setBuddyPetState: () => {},
			startAgentRunTimer: () => {},
			stopAgentRunTimer: () => {},
			updateWorkingMessage: () => {},
			formatElapsedSeconds: () => "0s",
			isInPlanMode: () => false,
		},
		toolTrace: {
			shouldRenderToolTrace: () => true,
			getRegisteredToolDefinition: () => undefined,
			getShowImages: () => false,
		},
		runtime: {
			getRetryAttempt: () => 0,
			abortCompaction: () => {},
			abortRetry: () => {},
			flushCompactionQueue: () => {},
			checkShutdownRequested: async () => {},
			clearAttachments: () => {},
			getAgentDir: () => "/tmp/catui-agent",
		},
		escape: {
			getHandler: () => undefined,
			setHandler: () => {},
		},
		surface: {
			ensureInitialized: async () => {},
			restoreEditorFocusIfPossible: () => {},
			getUserMessageText: (message: Message) =>
				message.content
					.filter((part) => part.type === "text")
					.map((part) => part.text)
					.join("\n"),
			getMarkdownThemeWithSettings: () => ({}) as never,
			showStatus: () => {},
			showError: () => {},
		},
	};

	return new StreamRenderController(context);
}

test("user message_start consumes matching optimistic query without repainting the same visible query", async () => {
	const state = new InteractiveState();
	const calls = { added: 0, pendingUpdates: 0, renders: 0 };
	const controller = createController(state, calls);
	const visibleQuery = "Please review [file: src/example.ts]";
	state.optimisticUserMessages.push({ text: visibleQuery });

	await controller.handle({
		type: "message_start",
		message: {
			role: "user",
			content: [
				{
					type: "text",
					text: [
						"The following files are referenced via @-mentions in the user's message.",
						"Treat them as read-only context unless the task explicitly allows updates.",
						"",
						"### @src/example.ts (entire file)",
						"```",
						"1\texport const value = 1;",
						"```",
						"",
						visibleQuery,
					].join("\n"),
				},
			],
			timestamp: 0,
		},
	} as never);

	assert.equal(calls.added, 0);
	assert.equal(state.optimisticUserMessages.length, 0);
	assert.equal(calls.pendingUpdates, 0);
	assert.equal(calls.renders, 0);
});

test("user message_start consumes matching optimistic query even when it is not first in the queue", async () => {
	const state = new InteractiveState();
	const calls = { added: 0, pendingUpdates: 0, renders: 0 };
	const controller = createController(state, calls);
	state.optimisticUserMessages.push({ text: "older queued query" }, { text: "current query" });

	await controller.handle({
		type: "message_start",
		message: {
			role: "user",
			content: [{ type: "text", text: "current query" }],
			timestamp: 0,
		},
	} as never);

	assert.equal(calls.added, 0);
	assert.deepEqual(state.optimisticUserMessages.map((message) => message.text), ["older queued query"]);
	assert.equal(calls.pendingUpdates, 0);
	assert.equal(calls.renders, 0);
});

test("user message_start consumes raw @-mention query that matches optimistic file reference display text", async () => {
	const state = new InteractiveState();
	const calls = { added: 0, pendingUpdates: 0, renders: 0 };
	const controller = createController(state, calls);
	state.optimisticUserMessages.push({ text: "Please review [file: src/example.ts]" });

	await controller.handle({
		type: "message_start",
		message: {
			role: "user",
			content: [
				{
					type: "text",
					text: [
						"The following files are referenced via @-mentions in the user's message.",
						"Treat them as read-only context unless the task explicitly allows updates.",
						"",
						"### @src/example.ts (entire file)",
						"```",
						"1\texport const value = 1;",
						"```",
						"",
						"Please review @src/example.ts",
					].join("\n"),
				},
			],
			timestamp: 0,
		},
	} as never);

	assert.equal(calls.added, 0);
	assert.equal(state.optimisticUserMessages.length, 0);
	assert.equal(calls.pendingUpdates, 0);
	assert.equal(calls.renders, 0);
});

test("user message_start consumes expanded skill command that matches optimistic visible command", async () => {
	const state = new InteractiveState();
	const calls = { added: 0, pendingUpdates: 0, renders: 0 };
	const controller = createController(state, calls);
	state.optimisticUserMessages.push({ text: "/skill:review src/example.ts" });

	await controller.handle({
		type: "message_start",
		message: {
			role: "user",
			content: [
				{
					type: "text",
					text: [
						'<skill name="review" location="/tmp/review/SKILL.md">',
						"References are relative to /tmp/review.",
						"",
						"Review the requested code carefully.",
						"</skill>",
						"",
						"src/example.ts",
					].join("\n"),
				},
			],
			timestamp: 0,
		},
	} as never);

	assert.equal(calls.added, 0);
	assert.equal(state.optimisticUserMessages.length, 0);
	assert.equal(calls.pendingUpdates, 0);
	assert.equal(calls.renders, 0);
});

test("user message_start consumes expanded prompt template that preserves visible command arguments", async () => {
	const state = new InteractiveState();
	const calls = { added: 0, pendingUpdates: 0, renders: 0 };
	const controller = createController(state, calls);
	state.optimisticUserMessages.push({ text: "/review src/example.ts" });

	await controller.handle({
		type: "message_start",
		message: {
			role: "user",
			content: [
				{
					type: "text",
					text: "Please review this file carefully:\n\nsrc/example.ts",
				},
			],
			timestamp: 0,
		},
	} as never);

	assert.equal(calls.added, 0);
	assert.equal(state.optimisticUserMessages.length, 0);
	assert.equal(calls.pendingUpdates, 0);
	assert.equal(calls.renders, 0);
});

test("user message_start consumes the oldest optimistic query when runtime text is transformed beyond visible matching", async () => {
	const state = new InteractiveState();
	const calls = { added: 0, pendingUpdates: 0, renders: 0 };
	const controller = createController(state, calls);
	state.optimisticUserMessages.push({ text: "/diagnose" });

	await controller.handle({
		type: "message_start",
		message: {
			role: "user",
			content: [
				{
					type: "text",
					text: "Run a diagnostic pass over the current workspace and report concrete findings.",
				},
			],
			timestamp: 0,
		},
	} as never);

	assert.equal(calls.added, 0);
	assert.equal(state.optimisticUserMessages.length, 0);
	assert.equal(calls.pendingUpdates, 0);
	assert.equal(calls.renders, 0);
});
