import assert from "node:assert/strict";
import test from "node:test";
import type { AgentMessage } from "@catui/agent-core";
import { Container, TUI } from "@catui/tui";
import { VirtualTerminal } from "../core/lib/tui/test/virtual-terminal.js";
import { InteractiveMode } from "../modes/interactive/interactive-mode.js";
import { InteractiveState } from "../modes/interactive/state/interactive-state.js";
import { initTheme } from "../modes/interactive/theme/theme.js";

initTheme("dark");

function getUserText(message: AgentMessage): string {
	if (message.role !== "user") return "";
	return message.content
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("\n");
}

test("chat rebuild does not render an optimistic user query already present in session context", () => {
	const renderedUserMessages: string[] = [];
	const mode = Object.create(InteractiveMode.prototype) as InteractiveMode & Record<string, any>;

	mode.state = new InteractiveState();
	mode.state.optimisticUserMessages.push({ text: "hello" });
	mode.chatContainer = new Container();
	mode.clearStatusTimers = () => {};
	Object.defineProperty(mode, "sessionManager", {
		value: {
			buildSessionContext: () => ({
				messages: [
					{
						role: "user",
						content: [{ type: "text", text: "hello" }],
						timestamp: 1,
					},
				],
				entries: [],
			}),
		},
		configurable: true,
	});
	mode.addMessageToChat = (message: AgentMessage) => {
		const text = getUserText(message);
		if (text) {
			renderedUserMessages.push(text);
		}
	};
	mode.ui = {
		requestRender: () => {},
	};

	mode.rebuildChatFromMessages();

	assert.deepEqual(renderedUserMessages, ["hello"]);
});

test("chat rebuild shows one visible query on the terminal when session context already has the optimistic user message", async () => {
	const terminal = new VirtualTerminal(80, 12);
	const tui = new TUI(terminal);
	const mode = Object.create(InteractiveMode.prototype) as InteractiveMode & Record<string, any>;

	mode.state = new InteractiveState();
	mode.state.optimisticUserMessages.push({ text: "hello terminal" });
	mode.chatContainer = new Container();
	mode.clearStatusTimers = () => {};
	Object.defineProperty(mode, "sessionManager", {
		value: {
			buildSessionContext: () => ({
				messages: [
					{
						role: "user",
						content: [{ type: "text", text: "hello terminal" }],
						timestamp: 1,
					},
				],
				entries: [],
			}),
		},
		configurable: true,
	});
	Object.defineProperty(mode, "settingsManager", {
		value: {
			getCodeBlockIndent: () => 1,
		},
		configurable: true,
	});
	mode.session = {
		extensionRunner: {
			getMessageRenderer: () => undefined,
		},
	};
	mode.ui = tui;
	tui.addChild(mode.chatContainer);
	tui.start();

	mode.rebuildChatFromMessages();
	await tui.awaitRender();
	await terminal.flush();

	const visibleText = terminal.getViewport().join("\n");
	const occurrences = visibleText.match(/hello terminal/g)?.length ?? 0;
	assert.equal(occurrences, 1, visibleText);

	tui.stop();
});

test("chat rebuild consumes raw @-mention session query that matches optimistic file reference display text", async () => {
	const terminal = new VirtualTerminal(80, 12);
	const tui = new TUI(terminal);
	const mode = Object.create(InteractiveMode.prototype) as InteractiveMode & Record<string, any>;

	mode.state = new InteractiveState();
	mode.state.optimisticUserMessages.push({ text: "Please review [file: src/example.ts]" });
	mode.chatContainer = new Container();
	mode.clearStatusTimers = () => {};
	Object.defineProperty(mode, "sessionManager", {
		value: {
			buildSessionContext: () => ({
				messages: [
					{
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
						timestamp: 1,
					},
				],
				entries: [],
			}),
		},
		configurable: true,
	});
	Object.defineProperty(mode, "settingsManager", {
		value: {
			getCodeBlockIndent: () => 1,
		},
		configurable: true,
	});
	mode.session = {
		extensionRunner: {
			getMessageRenderer: () => undefined,
		},
	};
	mode.ui = tui;
	tui.addChild(mode.chatContainer);
	tui.start();

	mode.rebuildChatFromMessages();
	await tui.awaitRender();
	await terminal.flush();

	const visibleText = terminal.getViewport().join("\n");
	assert.equal(mode.state.optimisticUserMessages.length, 0);
	assert.equal(visibleText.match(/Please review/g)?.length ?? 0, 1, visibleText);

	tui.stop();
});

