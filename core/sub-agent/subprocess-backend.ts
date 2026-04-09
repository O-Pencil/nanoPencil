/**
 * [WHO]: SubprocessSubAgentBackend
 * [FROM]: Depends on node:worker_threads, ./sub-agent-types
 * [TO]: Consumed by SubAgentRuntime when caller wants crash isolation
 * [HERE]: core/sub-agent/subprocess-backend.ts - Phase B B.6 multi-backend
 *
 * Crash-isolated SubAgent backend built on top of node:worker_threads.
 *
 * The worker thread runs the in-process backend in its own V8 isolate, so
 * an unhandled error inside a teammate cannot tear down the main session.
 * The Tool[] surface in `SubAgentSpec` is NOT serializable across the
 * worker boundary, so the caller must pre-stage tools by name and resolve
 * them inside the worker via `toolFactoryName`. For v1 we accept the same
 * profiles the team extension already uses ("read-only" / "sandboxed").
 *
 * Status: SHIPPED with the worker harness in place; the worker entry
 * itself is intentionally minimal (echo + abort) so the interface is real
 * and exercisable. The full agent loop inside the worker is deferred to a
 * follow-up because it requires re-creating the model registry inside the
 * isolate, which is out of scope for the AgentTeam Phase B milestone.
 *
 * The backend therefore documents itself honestly: callers that need real
 * LLM execution should keep using `InProcessSubAgentBackend`; callers that
 * just need an isolated bash/echo worker can use this one today.
 */

import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type {
	SubAgentBackend,
	SubAgentHandle,
	SubAgentResult,
	SubAgentSpec,
} from "./sub-agent-types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface SubprocessBackendOptions {
	/** Override the worker entry path (for tests). */
	workerEntry?: string;
}

interface WorkerSpec {
	id: string;
	prompt: string;
	cwd: string;
	timeoutMs?: number;
}

export class SubprocessSubAgentBackend implements SubAgentBackend {
	private readonly workerEntry: string;

	constructor(options: SubprocessBackendOptions = {}) {
		this.workerEntry = options.workerEntry ?? join(__dirname, "subprocess-worker.js");
	}

	async spawn(spec: SubAgentSpec): Promise<SubAgentHandle> {
		const id = crypto.randomUUID();
		const workerSpec: WorkerSpec = {
			id,
			prompt: spec.prompt,
			cwd: spec.cwd,
			timeoutMs: spec.timeoutMs,
		};

		const worker = new Worker(this.workerEntry, { workerData: workerSpec });

		let status: SubAgentHandle["status"] = "running";
		let resolved: SubAgentResult | undefined;

		const donePromise = new Promise<SubAgentResult>((resolve) => {
			const finish = (r: SubAgentResult, nextStatus: SubAgentHandle["status"]) => {
				if (resolved) return;
				resolved = r;
				status = nextStatus;
				resolve(r);
			};

			worker.on("message", (msg: { type: string; payload?: unknown }) => {
				if (msg.type === "result") {
					finish((msg.payload as SubAgentResult) ?? { success: true }, "done");
				} else if (msg.type === "error") {
					finish(
						{ success: false, error: String((msg.payload as { error?: string })?.error ?? "Worker error") },
						"error",
					);
				}
			});
			worker.on("error", (err) => {
				finish({ success: false, error: err.message }, "error");
			});
			worker.on("exit", (code) => {
				if (!resolved) {
					finish(
						{
							success: false,
							error: code === 0 ? "Worker exited without result" : `Worker exited with code ${code}`,
						},
						"error",
					);
				}
			});

			const onAbort = () => {
				if (!resolved) {
					worker.postMessage({ type: "abort" });
					finish({ success: false, error: "Aborted" }, "aborted");
					worker.terminate().catch(() => {});
				}
			};
			if (spec.signal.aborted) onAbort();
			else spec.signal.addEventListener("abort", onAbort, { once: true });
		});

		return {
			id,
			get status() {
				return status;
			},
			async result(): Promise<SubAgentResult> {
				return donePromise;
			},
			async abort(): Promise<void> {
				if (!resolved) {
					worker.postMessage({ type: "abort" });
					await worker.terminate().catch(() => {});
				}
			},
			async terminate(): Promise<void> {
				await worker.terminate().catch(() => {});
			},
		};
	}
}
