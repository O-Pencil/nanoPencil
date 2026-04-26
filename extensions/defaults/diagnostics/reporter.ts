/**
 * [WHO]: reportDiagnostics(), buildReportPayload()
 * [FROM]: Depends on node:http, node:https, node:crypto, core extension context types, ./types.js, ./redaction.js
 * [TO]: Consumed by extensions/defaults/diagnostics/index.ts for user-approved issue uploads
 * [HERE]: extensions/defaults/diagnostics/reporter.ts - InsForge pencil_issue_events adapter kept inside diagnostics extension
 */

import { randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { URL } from "node:url";
import type { ExtensionContext } from "../../../core/extensions/types.js";
import type { DiagnosticRecord, DiagnosticReportPayload } from "./types.js";
import { sanitizeDiagnosticValue } from "./redaction.js";

const ISSUE_ENDPOINT_ENV = "NANOPENCIL_ISSUE_ENDPOINT";
const ISSUE_API_KEY_ENV = "NANOPENCIL_ISSUE_API_KEY";
const ISSUE_ANON_KEY_ENV = "NANOPENCIL_ISSUE_ANON_KEY";
const ISSUE_API_KEY_HEADER_ENV = "NANOPENCIL_ISSUE_API_KEY_HEADER";

interface ReportResult {
	ok: boolean;
	statusCode?: number;
	message: string;
}

export async function reportDiagnostics(
	records: DiagnosticRecord[],
	userNote: string | undefined,
	ctx: ExtensionContext,
): Promise<ReportResult> {
	const endpoint = process.env[ISSUE_ENDPOINT_ENV]?.replace(/\/+$/, "");
	if (!endpoint) {
		return {
			ok: false,
			message: `Issue reporting is not configured. Set ${ISSUE_ENDPOINT_ENV} to an InsForge app URL.`,
		};
	}

	const payload = buildReportPayload(records, userNote, ctx);
	const url = `${endpoint}/api/database/records/pencil_issue_events`;
	return postJson(url, [payload]);
}

export function buildReportPayload(
	records: DiagnosticRecord[],
	userNote: string | undefined,
	ctx: ExtensionContext,
): DiagnosticReportPayload {
	const primary = records[0];
	const model = ctx.model as { provider?: string; id?: string; model?: string; name?: string } | undefined;
	const sessionId = safeCall(() => ctx.sessionManager.getSessionId());
	const diagnostics = sanitizeDiagnosticValue(records) as DiagnosticRecord[];
	const context = primary?.context ?? {};
	return {
		session_id: str(context.session_id) ?? sessionId,
		version: str(context.version),
		commit_hash: str(context.commit_hash),
		mode: str(context.mode),
		source: primary?.source,
		severity: primary?.severity,
		category: primary?.category,
		message: primary?.message,
		fingerprint: primary?.fingerprint,
		provider: str(context.provider) ?? model?.provider,
		model_id: str(context.model_id) ?? model?.id ?? model?.model ?? model?.name,
		thinking: str(context.thinking),
		tool_summary: context.tool_summary ?? null,
		diagnostics,
		user_note: userNote ? String(sanitizeDiagnosticValue(userNote)) : undefined,
		user_approved: true,
		occurrence_count: records.reduce((sum, record) => sum + record.occurrence_count, 0),
		first_seen_at: records.reduce<string | undefined>((min, record) =>
			!min || record.first_seen_at < min ? record.first_seen_at : min, undefined),
		last_seen_at: records.reduce<string | undefined>((max, record) =>
			!max || record.last_seen_at > max ? record.last_seen_at : max, undefined),
		client_report_id: randomUUID(),
		created_at: new Date().toISOString(),
	};
}

function postJson(url: string, body: unknown): Promise<ReportResult> {
	return new Promise((resolve) => {
		const payload = JSON.stringify(body);
		let parsed: URL;
		try {
			parsed = new URL(url);
		} catch {
			resolve({ ok: false, message: "Invalid issue endpoint URL." });
			return;
		}
		const isHttps = parsed.protocol === "https:";
		const requestFn = isHttps ? httpsRequest : httpRequest;
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			"Content-Length": String(Buffer.byteLength(payload)),
		};
		const anonKey = process.env[ISSUE_ANON_KEY_ENV];
		const apiKey = process.env[ISSUE_API_KEY_ENV];
		if (anonKey) {
			headers.apikey = anonKey;
			headers.Authorization = `Bearer ${anonKey}`;
		}
		if (apiKey) {
			headers[process.env[ISSUE_API_KEY_HEADER_ENV] ?? "x-api-key"] = apiKey;
			if (!anonKey) headers.Authorization = `Bearer ${apiKey}`;
		}

		const req = requestFn(
			{
				hostname: parsed.hostname,
				port: parsed.port ? Number(parsed.port) : (isHttps ? 443 : 80),
				path: parsed.pathname + parsed.search,
				method: "POST",
				headers,
				timeout: 5000,
			},
			(res) => {
				let rawBody = "";
				res.setEncoding("utf-8");
				res.on("data", (chunk) => { rawBody += chunk; });
				res.on("end", () => {
					const ok = res.statusCode !== undefined && res.statusCode < 300;
					resolve({
						ok,
						statusCode: res.statusCode,
						message: ok ? "Diagnostic report uploaded." : `Issue upload failed: HTTP ${res.statusCode} ${rawBody.slice(0, 160)}`,
					});
				});
			},
		);
		req.on("error", (err) => resolve({ ok: false, message: `Issue upload failed: ${err.message}` }));
		req.on("timeout", () => {
			req.destroy();
			resolve({ ok: false, message: "Issue upload timed out." });
		});
		req.write(payload);
		req.end();
	});
}

function str(value: unknown): string | undefined {
	return typeof value === "string" && value ? value : undefined;
}

function safeCall<T>(fn: () => T): T | undefined {
	try {
		return fn();
	} catch {
		return undefined;
	}
}
