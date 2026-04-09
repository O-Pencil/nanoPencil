/**
 * [WHO]: Worker entry for SubprocessSubAgentBackend
 * [FROM]: Depends on node:worker_threads
 * [TO]: Spawned by SubprocessSubAgentBackend
 * [HERE]: core/sub-agent/subprocess-worker.ts
 *
 * Minimal isolated worker. Receives a `WorkerSpec` via workerData, runs
 * a trivial echo loop, and posts a `result` message back. This is the
 * harness that proves the channel + abort + lifecycle wiring; full agent
 * execution inside the worker is intentionally deferred (see backend doc).
 */

import { parentPort, workerData } from "node:worker_threads";

interface WorkerSpec {
	id: string;
	prompt: string;
	cwd: string;
	timeoutMs?: number;
}

const spec = workerData as WorkerSpec;
let aborted = false;

parentPort?.on("message", (msg: { type: string }) => {
	if (msg.type === "abort") {
		aborted = true;
	}
});

async function run(): Promise<void> {
	// Simulate a tiny amount of work so abort has a window to fire.
	await new Promise((resolve) => setTimeout(resolve, 10));
	if (aborted) {
		parentPort?.postMessage({ type: "error", payload: { error: "Aborted" } });
		return;
	}
	parentPort?.postMessage({
		type: "result",
		payload: {
			success: true,
			response: `[subprocess-worker:${spec.id}] received prompt of ${spec.prompt.length} chars in cwd ${spec.cwd}`,
		},
	});
}

run().catch((err: unknown) => {
	parentPort?.postMessage({
		type: "error",
		payload: { error: err instanceof Error ? err.message : String(err) },
	});
});
