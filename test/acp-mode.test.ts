import test from "node:test";
import assert from "node:assert/strict";
import { __testUtils } from "../modes/acp/acp-mode.js";

test("acp available commands: strips leading slash and filters unsupported builtins", () => {
	const commands = __testUtils.buildAcpAvailableCommands([
		{ name: "new", description: "Start a new session" },
		{ name: "/model", description: "Switch models" },
		{ name: "settings", description: "Open settings UI" },
		{ name: "/memory", description: "Inspect memory" },
		{ name: "review", description: "Run code review" },
		{ name: "/review", description: "Duplicate review command" },
	]);

	assert.deepEqual(
		commands.map((command) => command.name),
		["new", "model", "review"],
	);
	assert.equal(commands[0]?.input, undefined);
	assert.deepEqual(commands[1]?.input, { hint: "provider/model or model id" });
	assert.deepEqual(commands[2]?.input, { hint: "Enter command arguments" });
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
