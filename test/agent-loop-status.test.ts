/**
 * [WHO]: Verifies interactive agent loop status formatting
 * [FROM]: Depends on node:test, modes/interactive/agent-loop-status.ts
 * [TO]: Consumed by repository test runner
 * [HERE]: test/agent-loop-status.test.ts - guards /status loop result readability
 */

import assert from "node:assert/strict";
import test from "node:test";
import { formatAgentLoopStatusLines } from "../modes/interactive/agent-loop-status.js";

test("agent loop status returns no lines without a result", () => {
	assert.deepEqual(formatAgentLoopStatusLines(undefined), []);
});

test("agent loop status formats stop outcome and transition", () => {
	assert.deepEqual(
		formatAgentLoopStatusLines({
			stopReason: "stop",
			turnCount: 2,
			toolCallCount: 3,
			durationMs: 42,
			lastTransition: { reason: "tool_result", toolCallCount: 3 },
		}),
		[
			"Last loop:            stop, 2 turns, 3 tools, 42ms",
			"Loop transition:      tool_result (3 tool calls)",
		],
	);
});

test("agent loop status highlights limits and permission denials", () => {
	assert.deepEqual(
		formatAgentLoopStatusLines({
			stopReason: "toolUse",
			turnCount: 5,
			toolCallCount: 9,
			durationMs: 1234,
			permissionDenialCount: 2,
			lastTransition: {
				reason: "tool_call_limit_reached",
				maxToolCalls: 8,
				requestedToolCalls: 3,
				toolCallCount: 6,
			},
		}),
		[
			"Last loop:            toolUse, 5 turns, 9 tools, 1.2s",
			"Loop transition:      tool_call_limit_reached (6/8 used, 3 requested)",
			"Tool denials:         2",
		],
	);
});

test("agent loop status prefers transition history when available", () => {
	assert.deepEqual(
		formatAgentLoopStatusLines({
			stopReason: "stop",
			turnCount: 3,
			toolCallCount: 0,
			durationMs: 1500,
			transitions: [
				{ reason: "max_output_tokens_recovery", attempt: 1 },
				{
					reason: "token_budget_continuation",
					continuationCount: 1,
					outputTokens: 45,
					targetTokens: 100,
				},
			],
			lastTransition: {
				reason: "token_budget_continuation",
				continuationCount: 1,
				outputTokens: 45,
				targetTokens: 100,
			},
		}),
		[
			"Last loop:            stop, 3 turns, 0 tools, 1.5s",
			"Loop transitions:     max_output_tokens_recovery (attempt 1) -> token_budget_continuation (45/100 output tokens)",
		],
	);
});

test("agent loop status formats framework and policy used by the last run", () => {
	assert.deepEqual(
		formatAgentLoopStatusLines({
			stopReason: "stop",
			loopFramework: "weak-model-compatible",
			loopPolicy: {
				maxTurnsPerPrompt: 3,
				maxToolCallsPerPrompt: 8,
				maxToolConcurrency: 2,
				maxToolResultBatchSizeChars: 64_000,
				maxModelErrorRecoveryAttempts: 4,
				maxOutputTokenRecoveryAttempts: 3,
				outputTokenBudget: {
					targetTokens: 1200,
					thresholdPct: 0.75,
					maxContinuations: 2,
				},
				maxStopHookContinuations: 2,
			},
			turnCount: 1,
			toolCallCount: 0,
			durationMs: 50,
		}),
		[
			"Last loop:            stop, 1 turn, 0 tools, 50ms",
			"Loop framework:       weak-model-compatible",
			"Loop policy:          turns=3, tools=8, concurrency=2, toolResultChars=64000, modelRecoveries=4, outputRecoveries=3, outputBudget=1200@75%/2, stopHooks=2",
		],
	);
});
