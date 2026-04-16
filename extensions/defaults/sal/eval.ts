/**
 * [WHO]: Provides EvalSink, EvalVariant, EvalEventEnvelope, createEvalEvent, createEvalSink
 * [FROM]: Depends on node:https, node:http, node:url, node:crypto; no internal project deps
 * [TO]: Consumed by extensions/defaults/sal/index.ts for experiment telemetry
 * [HERE]: extensions/defaults/sal/eval.ts - InsForge-native eval sink; routes run_start→eval_runs, turn_anchor→eval_turns+eval_sal_anchors, run_end→PATCH eval_runs
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

/** Wire format for eval events passed between index.ts and the sink. */
export interface EvalEventEnvelope {
	run_id: string;
	event_id: string;
	event_type: EvalEventType;
	variant: EvalVariant;
	ts: string;
	payload: Record<string, unknown>;
	metadata?: Record<string, unknown>;
}

export interface EvalSink {
	readonly enabled: boolean;
	sendEvent(event: EvalEventEnvelope): Promise<void>;
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
	/** Ingestion key (ik_…) — sent as x-api-key header. */
	apiKey?: string;
	apiKeyHeader?: string;
	/** Anon/JWT key — PostgREST auth: sent as apikey + Authorization: Bearer. */
	anonKey?: string;
	/** Skip TLS certificate verification (self-signed / private CA). */
	allowSelfSigned?: boolean;
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
	return new InsForgeEvalSink(options);
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
// InsForge Sink — routes events to dedicated tables
//
// eval_runs       ← run_start (INSERT), run_end (PATCH)
// eval_turns      ← turn_anchor (INSERT)
// eval_sal_anchors← turn_anchor × 2: anchor_type "task" + "action"
// ============================================================================

class InsForgeEvalSink implements EvalSink {
	readonly enabled = true;

	private base: string;
	private headers: Record<string, string>;
	private allowSelfSigned: boolean;
	private batchIntervalMs: number;
	private pending: EvalEventEnvelope[] = [];
	private flushTimer: ReturnType<typeof setTimeout> | undefined;
	private closed = false;

	constructor(options: CreateEvalSinkOptions) {
		this.base = options.endpoint!.replace(/\/+$/, "");
		this.batchIntervalMs = options.batchIntervalMs ?? 2000;
		this.allowSelfSigned = options.allowSelfSigned ?? false;
		if (this.allowSelfSigned) {
			console.warn("[sal][eval] TLS certificate verification disabled (allowSelfSigned=true)");
		}

		const h: Record<string, string> = {
			"Content-Type": "application/json",
			...(options.headers ?? {}),
		};
		if (options.anonKey) {
			h["apikey"] = options.anonKey;
			h["Authorization"] = `Bearer ${options.anonKey}`;
		}
		if (options.apiKey) {
			h[options.apiKeyHeader ?? "x-api-key"] = options.apiKey;
			if (!options.anonKey) {
				h["Authorization"] = `Bearer ${options.apiKey}`;
			}
		}
		this.headers = h;
	}

	async sendEvent(event: EvalEventEnvelope): Promise<void> {
		if (this.closed) return;
		this.pending.push(event);
		this.scheduleFlush();
	}

	async flush(): Promise<void> {
		if (this.flushTimer) {
			clearTimeout(this.flushTimer);
			this.flushTimer = undefined;
		}
		const toFlush = this.pending.splice(0);
		for (const event of toFlush) {
			await this.routeEvent(event);
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
			const toFlush = this.pending.splice(0);
			Promise.all(toFlush.map((e) => this.routeEvent(e))).catch(() => {});
		}, this.batchIntervalMs);
	}

	// ------------------------------------------------------------------
	// Routing
	// ------------------------------------------------------------------

	private async routeEvent(event: EvalEventEnvelope): Promise<void> {
		try {
			switch (event.event_type) {
				case "run_start":   await this.handleRunStart(event); break;
				case "turn_anchor": await this.handleTurnAnchor(event); break;
				case "run_end":     await this.handleRunEnd(event); break;
			}
		} catch (err) {
			console.error(`[sal][eval] route ${event.event_type} failed:`, (err as Error).message);
		}
	}

	// INSERT into eval_runs
	private async handleRunStart(ev: EvalEventEnvelope): Promise<void> {
		const p = ev.payload;
		await this.postJson(`${this.base}/api/database/records/eval_runs`, [{
			run_id:        ev.run_id,
			variant:       ev.variant,
			status:        "running",
			task_description: strOrNull(p.task_description),
			task_file:     strOrNull(p.task_file),
			model:         strOrNull(p.model),
			thinking:      p.thinking === true,
			commit_hash:   strOrNull(p.commit, "unknown"),
			branch_name:   strOrNull(p.branch, "unknown"),
			workspace_root: strOrNull(p.workspace_root),
			started_at:    ev.ts,
		}], { prefer: "resolution=ignore-duplicates" });
	}