test("chat rebuild consumes expanded skill session query that matches optimistic visible skill command", async () => {
	const terminal = new VirtualTerminal(80, 12);
	const tui = new TUI(terminal);
	const mode = Object.create(InteractiveMode.prototype) as InteractiveMode & Record<string, any>;

	mode.state = new InteractiveState();
	mode.state.optimisticUserMessages.push({ text: "/skill:review src/example.ts" });
	mode.chatContainer = new Container();
	mode.clearStatusTimers = () => {};
	Object.defineProperty(mode, "sessionManager", {
		value: {
			buildSessionContext: () => ({
				messages: [
					{
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
						timestamp: 1,
					},
				],
				entries: [],
			}),
		},
		configurable: true,
	});
	Object.defineProperty(mode, "settingsManager", {
		value: {
			getCodeBlockIndent: () => 1,
		},
		configurable: true,
	});
	mode.session = {
		extensionRunner: {
			getMessageRenderer: () => undefined,
		},
	};
	mode.ui = tui;
	tui.addChild(mode.chatContainer);
	tui.start();

	mode.rebuildChatFromMessages();
	await tui.awaitRender();
	await terminal.flush();

	const visibleText = terminal.getViewport().join("\n");
	assert.equal(mode.state.optimisticUserMessages.length, 0);
	assert.equal(visibleText.match(/src\/example\.ts/g)?.length ?? 0, 1, visibleText);

	tui.stop();
});

test("chat rebuild consumes expanded prompt template session query that preserves visible command arguments", async () => {
	const terminal = new VirtualTerminal(80, 12);
	const tui = new TUI(terminal);
	const mode = Object.create(InteractiveMode.prototype) as InteractiveMode & Record<string, any>;

	mode.state = new InteractiveState();
	mode.state.optimisticUserMessages.push({ text: "/review src/example.ts" });
	mode.chatContainer = new Container();
	mode.clearStatusTimers = () => {};
	Object.defineProperty(mode, "sessionManager", {
		value: {
			buildSessionContext: () => ({
				messages: [
					{
						role: "user",
						content: [
							{
								type: "text",
								text: "Please review this file carefully:\n\nsrc/example.ts",
							},
						],
						timestamp: 1,
					},
				],
				entries: [],
			}),
		},
		configurable: true,
	});
	Object.defineProperty(mode, "settingsManager", {
		value: {
			getCodeBlockIndent: () => 1,
		},
		configurable: true,
	});
	mode.session = {
		extensionRunner: {
			getMessageRenderer: () => undefined,
		},
	};
	mode.ui = tui;
	tui.addChild(mode.chatContainer);
	tui.start();

	mode.rebuildChatFromMessages();
	await tui.awaitRender();
	await terminal.flush();

	const visibleText = terminal.getViewport().join("\n");
	assert.equal(mode.state.optimisticUserMessages.length, 0);
	assert.equal(visibleText.match(/src\/example\.ts/g)?.length ?? 0, 1, visibleText);

	tui.stop();
});

test("chat rebuild consumes the oldest optimistic query when session text is transformed beyond visible matching", async () => {
	const terminal = new VirtualTerminal(80, 12);
	const tui = new TUI(terminal);
	const mode = Object.create(InteractiveMode.prototype) as InteractiveMode & Record<string, any>;

	mode.state = new InteractiveState();
	mode.state.optimisticUserMessages.push({ text: "/diagnose" });
	mode.chatContainer = new Container();
	mode.clearStatusTimers = () => {};
	Object.defineProperty(mode, "sessionManager", {
		value: {
			buildSessionContext: () => ({
				messages: [
					{
						role: "user",
						content: [
							{
								type: "text",
								text: "Run a diagnostic pass over the current workspace and report concrete findings.",
							},
						],
						timestamp: 1,
					},
				],
				entries: [],
			}),
		},
		configurable: true,
	});
	Object.defineProperty(mode, "settingsManager", {
		value: {
			getCodeBlockIndent: () => 1,
		},
		configurable: true,
	});
	mode.session = {
		extensionRunner: {
			getMessageRenderer: () => undefined,
		},
	};
	mode.ui = tui;
	tui.addChild(mode.chatContainer);
	tui.start();

	mode.rebuildChatFromMessages();
	await tui.awaitRender();
	await terminal.flush();

	const visibleText = terminal.getViewport().join("\n");
	assert.equal(mode.state.optimisticUserMessages.length, 0);
	assert.equal(visibleText.match(/diagnose/g)?.length ?? 0, 0, visibleText);
	assert.equal(visibleText.match(/diagnostic pass/g)?.length ?? 0, 1, visibleText);

	tui.stop();
});
