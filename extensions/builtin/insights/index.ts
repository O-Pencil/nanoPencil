/**
 * [WHO]: insights extension default export (/insights command)
 * [FROM]: Depends on node:path, node:fs/promises, core/extensions-host/types, core/session/session-manager, ./types, ./stats, ./insights-engine, ./html-report, ./prompts, ./session-scanner
 * [TO]: Auto-loaded by builtin-extensions.ts as a default extension
 * [HERE]: extensions/builtin/insights/index.ts - /insights command entry; usage-report pipeline
 *
 * /insights command — generate a usage report analyzing nanoPencil sessions.
 *
 * 1:1 port of Claude Code src/commands/insights.ts generateUsageReport() pipeline.
 *
 * Pipeline:
 * 1. scanAllSessions() — filesystem metadata only (no JSONL parsing)
 * 2. Load SessionMeta — cache-first, parse uncached
 * 3. Deduplicate session branches
 * 4. Filter substantive sessions (≥2 user messages, ≥1 minute)
 * 5. Facet extraction — cache-first, LLM for uncached (max 50)
 * 6. Filter minimal sessions (warmup_minimal only)
 * 7. aggregateData() — cross-session statistics
 * 8. generateParallelInsights() — 7+ parallel LLM calls
 * 9. generateHtmlReport() — HTML report with charts
 * 10. Save report + terminal summary
 */

import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import type { ExtensionAPI, ExtensionCommandContext } from "../../../core/extensions-host/types.js";
import { loadEntriesFromFile } from "../../../core/session/session-manager.js";
import type { SessionEntry, SessionMessageEntry } from "../../../core/session/session-manager.js";
import type { SessionMeta, SessionFacets, LiteSessionInfo } from "./types.js";
import {
	scanAllSessions,
	entriesToSessionMeta,
	loadCachedSessionMeta,
	saveSessionMeta,
	loadCachedFacets,
	saveFacets,
} from "./session-scanner.js";
import { aggregateData } from "./stats.js";
import { extractFacetsFromTranscript, generateParallelInsights } from "./insights-engine.js";
import { generateHtmlReport } from "./html-report.js";

// ============================================================================
// Constants
// ============================================================================

const CACHE_DIR = "usage-data";
const META_BATCH_SIZE = 50;
const MAX_SESSIONS_TO_LOAD = 200;
const LOAD_BATCH_SIZE = 10;
const MAX_FACET_EXTRACTIONS = 50;
const FACET_CONCURRENCY = 50;

// ============================================================================
// Helpers
// ============================================================================

function getDataDir(agentDir: string): string {
	return join(agentDir, CACHE_DIR);
}

/**
 * Filter out meta-sessions (facet extraction API calls get logged as sessions).
 */
function isMetaSession(entries: SessionEntry[]): boolean {
	for (const entry of entries.slice(0, 5)) {
		if (entry.type !== "message") continue;
		const msg = (entry as SessionMessageEntry).message;
		if (msg.role === "user") {
			const content = msg.content;
			const text = typeof content === "string" ? content : content.map((c: { type: string; text?: string }) => ("text" in c ? (c as { text: string }).text : "")).join("");
			if (text.includes("RESPOND WITH ONLY A VALID JSON OBJECT") || text.includes("record_facets")) {
				return true;
			}
		}
	}
	return false;
}

/**
 * Check if a session has valid dates (non-empty start time).
 */
function hasValidDates(entries: SessionEntry[]): boolean {
	for (const entry of entries) {
		if (entry.type === "message" && entry.timestamp) return true;
	}
	return false;
}

/**
 * Load entries from a session file, filtering to SessionEntry[] (no SessionHeader).
 */
function loadSessionEntries(filePath: string): SessionEntry[] {
	const allEntries = loadEntriesFromFile(filePath);
	return allEntries.filter((e): e is SessionEntry => e.type !== "session");
}

// ============================================================================
// Main pipeline
// ============================================================================

