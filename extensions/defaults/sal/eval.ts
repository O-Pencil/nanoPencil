/**
 * [WHO]: Provides EvalSink, EvalVariant, EvalEvent, EvalEventEnvelope, createEvalEvent, createEvalSink
 * [FROM]: Depends on node:https, node:http, node:url, node:crypto for HTTP POST + UUID; no internal project deps
 * [TO]: Consumed by extensions/defaults/sal/index.ts for experiment telemetry
 * [HERE]: extensions/defaults/sal/eval.ts - batched eval event sink for InsForge; EvalEventType: run_start | run_end | turn_anchor
 */

import { request } from "node:https";
import { request as httpRequest } from "node:http";
import { URL } from "node:url";
import { randomUUID } from "node:crypto";

// ============================================================================
// Types
// ============================================================================

export type EvalVariant = "sal" | "control" | "baseline";

export type EvalEventType =
	| "run_start"
	| "run_end"
	| "turn_anchor";

/** Wire format matching InsForge EvalEventEnvelope schema. */
export interface EvalEventEnvelope {
	run_id: string;
	event_id: string;
	event_type: EvalEventType;
	variant: EvalVariant;
	ts: string;
	payload: Record<string, unknown>;
	metadata?: Record<string, unknown>;
}

/** Batch format matching InsForge EvalEventBatch schema. */
export interface EvalEventBatch {
	run_id: string;
	batch_id: string;
	events: EvalEventEnvelope[];
}

export interface EvalSink {
	readonly enabled: boolean;
	sendEvent(event: EvalEventEnvelope): Promise<void>;
	flush(): Promise<void>;
	close(): Promise<void>;
}

// ============================================================================
// Factory helpers
// ============================================================================

export interface CreateEvalSinkOptions {
	enabled: boolean;
	endpoint?: string;
	runId: string;
	headers?: Record<string, string>;
	/** Ingestion key (ik_…) — sent as x-api-key header. */
	apiKey?: string;
	apiKeyHeader?: string;
	/** Anon/JWT key — sent as apikey + Authorization: Bearer headers (PostgREST auth). */
	anonKey?: string;
	/** Target table name (default "eval_events"). */
	tableName?: string;
	/** Batch size (default 10). */
	batchSize?: number;
	/** Flush interval ms (default 2000). */
	batchIntervalMs?: number;
}

export function createEvalEvent(
	eventType: EvalEventType,
	runId: string,
	variant: EvalVariant,
	payload: Record<string, unknown>,
	metadata: Record<string, unknown> = {},
): EvalEventEnvelope {
	return {
		run_id: runId,
		event_id: randomUUID(),
		event_type: eventType,
		variant,
		ts: new Date().toISOString(),
		payload,
		metadata,
	};
}

export function createEvalSink(options: CreateEvalSinkOptions): EvalSink {
	if (!options.enabled || !options.endpoint) {
		return noopSink;
	}

	return new HttpEvalSink(options);
}

// ============================================================================
// Noop Sink
// ============================================================================

const noopSink: EvalSink = {
	enabled: false,
	sendEvent: async () => {},
	flush: async () => {},
	close: async () => {},
};

// ============================================================================
// HTTP Batch Sink
// ============================================================================

class HttpEvalSink implements EvalSink {
	readonly enabled = true;

	private endpoint: string;
	private batchUrl: string;
	private headers: Record<string, string>;
	private pending: EvalEventEnvelope[] = [];
	private runId: string;
	private batchSize: number;
	private batchIntervalMs: number;
	private flushTimer: ReturnType<typeof setTimeout> | undefined;
	private closed = false;

