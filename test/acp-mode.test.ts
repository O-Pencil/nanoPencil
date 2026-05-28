import test from "node:test";
import assert from "node:assert/strict";
import { __testUtils } from "../modes/acp/acp-mode.js";

test("acp available commands: strips leading slash and filters unsupported builtins", () => {
	const commands = __testUtils.buildAcpAvailableCommands([
		{ name: "new", description: "Start a new session" },
		{ name: "/model", description: "Switch models" },
		{ name: "/thinking", description: "Set thinking level" },
		{ name: "settings", description: "Open settings UI" },
		{ name: "/memory", description: "Inspect memory" },
		{ name: "review", description: "Run code review" },
		{ name: "/review", description: "Duplicate review command" },
	]);

	assert.deepEqual(
		commands.map((command) => command.name),
		["new", "model", "thinking", "review"],
	);
	assert.equal(commands[0]?.input, undefined);
	assert.deepEqual(commands[1]?.input, { hint: "provider/model or model id" });
	assert.deepEqual(commands[2]?.input, { hint: "Thinking level" });
	assert.deepEqual(commands[3]?.input, { hint: "Enter command arguments" });
});

test("acp available commands: normalizes slash-prefixed names", () => {
	assert.equal(__testUtils.normalizeAcpCommandName("/resume"), "resume");
	assert.equal(__testUtils.normalizeAcpCommandName("///compact"), "compact");
	assert.equal(__testUtils.isAdvertisableAcpCommand("/resume"), true);
	assert.equal(__testUtils.isAdvertisableAcpCommand("/settings"), false);
});

test("acp bootstrap updates are deferred until after the current turn", async () => {
	const events: string[] = [];

	__testUtils.deferAcpNotification(() => {
		events.push("deferred");
	});
	events.push("sync");

	assert.equal(events.join(","), "sync");
	await Promise.resolve();
	await Promise.resolve();
	assert.equal(events.join(","), "sync,deferred");
});

test("acp loop result lines summarize the last agent result", () => {
	assert.deepEqual(
		__testUtils.formatAcpLoopResultLines({
			stopReason: "toolUse",
			loopFramework: "weak-model-compatible",
			loopPolicy: {
				maxTurnsPerPrompt: 3,
				maxToolCallsPerPrompt: 8,
				maxToolConcurrency: 2,
			},
			turnCount: 4,
			toolCallCount: 7,
			durationMs: 1200,
			permissionDenialCount: 1,
			transitions: [
				{ reason: "model_error_recovery", subtype: "context_overflow", attempt: 1 },
				{
					reason: "tool_call_limit_reached",
					maxToolCalls: 6,
					requestedToolCalls: 3,
					toolCallCount: 5,
				},
			],
			lastTransition: {
				reason: "tool_call_limit_reached",
				maxToolCalls: 6,
				requestedToolCalls: 3,
				toolCallCount: 5,
			},
		}),
		[
			"Last loop: toolUse, 4 turns, 7 tools, 1.2s",
			"Loop framework: weak-model-compatible",
			"Loop policy: turns=3, tools=8, concurrency=2",
			"Loop transitions: model_error_recovery (context_overflow, attempt 1) -> tool_call_limit_reached (5/6 used, 3 requested)",
			"Tool denials: 1",
		],
	);
});