async function generateUsageReport(
	ctx: ExtensionCommandContext,
): Promise<{ htmlPath: string; sessionCount: number; messageCount: number; dateRange: { start: string; end: string }; totalSessionsScanned: number }> {
	const agentDir = ctx.agentDir;
	const sessionsDir = join(agentDir, "sessions");
	const dataDir = getDataDir(agentDir);

	// Phase 1: Lite scan — filesystem metadata only
	const allScannedSessions = await scanAllSessions(sessionsDir);
	const totalSessionsScanned = allScannedSessions.length;

	if (totalSessionsScanned === 0) {
		throw new Error("No sessions found. Start a conversation first!");
	}

	// Phase 2: Load SessionMeta — cache where available, parse only uncached
	let allMetas: SessionMeta[] = [];
	const uncachedSessions: LiteSessionInfo[] = [];

	for (let i = 0; i < allScannedSessions.length; i += META_BATCH_SIZE) {
		const batch = allScannedSessions.slice(i, i + META_BATCH_SIZE);
		const results = await Promise.all(
			batch.map(async (sessionInfo) => ({
				sessionInfo,
				cached: await loadCachedSessionMeta(sessionInfo.sessionId, agentDir),
			})),
		);
		for (const { sessionInfo, cached } of results) {
			if (cached) {
				allMetas.push(cached);
			} else if (uncachedSessions.length < MAX_SESSIONS_TO_LOAD) {
				uncachedSessions.push(sessionInfo);
			}
		}
	}

	// Load uncached sessions in batches
	const entriesForFacets = new Map<string, SessionEntry[]>();

	for (let i = 0; i < uncachedSessions.length; i += LOAD_BATCH_SIZE) {
		const batch = uncachedSessions.slice(i, i + LOAD_BATCH_SIZE);
		for (const sessionInfo of batch) {
			try {
				const entries = loadSessionEntries(sessionInfo.path);
				if (isMetaSession(entries) || !hasValidDates(entries)) continue;

				const meta = entriesToSessionMeta(entries, sessionInfo.sessionId, "");
				allMetas.push(meta);
				await saveSessionMeta(meta, agentDir);

				// Keep entries for potential facet extraction
				entriesForFacets.set(meta.session_id, entries);
			} catch {
				// Skip unreadable sessions
			}
		}
	}

	// Phase 3: Deduplicate session branches (keep most user messages per session_id)
	const bestBySession = new Map<string, SessionMeta>();
	for (const meta of allMetas) {
		const existing = bestBySession.get(meta.session_id);
		if (
			!existing ||
			meta.user_message_count > existing.user_message_count ||
			(meta.user_message_count === existing.user_message_count && meta.duration_minutes > existing.duration_minutes)
		) {
			bestBySession.set(meta.session_id, meta);
		}
	}
	const keptIds = new Set(Array.from(bestBySession.keys()));
	allMetas = Array.from(bestBySession.values());
	for (const id of Array.from(entriesForFacets.keys())) {
		if (!keptIds.has(id)) entriesForFacets.delete(id);
	}

	// Sort by start_time descending
	allMetas.sort((a, b) => b.start_time.localeCompare(a.start_time));

	// Phase 4: Filter substantive sessions
	const isSubstantive = (meta: SessionMeta): boolean =>
		meta.user_message_count >= 2 && meta.duration_minutes >= 1;

	const substantiveMetas = allMetas.filter(isSubstantive);

	// Phase 5: Facet extraction — cache-first, LLM for uncached
	const facets = new Map<string, SessionFacets>();
	const toExtract: Array<{ entries: SessionEntry[]; sessionId: string }> = [];

	// Load cached facets in parallel
	const cachedFacetResults = await Promise.all(
		substantiveMetas.map(async (meta) => ({
			sessionId: meta.session_id,
			cached: await loadCachedFacets(meta.session_id, agentDir),
		})),
	);

	for (const { sessionId, cached } of cachedFacetResults) {
		if (cached) {
			facets.set(sessionId, cached);
		} else {
			const entries = entriesForFacets.get(sessionId);
			if (entries && toExtract.length < MAX_FACET_EXTRACTIONS) {
				toExtract.push({ entries, sessionId });
			}
		}
	}

	// Extract facets in batches
	for (let i = 0; i < toExtract.length; i += FACET_CONCURRENCY) {
		const batch = toExtract.slice(i, i + FACET_CONCURRENCY);
		const results = await Promise.all(
			batch.map(async ({ entries, sessionId }) => {
				const newFacets = await extractFacetsFromTranscript(entries, sessionId, ctx);
				return { sessionId, newFacets };
			}),
		);
		const facetsToSave: SessionFacets[] = [];
		for (const { sessionId, newFacets } of results) {
			if (newFacets) {
				facets.set(sessionId, newFacets);
				facetsToSave.push(newFacets);
			}
		}
		await Promise.all(facetsToSave.map((f) => saveFacets(f, agentDir)));
	}

	// Phase 6: Filter minimal sessions (warmup_minimal only)
	const isMinimal = (sessionId: string): boolean => {
		const f = facets.get(sessionId);
		if (!f) return false;
		const cats = Object.keys(f.goal_categories).filter((k) => (f.goal_categories[k] ?? 0) > 0);
		return cats.length === 1 && cats[0] === "warmup_minimal";
	};

	const substantiveSessions = substantiveMetas.filter((s) => !isMinimal(s.session_id));
	const substantiveFacets = new Map<string, SessionFacets>();
	for (const [id, f] of Array.from(facets)) {
		if (!isMinimal(id)) substantiveFacets.set(id, f);
	}

	// Phase 7: Aggregate data
	const aggregated = aggregateData(substantiveSessions, substantiveFacets);
	aggregated.total_sessions_scanned = totalSessionsScanned;

	// Phase 8: Generate parallel insights
	const insights = await generateParallelInsights(aggregated, facets, ctx);

	// Phase 9: Generate HTML report
	const htmlReport = generateHtmlReport(aggregated, insights);

	// Phase 10: Save report
	await mkdir(dataDir, { recursive: true });
	const htmlPath = join(dataDir, "report.html");
	await writeFile(htmlPath, htmlReport, { encoding: "utf-8", mode: 0o600 });

	return {
		htmlPath,
		sessionCount: aggregated.total_sessions,
		messageCount: aggregated.total_messages,
		dateRange: aggregated.date_range,
		totalSessionsScanned,
	};
}