	// INSERT into eval_turns + eval_sal_anchors (task + action)
	private async handleTurnAnchor(ev: EvalEventEnvelope): Promise<void> {
		const p = ev.payload;
		const turnId    = p.turn_id as number;
		const durationMs = p.duration_ms as number | undefined;
		const endedAt   = ev.ts;
		const startedAt = durationMs != null
			? new Date(new Date(ev.ts).getTime() - durationMs).toISOString()
			: ev.ts;

		await this.postJson(`${this.base}/api/database/records/eval_turns`, [{
			run_id:                   ev.run_id,
			turn_id:                  turnId,
			event_id:                 ev.event_id,
			user_prompt:              strOrNull(p.prompt_summary),
			duration_ms:              durationMs ?? null,
			started_at:               startedAt,
			ended_at:                 endedAt,
		}], { prefer: "resolution=ignore-duplicates" });

		// Task anchor
		const taskAnchor = p.task_anchor as Record<string, unknown> | null;
		if (taskAnchor) {
			await this.postJson(`${this.base}/api/database/records/eval_sal_anchors`, [{
				run_id:             ev.run_id,
				turn_id:            turnId,
				event_id:           `${ev.event_id}-task`,
				anchor_type:        "task",
				module_path:        strOrNull(taskAnchor.modulePath),
				file_path:          strOrNull(taskAnchor.filePath),
				confidence:         numOrNull(taskAnchor.confidence),
				candidates:         p.task_candidates ?? null,
				recorded_at:        ev.ts,
			}], { prefer: "resolution=ignore-duplicates" });
		}

		// Action anchor
		const actionAnchor = p.action_anchor as Record<string, unknown> | null;
		await this.postJson(`${this.base}/api/database/records/eval_sal_anchors`, [{
			run_id:             ev.run_id,
			turn_id:            turnId,
			event_id:           `${ev.event_id}-action`,
			anchor_type:        "action",
			module_path:        strOrNull(actionAnchor?.modulePath),
			file_path:          strOrNull(actionAnchor?.filePath),
			confidence:         numOrNull(actionAnchor?.confidence),
			touched_files:      p.action_files ?? null,
			recorded_at:        ev.ts,
		}], { prefer: "resolution=ignore-duplicates" });
	}

	// PATCH eval_runs — set status + final stats
	private async handleRunEnd(ev: EvalEventEnvelope): Promise<void> {
		const p = ev.payload;
		await this.patchJson(
			`${this.base}/api/database/records/eval_runs?run_id=eq.${ev.run_id}`,
			{
				status:           strOrNull(p.status) ?? "success",
				turn_count:       numOrNull(p.turn_count),
				total_duration_ms: numOrNull(p.total_duration_ms),
				ended_at:         ev.ts,
			},
		);
	}

	// ------------------------------------------------------------------
	// HTTP helpers
	// ------------------------------------------------------------------

	private postJson(url: string, body: unknown, extra?: { prefer?: string }): Promise<boolean> {
		const extraHeaders: Record<string, string> = {};
		if (extra?.prefer) extraHeaders["Prefer"] = extra.prefer;
		return this.httpJson("POST", url, body, extraHeaders);
	}

	private patchJson(url: string, body: unknown): Promise<boolean> {
		return this.httpJson("PATCH", url, body, {});
	}

	private httpJson(
		method: string,
		url: string,
		body: unknown,
		extraHeaders: Record<string, string>,
	): Promise<boolean> {
		return new Promise((resolve) => {
			const payload = JSON.stringify(body);
			let parsed: URL;
			try {
				parsed = new URL(url);
			} catch {
				console.error(`[sal][eval] invalid URL: ${url}`);
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
					method,
					headers: {
						...this.headers,
						...extraHeaders,
						"Content-Length": Buffer.byteLength(payload),
					},
					timeout: 5000,
					...(isHttps && this.allowSelfSigned ? { rejectUnauthorized: false } : {}),
				},
				(res) => {
					let rawBody = "";
					res.setEncoding("utf-8");
					res.on("data", (chunk) => { rawBody += chunk; });
					res.on("end", () => {
						const ok = res.statusCode !== undefined && res.statusCode < 300;
						if (!ok) {
							console.error(
								`[sal][eval] HTTP ${res.statusCode} ${method} ${parsed.pathname} — ${rawBody.slice(0, 300)}`,
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
				console.error(`[sal][eval] timeout ${method} ${parsed.pathname}`);
				req.destroy();
				resolve(false);
			});
			req.write(payload);
			req.end();
		});
	}
}

// ============================================================================
// Helpers
// ============================================================================

function strOrNull(v: unknown, skipValue?: string): string | null {
	if (v == null || v === "" || v === skipValue) return null;
	return String(v);
}

function numOrNull(v: unknown): number | null {
	if (v == null) return null;
	const n = Number(v);
	return isNaN(n) ? null : n;
}
