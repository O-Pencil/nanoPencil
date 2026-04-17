import assert from "node:assert/strict";
import test from "node:test";
import { runPrintMode } from "../modes/print-mode.js";

test("print mode emits session_shutdown so extensions can flush final events", async () => {
	let shutdownEmits = 0;

	const session = {
		sessionManager: {
			getHeader: () => undefined,
		},
		state: {
			messages: [],
		},
		extensionRunner: {
			hasHandlers: (eventType: string) => eventType === "session_shutdown",
			emit: async (event: { type: string }) => {
				if (event.type === "session_shutdown") shutdownEmits += 1;
			},
		},
		bindExtensions: async () => {},
		subscribe: () => () => {},
		prompt: async () => {},
	};

	await runPrintMode(session as any, {
		mode: "json",
		initialMessage: "Inspect SAL eval lifecycle",
	});

	assert.equal(shutdownEmits, 1);
});
