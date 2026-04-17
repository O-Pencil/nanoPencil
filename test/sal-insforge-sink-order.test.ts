import assert from "node:assert/strict";
import test from "node:test";
import { InsForgeEvalSink } from "../extensions/defaults/sal/eval/insforge-sink.js";
import type { EvalEventEnvelope } from "../extensions/defaults/sal/eval/types.js";

function event(eventType: EvalEventEnvelope["event_type"]): EvalEventEnvelope {
	return {
		run_id: "run-order-test",
		event_id: `${eventType}-${Math.random().toString(16).slice(2)}`,
		event_type: eventType,
		variant: "sal",
		ts: new Date().toISOString(),
		payload: {},
	};
}

test("insforge sink routes batched events sequentially (run_start before turn_anchor)", async () => {
	const sink = new InsForgeEvalSink({
		enabled: true,
		endpoint: "https://example.insforge.app",
		runId: "run-order-test",
		batchIntervalMs: 1,
	});

	const order: string[] = [];
	let active = 0;
	let maxActive = 0;
	(sink as any).routeEvent = async (ev: EvalEventEnvelope) => {
		active += 1;
		maxActive = Math.max(maxActive, active);
		order.push(ev.event_type);
		await new Promise((resolve) => setTimeout(resolve, 20));
		active -= 1;
	};

	await sink.sendEvent(event("run_start"));
	await sink.sendEvent(event("turn_anchor"));
	await new Promise((resolve) => setTimeout(resolve, 80));

	assert.equal(maxActive, 1);
	assert.equal(order[0], "run_start");
	assert.equal(order[1], "turn_anchor");
});