	constructor(options: CreateEvalSinkOptions) {
		this.endpoint = options.endpoint!;
		const tableName = options.tableName ?? "eval_events";
		this.batchUrl = `${this.endpoint.replace(/\/+$/, "")}/api/database/records/${tableName}`;
		this.runId = options.runId;
		this.batchSize = options.batchSize ?? 10;
		this.batchIntervalMs = options.batchIntervalMs ?? 2000;

		const baseHeaders: Record<string, string> = {
			"Content-Type": "application/json",
			...(options.headers ?? {}),
		};
		// PostgREST auth: anon key in both apikey and Authorization headers
		if (options.anonKey) {
			baseHeaders["apikey"] = options.anonKey;
			baseHeaders["Authorization"] = `Bearer ${options.anonKey}`;
		}
		// Ingestion key: separate header (overrides Authorization if no anonKey)
		if (options.apiKey) {
			const header = options.apiKeyHeader ?? "x-api-key";
			baseHeaders[header] = options.apiKey;
			if (!options.anonKey) {
				// Fallback: use apiKey as Bearer when no anonKey provided
				baseHeaders["Authorization"] = `Bearer ${options.apiKey}`;
			}
		}
		this.headers = baseHeaders;
	}

	async sendEvent(event: EvalEventEnvelope): Promise<void> {
		if (this.closed) return;
		this.pending.push(event);

		if (this.pending.length >= this.batchSize) {
			await this.flushPending();
			return;
		}
		this.scheduleFlush();
	}

	async flush(): Promise<void> {
		if (this.flushTimer) {
			clearTimeout(this.flushTimer);
			this.flushTimer = undefined;
		}
		while (this.pending.length > 0) {
			const before = this.pending.length;
			await this.flushPending();
			if (this.pending.length >= before) break;
		}
	}

	async close(): Promise<void> {
		this.closed = true;
		await this.flush();
	}

	private scheduleFlush(): void {
		if (this.flushTimer) return;
		this.flushTimer = setTimeout(() => {
			this.flushTimer = undefined;
			this.flushPending().catch(() => {});
		}, this.batchIntervalMs);
	}

	private async flushPending(): Promise<void> {
		if (this.pending.length === 0) return;

		const batch = this.pending.splice(0, this.batchSize);
		// PostgREST batch insert: array of rows directly
		const ok = await this.postJson(this.batchUrl, batch);
		if (!ok) {
			// Re-enqueue on failure (prepend to preserve order)
			this.pending.unshift(...batch);
		}
	}

	private postJson(url: string, body: unknown): Promise<boolean> {
		return new Promise((resolve) => {
			const payload = JSON.stringify(body);
			let parsed: URL;
			try {
				parsed = new URL(url);
			} catch {
				console.error(`[sal][eval] invalid endpoint URL: ${url}`);
				resolve(false);
				return;
			}
			const isHttps = parsed.protocol === "https:";
			const requestFn = isHttps ? request : httpRequest;
			const port = parsed.port ? Number(parsed.port) : (isHttps ? 443 : 80);
			const req = requestFn(
				{
					hostname: parsed.hostname,
					port,
					path: parsed.pathname + parsed.search,
					method: "POST",
					headers: {
						...this.headers,
						"Content-Length": Buffer.byteLength(payload),
					},
					timeout: 5000,
				},
				(res) => {
					let rawBody = "";
					res.setEncoding("utf-8");
					res.on("data", (chunk) => { rawBody += chunk; });
					res.on("end", () => {
						const ok = res.statusCode !== undefined && res.statusCode < 300;
						if (!ok) {
							console.error(
								`[sal][eval] HTTP ${res.statusCode} from ${parsed.hostname}${parsed.pathname} — ${rawBody.slice(0, 200)}`,
							);
						}
						resolve(ok);
					});
				},
			);
			req.on("error", (err) => {
				console.error(`[sal][eval] network error → ${parsed.hostname}: ${err.message}`);
				resolve(false);
			});
			req.on("timeout", () => {
				console.error(`[sal][eval] timeout posting to ${parsed.hostname}`);
				req.destroy();
				resolve(false);
			});
			req.write(payload);
			req.end();
		});
	}
}
