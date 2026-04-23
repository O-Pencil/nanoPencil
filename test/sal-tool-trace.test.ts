import assert from "node:assert/strict";
import test from "node:test";
import { buildToolTracePayload, inferIntent } from "../extensions/defaults/sal/index.js";

test("sal intent inference matches Chinese prompts without word boundaries", () => {
	assert.equal(inferIntent("帮我修复这个报错"), "fix");
	assert.equal(inferIntent("看一下这段代码为什么这样"), "explain");
	assert.equal(inferIntent("新增一个导出功能"), "feat");
});

test("sal tool trace emits bounded no-tool turn summaries", () => {
	const payload = buildToolTracePayload({
		turnId: 3,
		startedAtMs: Date.now(),
		touchedFiles: new Set<string>(),
		toolCalls: [],
		prompt: "解释一下这个模块是做什么的",
	}, 420) as Record<string, unknown>;

	assert.equal(payload.has_tool_usage, false);
	assert.equal(payload.total_tool_calls, 0);
	assert.equal(payload.completed_tool_calls, 0);
	assert.deepEqual(payload.tool_calls, []);
	assert.deepEqual(payload.tool_sequence, []);
	assert.equal((payload.task_signals as Record<string, unknown>).intent, "explain");
});

test("sal tool trace caps sequence and summary payload size", () => {
	const toolCalls = Array.from({ length: 40 }, (_, i) => ({
		toolCallId: `call-${i}`,
		tool: i < 20 ? "read" : `tool-${i}`,
		startMs: i * 10,
		endMs: i * 10 + 5,
		isError: i % 9 === 0,
	}));
	const payload = buildToolTracePayload({
		turnId: 4,
		startedAtMs: Date.now(),
		touchedFiles: new Set<string>(),
		toolCalls,
		prompt: "search and inspect the implementation",
	}, 900) as Record<string, unknown>;

	assert.equal((payload.tool_sequence as string[]).length, 32);
	assert.equal(payload.truncated_tool_calls, 8);
	assert.equal((payload.tool_calls as unknown[]).length, 16);
	assert.equal(payload.truncated_tool_summary, 5);

	const firstSummary = (payload.tool_calls as Array<Record<string, unknown>>)[0];
	assert.equal(firstSummary.tool, "read");
	assert.equal(firstSummary.count, 20);
	assert.equal(firstSummary.completed_calls, 20);
	assert.equal(firstSummary.avg_ms, 5);
});
