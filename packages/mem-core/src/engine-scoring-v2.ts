/**
 * [WHO]: Provides currentStructuralAnchor, computeStructuralBoost, scoreEpisodeMemory, scoreEpisodeFacet, scoreV2SemanticMemory, scoreProceduralMemory
 * [FROM]: Depends on ./scoring.js for daysSince, extractTags, tagOverlap; ./types-v2.js for V2 memory types; ./turn-context.js for the generic per-turn hint bus
 * [TO]: Consumed by engine.ts, engine-recall-select.ts, engine-episode-sync.ts, engine-v2-mapping.ts
 * [HERE]: packages/mem-core/src/engine-scoring-v2.ts - V2 memory scoring and structural proximity computation; reads structural anchors from any extension that publishes to the turn-context bus
 */

import { daysSince, extractTags, tagOverlap } from "./scoring.js";
import { getTurnContext } from "./turn-context.js";
import type { BaseMemoryV2, EpisodeFacet, EpisodeMemory, ProceduralMemory, SemanticMemory } from "./types-v2.js";

/** Read the current structural anchor (or undefined when no producer has published one). */
export function currentStructuralAnchor(): { modulePath?: string; filePath?: string } | undefined {
	const anchor = getTurnContext("structuralAnchor");
	if (!anchor || (!anchor.modulePath && !anchor.filePath)) return undefined;
	return {
		modulePath: anchor.modulePath,
		filePath: anchor.filePath,
	};
}

/**
 * Compute structural proximity boost from the active turn's structural anchor.
 * Reads from the generic turn-context bus; returns 0 when no anchor has been
 * published or when no overlap with the entry's paths is found. Producer-agnostic.
 */
export function computeStructuralBoost(entry: BaseMemoryV2): number {
	const anchor = getTurnContext("structuralAnchor");
	const anchorPaths = anchor?.candidatePaths;
	if (!anchorPaths || anchorPaths.length === 0) return 0;

	const entryPaths: string[] = [];
	if (entry.structuralAnchor) {
		if (entry.structuralAnchor.modulePath) entryPaths.push(entry.structuralAnchor.modulePath);
		if (entry.structuralAnchor.filePath) entryPaths.push(entry.structuralAnchor.filePath);
	}
	if (entry.evidence) {
		for (const ev of entry.evidence) {
			if (ev.filePath) entryPaths.push(ev.filePath);
		}
	}
	const ep = entry as any;
	if (Array.isArray(ep.filesModified)) {
		for (const f of ep.filesModified) {
			if (typeof f === "string") entryPaths.push(f);
		}
	}
	if (entryPaths.length === 0) return 0;

	const anchorSet = new Set(anchorPaths);
	let hits = 0;
	for (const p of entryPaths) {
		// Match full path or module prefix
		if (anchorSet.has(p)) { hits++; continue; }
		for (const a of anchorPaths) {
			if (p.startsWith(a + "/") || a.startsWith(p + "/")) { hits++; break; }
		}
	}
	return Math.min(hits / entryPaths.length, 1);
}

export function scoreEpisodeMemory(entry: EpisodeMemory, project: string, contextTags: string[], structuralWeight: number): number {
	const projectBoost = !project ? 0.8 : entry.scope?.project === project ? 1 : 0.55;
	const tagScore = tagOverlap(entry.tags, contextTags);
	const summaryTags = extractTags(`${entry.title ?? ""} ${entry.summary} ${entry.userGoal ?? ""} ${entry.outcome ?? ""}`);
	const semanticScore = tagOverlap(summaryTags, contextTags);
	const recency = 1 / (1 + daysSince(entry.updatedAt || entry.createdAt));
	const salienceBoost = (entry.salience ?? entry.importance) / 10;
	return projectBoost * (0.45 + 0.55 * Math.max(tagScore, semanticScore)) + recency * 0.18 + salienceBoost * 0.22 + computeStructuralBoost(entry) * structuralWeight;
}

export function scoreEpisodeFacet(entry: EpisodeFacet, project: string, contextTags: string[], structuralWeight: number): number {
	const projectBoost = !project ? 0.8 : entry.scope?.project === project ? 1 : 0.55;
	const tagScore = tagOverlap(entry.tags, contextTags);
	const semanticTags = extractTags(`${entry.searchText} ${entry.anchorText ?? ""} ${entry.summary ?? ""}`);
	const semanticScore = tagOverlap(semanticTags, contextTags);
	const recency = 1 / (1 + daysSince(entry.updatedAt || entry.createdAt));
	const salienceBoost = (entry.salience ?? entry.importance) / 10;
	return projectBoost * (0.45 + 0.55 * Math.max(tagScore, semanticScore)) + recency * 0.15 + salienceBoost * 0.24 + computeStructuralBoost(entry) * structuralWeight;
}

export function scoreV2SemanticMemory(entry: SemanticMemory, project: string, contextTags: string[], structuralWeight: number): number {
	const projectBoost = !project ? 0.8 : entry.scope?.project === project ? 1 : 0.55;
	const tagScore = tagOverlap(entry.tags, contextTags);
	const semanticTags = extractTags(`${entry.name} ${entry.summary} ${entry.detail ?? ""}`);
	const semanticScore = tagOverlap(semanticTags, contextTags);
	const recency = 1 / (1 + daysSince(entry.updatedAt || entry.createdAt));
	const salienceBoost = (entry.salience ?? entry.importance) / 10;
	return projectBoost * (0.45 + 0.55 * Math.max(tagScore, semanticScore)) + recency * 0.14 + salienceBoost * 0.2 + computeStructuralBoost(entry) * structuralWeight;
}

export function scoreProceduralMemory(entry: ProceduralMemory, project: string, contextTags: string[], structuralWeight: number): number {
	const projectBoost = !project ? 0.8 : entry.scope?.project === project ? 1 : 0.55;
	const tagScore = tagOverlap(entry.tags, contextTags);
	const summaryTags = extractTags(`${entry.searchText} ${entry.summary} ${entry.contextText ?? ""}`);
	const semanticScore = tagOverlap(summaryTags, contextTags);
	const recency = 1 / (1 + daysSince(entry.updatedAt || entry.createdAt));
	const statusBoost = entry.status === "active" ? 0.2 : entry.status === "draft" ? 0.05 : -0.2;
	const salienceBoost = (entry.salience ?? entry.importance) / 10;
	return projectBoost * (0.45 + 0.55 * Math.max(tagScore, semanticScore)) + recency * 0.15 + salienceBoost * 0.2 + statusBoost + computeStructuralBoost(entry) * structuralWeight;
}
