import assert from "node:assert/strict";
import test from "node:test";
import type { AssistantMessage } from "@catui/ai/types";
import { visibleWidth } from "@catui/tui";
import { AssistantMessageComponent } from "../modes/interactive/components/assistant-message.js";
import { initTheme } from "../modes/interactive/theme/theme.js";

initTheme("dark");

function createAssistantMessage(text: string): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
		api: "openai-responses",
		provider: "openai",
		model: "test-model",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				total: 0,
			},
		},
		stopReason: "stop",
		timestamp: 0,
	};
}

test("assistant message keeps every rendered row within terminal width for narrow CJK content", () => {
	const component = new AssistantMessageComponent(createAssistantMessage("你好 world"));

	const lines = component.render(2);

	assert.ok(lines.length > 0);
	for (const line of lines) {
		assert.ok(
			visibleWidth(line) <= 2,
			`Expected assistant message line to fit width 2, got ${visibleWidth(line)} for ${JSON.stringify(line)}`,
		);
	}
});
