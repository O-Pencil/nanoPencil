/**
 * [INPUT]: unconsolidated episodes, LlmFn (optional), config
 * [OUTPUT]: newly extracted MemoryEntries (facts + lessons) promoted to long-term storage
 * [POS]: Episodic→Semantic consolidation — heart of multi-store memory model
 *
 * Two modes:
 *   LLM-powered (preferred): produces high-quality semantic extraction
 *   Heuristic fallback: frequency-based file/error extraction
 */

import type { NanomemConfig } from "./config.js";
import { PROMPTS } from "./i18n.js";
import { extractTags } from "./scoring.js";
import { deriveNameFromContent, deriveSummaryFromContent } from "./store.js";
import type { Episode, LlmFn, MemoryEntry } from "./types.js";

function makeId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function consolidateEpisodes(
	episodes: Episode[],
	cfg: NanomemConfig,
	llmFn?: LlmFn,
): Promise<MemoryEntry[]> {
	const unconsolidated = episodes.filter((ep) => !ep.consolidated);
	if (unconsolidated.length < cfg.consolidationThreshold) return [];

	let newEntries: MemoryEntry[];
	if (llmFn) {
		newEntries = await llmConsolidation(unconsolidated, cfg, llmFn);
	} else {
		newEntries = heuristicConsolidation(unconsolidated, cfg);
	}

	for (const ep of unconsolidated) ep.consolidated = true;
	return newEntries;
}

async function llmConsolidation(episodes: Episode[], cfg: NanomemConfig, llmFn: LlmFn): Promise<MemoryEntry[]> {
	const p = PROMPTS[cfg.locale] ?? PROMPTS.en;
	const summary = episodes
		.map(
			(ep) =>
				`[${ep.date}] ${ep.project}: ${ep.summary}\nFiles: ${ep.filesModified.join(", ")}\nErrors: ${ep.errors.join("; ") || "none"}`,
		)
		.join("\n\n");

	const raw = await llmFn(p.consolidationSystem, summary);

	try {
		const items = JSON.parse(raw) as Array<{
			type: string;
			name?: string;
			summary?: string;
			detail?: string;
			content?: string;
			importance?: number;
		}>;
		const now = new Date().toISOString();
		return items.map((item) => {
			const type: MemoryEntry["type"] = item.type === "lesson" ? "lesson" : "fact";
			const detail = item.detail || item.content || "";
			const name = item.name || deriveNameFromContent(detail);
			const summary = item.summary || deriveSummaryFromContent(detail);
			return {
				id: makeId(),
				type,
				name,
				summary,
				detail,
				content: detail,
				tags: extractTags(`${name} ${summary} ${detail}`),
				project: episodes[0]?.project ?? "unknown",
				importance: item.importance ?? 6,
				strength: cfg.halfLife[type] ?? 30,
				created: now,
				eventTime: now,
				accessCount: 0,
				relatedIds: [],
				scope: cfg.defaultScope,
			};
		});
	} catch {
		return heuristicConsolidation(episodes, cfg);
	}
}

function heuristicConsolidation(episodes: Episode[], cfg: NanomemConfig): MemoryEntry[] {
	const now = new Date().toISOString();
	const result: MemoryEntry[] = [];

	const fileCounts = new Map<string, number>();
	for (const ep of episodes) {
		for (const f of ep.filesModified) fileCounts.set(f, (fileCounts.get(f) ?? 0) + 1);
	}
	const hotFiles = [...fileCounts.entries()]
		.filter(([, c]) => c >= 3)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 5);

	if (hotFiles.length) {
		const detail = `Frequently modified files: ${hotFiles.map(([f, c]) => `${f} (${c}x)`).join(", ")}`;
		const name = deriveNameFromContent(detail);
		const summary = deriveSummaryFromContent(detail);
		result.push({
			id: makeId(),
			type: "fact",
			name,
			summary,
			detail,
			content: detail,
			tags: extractTags(detail),
			project: episodes[0]?.project ?? "unknown",
			importance: 5,
			strength: cfg.halfLife.fact ?? 60,
			created: now,
			eventTime: now,
			accessCount: 0,
			relatedIds: [],
			scope: cfg.defaultScope,
		});
	}

	const allErrors = episodes.flatMap((ep) => ep.errors).filter(Boolean);
	if (allErrors.length) {
		const errorSet = [...new Set(allErrors)].slice(0, 5);
		const detail = `Recurring issues: ${errorSet.join("; ")}`;
		const name = deriveNameFromContent(detail);
		const summary = deriveSummaryFromContent(detail);
		result.push({
			id: makeId(),
			type: "lesson",
			name,
			summary,
			detail,
			content: detail,
			tags: extractTags(detail),
			project: episodes[0]?.project ?? "unknown",
			importance: 7,
			strength: cfg.halfLife.lesson ?? 90,
			created: now,
			eventTime: now,
			accessCount: 0,
			relatedIds: [],
			scope: cfg.defaultScope,
		});
	}

	return result;
}
