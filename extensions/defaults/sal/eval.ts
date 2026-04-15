/**
 * [WHO]: Provides EvalSink, EvalVariant, createEvalEvent, createEvalSink
 * [FROM]: Depends on node:https for HTTP POST; no internal project deps
 * [TO]: Consumed by extensions/defaults/sal/index.ts for experiment telemetry
 * [HERE]: extensions/defaults/sal/eval.ts - lightweight eval event sink for SAL A/B experiments
 */

import { request } from "node:https";
import { request as httpRequest } from "node:http";
import { URL } from "node:url";

// ============================================================================
// Types
// ============================================================================

export type EvalVariant = "sal" | "control" | "baseline";

export type EvalEventType =
	| "run_start"
	| "run_end"
	| "turn_start"
	| "turn_end"
	| "sal_anchor"
	| "sal_coverage_check"
	| "tool_call"
	| "tool_result";

export interface EvalEvent {
	event_type: EvalEventType;
	run_id: string;
	variant: EvalVariant;
	timestamp: string;
	payload: Record<string, unknown>;
	metadata: Record<string, unknown>;
}

export interface EvalSink {
	readonly enabled: boolean;
	sendEvent(event: EvalEvent): Promise<void>;
	flush(): Promise<void>;
	close(): Promise<void>;
}

// ============================================================================
// Factory
// ============================================================================

export interface CreateEvalSinkOptions {
	enabled: boolean;
	endpoint?: string;
	runId: string;
	headers?: Record<string, string>;
	apiKey?: string;
	apiKeyHeader?: string;
}

export function createEvalEvent(
	eventType: EvalEventType,
	runId: string,
	variant: EvalVariant,
	payload: Record<string, unknown>,
	metadata: Record<string, unknown> = {},
): EvalEvent {
	return {
		event_type: eventType,
		run_id: runId,
		variant,
		timestamp: new Date().toISOString(),
		payload,
		metadata,
	};
}

export function createEvalSink(options: CreateEvalSinkOptions): EvalSink {
	// Noop sink: disabled or no endpoint
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
// HTTP Sink
// ============================================================================

class HttpEvalSink implements EvalSink {
	readonly enabled = true;

	private endpoint: string;
	private headers: Record<string, string>;
	private queue: EvalEvent[] = [];
	private flushPromise: Promise<void> | null = null;

	constructor(options: CreateEvalSinkOptions) {
		this.endpoint = options.endpoint!;
		const baseHeaders: Record<string, string> = {
			"Content-Type": "application/json",
			...(options.headers ?? {}),
		};
		if (options.apiKey) {
			const header = options.apiKeyHeader ?? "Authorization";
			baseHeaders[header] = header.toLowerCase() === "authorization"
				? `Bearer ${options.apiKey}`
				: options.apiKey;
		}
		this.headers = baseHeaders;
	}

	async sendEvent(event: EvalEvent): Promise<void> {
		// Fire-and-forget with error swallowing — never block the agent
		this.postJson(event).catch(() => {
			// Enqueue for flush retry on transient errors
			this.queue.push(event);
		});
	}

	async flush(): Promise<void> {
		if (this.flushPromise) return this.flushPromise;
		this.flushPromise = this.drainQueue();
		await this.flushPromise;
		this.flushPromise = null;
	}

	async close(): Promise<void> {
		await this.flush();
	}

	private async drainQueue(): Promise<void> {
		const pending = this.queue.splice(0);
		await Promise.allSettled(pending.map((ev) => this.postJson(ev)));
	}

	private postJson(body: unknown): Promise<void> {
		return new Promise((resolve) => {
			const payload = JSON.stringify(body);
			let url: URL;
			try {
				url = new URL(this.endpoint);
			} catch {
				resolve();
				return;
			}
			const isHttps = url.protocol === "https:";
			const requestFn = isHttps ? request : httpRequest;
			const port = url.port ? Number(url.port) : (isHttps ? 443 : 80);
			const req = requestFn(
				{
					hostname: url.hostname,
					port,
					path: url.pathname + url.search,
					method: "POST",
					headers: {
						...this.headers,
						"Content-Length": Buffer.byteLength(payload),
					},
					timeout: 5000,
				},
				(res) => {
					// Drain response body to free socket
					res.resume();
					res.on("end", resolve);
				},
			);
			req.on("error", () => resolve());
			req.on("timeout", () => { req.destroy(); resolve(); });
			req.write(payload);
			req.end();
		});
	}
}
