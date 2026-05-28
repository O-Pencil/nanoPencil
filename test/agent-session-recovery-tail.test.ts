/**
 * [WHO]: Verifies recoverable model-error tail pruning for AgentSession retries
 * [FROM]: Depends on node:test, node:assert, agent-session recovery helper, agent-core/ai message shapes
 * [TO]: Guards in-loop retry cleanup when errored assistant messages emitted tool calls
 * [HERE]: test/agent-session-recovery-tail.test.ts - focused AgentSession recovery coverage
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { AgentMessage } from "@pencil-agent/agent-core";
import type { AssistantMessage, ToolResultMessage } from "@pencil-agent/ai";
import { pruneRecoverableErrorTail } from "../core/runtime/agent-session.js";

function usage() {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
}

function assistantError(): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "toolCall", id: "tool-1", name: "read", arguments: { path: "README.md" } }],
		api: "openai-responses",
		provider: "openai",
		model: "gpt-5",
		usage: usage(),
		stopReason: "error",
		errorMessage: "upstream 503 service unavailable",
		timestamp: 2,
	};
}

function interruptedToolResult(): ToolResultMessage {
	return {
		role: "toolResult",
		toolCallId: "tool-1",
		toolName: "read",
		content: [{ type: "text", text: "Tool call interrupted because the assistant response ended with an error." }],
		details: {
			errorType: "interrupted_tool_call",
			stopReason: "error",
			errorMessage: "upstream 503 service unavailable",
		},
		isError: true,
		timestamp: 3,
	};
}

test("pruneRecoverableErrorTail removes errored assistant and its interrupted tool results", () => {
	const assistant = assistantError();
	const messages: AgentMessage[] = [
		{ role: "user", content: "read the file", timestamp: 1 },
		assistant,
		interruptedToolResult(),
	];

	const pruned = pruneRecoverableErrorTail(messages, assistant);

	assert.deepEqual(pruned, [{ role: "user", content: "read the file", timestamp: 1 }]);
});
