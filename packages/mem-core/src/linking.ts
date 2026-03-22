/**
 * [INPUT]: new MemoryEntry, existing entries
 * [OUTPUT]: bidirectional relatedIds links established
 * [POS]: A-MEM style Zettelkasten linking — atomic storage + dynamic associations
 */

import { tagOverlap } from "./scoring.js";
import type { MemoryEntry } from "./types.js";

const LINK_THRESHOLD = 0.5;
const MAX_LINKS = 5;

/** Find related entries by tag overlap and establish bidirectional links */
export function linkNewEntry(newEntry: MemoryEntry, allEntries: MemoryEntry[]): void {
	if (!newEntry.relatedIds) newEntry.relatedIds = [];

	const candidates = allEntries
		.filter((e) => e.id !== newEntry.id)
		.map((e) => ({ entry: e, overlap: tagOverlap(newEntry.tags, e.tags) }))
		.filter((c) => c.overlap >= LINK_THRESHOLD)
		.sort((a, b) => b.overlap - a.overlap)
		.slice(0, MAX_LINKS);

	for (const { entry } of candidates) {
		if (!newEntry.relatedIds.includes(entry.id)) {
			newEntry.relatedIds.push(entry.id);
		}
		if (!entry.relatedIds) entry.relatedIds = [];
		if (!entry.relatedIds.includes(newEntry.id)) {
			entry.relatedIds.push(newEntry.id);
		}
	}
}

/** Get content summaries for related entries (for injection enrichment) */
export function getRelatedSummaries(entry: MemoryEntry, allEntries: MemoryEntry[], maxCount = 3): string[] {
	if (!entry.relatedIds?.length) return [];
	const idSet = new Set(entry.relatedIds);
	return allEntries
		.filter((e) => idSet.has(e.id))
		.slice(0, maxCount)
		.map((e) => e.summary || e.content?.slice(0, 80) || e.name || "");
}
