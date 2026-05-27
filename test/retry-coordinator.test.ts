/**
 * [WHO]: Verifies RetryCoordinator in-loop retry behavior
 * [FROM]: Depends on node:test, node:assert, core/runtime/retry-coordinator
 * [TO]: Guards AgentSession model-error recovery adapter semantics
 * [HERE]: test/retry-coordinator.test.ts - focused retry coordinator coverage
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { AssistantMessage } from "@pencil-agent/ai";
import { RetryCoordinator, type RetrySessionEvent } from "../core/runtime/retry-coordinator.js";

function createUsage() {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
}

function createErrorMessage(errorMessage: string): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text: "" }],
		api: "openai-responses",
		provider: "openai",
		model: "mock",
		usage: createUsage(),
		stopReason: "error",
		errorMessage,
		timestamp: Date.now(),
	};
}

test("RetryCoordinator handleErrorInLoop waits and returns retry without triggering continue", async () => {
	const events: RetrySessionEvent[] = [];
	let removed = 0;
	let continued = 0;
	const coordinator = new RetryCoordinator({
		getContextWindow: () => 8192,
		getRetrySettings: () => ({ enabled: true, maxRetries: 2, baseDelayMs: 0 }),
		removeLastAssistantMessage: () => {
			removed++;
		},
		triggerContinue: () => {
			continued++;
		},
		emitEvent: (event) => events.push(event),
	});

	const shouldRetry = await coordinator.handleErrorInLoop(createErrorMessage("upstream 503 service unavailable"));

	assert.equal(shouldRetry, true);
	assert.equal(removed, 0);
	assert.equal(continued, 0);
	assert.deepEqual(events, [
		{
			type: "auto_retry_start",
			attempt: 1,
			maxAttempts: 2,
			delayMs: 0,
			errorMessage: "upstream 503 service unavailable",
		},
	]);

	coordinator.onSuccess();
	assert.deepEqual(events.at(-1), {
		type: "auto_retry_end",
		success: true,
		attempt: 1,
	});
});