// ============================================================================
// Terminal summary builder
// ============================================================================

function buildTerminalSummary(
	htmlPath: string,
	sessionCount: number,
	messageCount: number,
	totalSessionsScanned: number,
	dateRange: { start: string; end: string },
): string {
	const sessionLabel =
		totalSessionsScanned > sessionCount
			? `${totalSessionsScanned.toLocaleString()} sessions total · ${sessionCount} analyzed`
			: `${sessionCount} sessions`;

	return [
		`# nanoPencil Insights`,
		``,
		`${sessionLabel} · ${messageCount.toLocaleString()} messages`,
		`${dateRange.start} to ${dateRange.end}`,
		``,
		`Your full insights report is ready: file://${htmlPath}`,
		``,
		`Want to dig into any section or try one of the suggestions?`,
	].join("\n");
}

// ============================================================================
// Extension entry point
// ============================================================================

export default async function insightsExtension(api: ExtensionAPI): Promise<void> {
	api.registerCommand("insights", {
		description: "Generate a report analyzing your nanoPencil sessions",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			try {
				ctx.ui.notify("Analyzing your sessions...", "info");

				const { htmlPath, sessionCount, messageCount, dateRange, totalSessionsScanned } = await generateUsageReport(ctx);

				const summary = buildTerminalSummary(
					htmlPath,
					sessionCount,
					messageCount,
					totalSessionsScanned,
					dateRange,
				);

				ctx.ui.notify(summary, "info");
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				ctx.ui.notify(`Insights error: ${message}`, "error");
			}
		},
	});
}
