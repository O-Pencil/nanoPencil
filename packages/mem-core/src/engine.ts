/**
 * [WHO]: NanoMemEngine class - unified API for memory CRUD, injection, consolidation
 * [FROM]: Depends on node:path, ./config.js, ./consolidation.js, ./eviction.js, ./extraction.js, ./i18n.js, ./linking.js, ./privacy.js, ./scoring.js, ./store.js, ./update.js
 * [TO]: Consumed by packages/mem-core/src/index.ts
 * [HERE]: packages/mem-core/src/engine.ts - facade layer composing all memory subsystems
 */

import { cp, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { getConfig, type NanomemConfig } from "./config.js";
import { consolidateEpisodes } from "./consolidation.js";
import { consolidateV2Memories } from "./consolidate-v2.js";
import {
	queryEmbeddingIndex,
	syncEmbeddingIndex,
	type EmbeddingSourceItem,
	loadEmbeddingIndex,
} from "./embedding-index.js";
import { utilityEntry, utilityWork } from "./eviction.js";
import { extractMemories, extractWork } from "./extraction.js";
import { createHashedEmbeddingFn } from "./hash-embedding.js";
import type { PromptSet } from "./i18n.js";
import { PROMPTS } from "./i18n.js";
import {
	getGraphContextSummaries,
	getGraphNeighborhoodBySeeds,
	linkNewEntry,
	reinforceRelations,
	type GraphNeighbor,
} from "./linking.js";
import { evictExpiredEntries, evictExpiredWork, filterByScope, filterPII } from "./privacy.js";
import { daysSince, extractTags, pickTop, scoreEntry, scoreEpisode, scoreWorkEntry, tagOverlap, tierEntries } from "./scoring.js";
import {
	loadEntries,
	loadEpisodes,
	loadMeta,
	loadWork,
	saveEpisode as persistEpisode,
	saveEntries,
	saveWork,
	writeJson,
} from "./store.js";
import { deduplicateMemoryEntries, deduplicateWorkEntries } from "./dedup.js";
import { buildFullInsightsReport } from "./full-insights.js";
import { generateHumanInsights } from "./human-insights.js";
import { reconsolidateV2Memories } from "./reconsolidate-v2.js";
import type {
	DeveloperPersona,
	Episode,
	ExtractedItem,
	FullInsightsReport,
	HumanInsight,
	InsightsReport,
	AlignmentSnapshot,
	LlmFn,
	MemoryEntry,
	MemoryScope,
	Meta,
	PatternInsight,
	RootCauseInsight,
	StruggleInsight,
	WorkEntry,
} from "./types.js";
import {
	getV2Paths,
	loadV2Episodes,
	loadV2Facets,
	loadV2Links,
	loadV2Meta,
	loadV2Procedural,
	loadV2Semantic,
	saveV2Episodes,
	saveV2Facets,
	saveV2Links,
	saveV2Meta,
	saveV2Procedural,
	saveV2Semantic,
	type NanoMemV2Paths,
} from "./store-v2.js";
import { compileProcedureFromEpisode } from "./procedural-v2.js";
import type { EmbeddingFn, EpisodeFacet, EpisodeMemory, FacetKind, MemoryLink, ProceduralMemory, SemanticMemory } from "./types-v2.js";
import { applyExtraction, checkConsolidationEntry, checkWorkDuplicate } from "./update.js";
import {
	computeStructuralBoost,
	currentStructuralAnchor,
	scoreEpisodeFacet as scoreEpisodeFacetFn,
	scoreEpisodeMemory as scoreEpisodeMemoryFn,
	scoreProceduralMemory as scoreProceduralMemoryFn,
	scoreV2SemanticMemory as scoreV2SemanticMemoryFn,
} from "./engine-scoring-v2.js";

export class NanoMemEngine {
	readonly cfg: NanomemConfig;
	private llmFn?: LlmFn;
	private embeddingFn?: EmbeddingFn;
	private static readonly AUTO_V2_LINK_PREFIX = "auto:v2:";
	private static readonly AUTO_REVIVE_MAX_ITEMS = 2;
	private static readonly CONVERSATION_PREFERENCE_PATTERNS = [
		/\bcall me\b/i,
		/\baddress me\b/i,
		/\bmy name is\b/i,
		/\bi am called\b/i,
		/\bspeak (?:to me )?(?:like|in)\b/i,
		/\btalk (?:to me )?(?:like|in)\b/i,
		/\buse (?:a |the )?(?:tone|style|voice)\b/i,
		/\b(?:tone|style|voice|persona)\b/i,
		/call me/,
		/address me as/,
		/address user/,
		/tone/,
		/style of speaking/,
		/speaking style/,
		/communication style/,
	];

	private knowledgePath: string;
	private lessonsPath: string;
	private eventsPath: string;
	private preferencesPath: string;
	private facetsPath: string;
	private workPath: string;
	private metaPath: string;
	private episodesDir: string;
	private v2Paths: NanoMemV2Paths;
	private archiveKnowledgePath: string;
	private archiveLessonsPath: string;
	private archiveEventsPath: string;
	private archivePreferencesPath: string;
	private archiveFacetsPath: string;
	private archiveWorkPath: string;
	private archiveV2Paths: NanoMemV2Paths;

	constructor(overrides?: Partial<NanomemConfig>, llmFn?: LlmFn) {
		this.cfg = getConfig(overrides);
		this.llmFn = llmFn;
		if (this.cfg.embeddings.enabled) {
			this.embeddingFn = createHashedEmbeddingFn(this.cfg.embeddings.dim);
		}
		this.knowledgePath = join(this.cfg.memoryDir, "knowledge.json");
		this.lessonsPath = join(this.cfg.memoryDir, "lessons.json");
		this.eventsPath = join(this.cfg.memoryDir, "events.json");
		this.preferencesPath = join(this.cfg.memoryDir, "preferences.json");
		this.facetsPath = join(this.cfg.memoryDir, "facets.json");
		this.workPath = join(this.cfg.memoryDir, "work.json");
		this.metaPath = join(this.cfg.memoryDir, "meta.json");
		this.episodesDir = join(this.cfg.memoryDir, "episodes");
		this.v2Paths = getV2Paths(this.cfg.memoryDir);
		const archiveDir = join(this.cfg.memoryDir, "_archive");
		this.archiveKnowledgePath = join(archiveDir, "knowledge.json");
		this.archiveLessonsPath = join(archiveDir, "lessons.json");
		this.archiveEventsPath = join(archiveDir, "events.json");
		this.archivePreferencesPath = join(archiveDir, "preferences.json");
		this.archiveFacetsPath = join(archiveDir, "facets.json");
		this.archiveWorkPath = join(archiveDir, "work.json");
		this.archiveV2Paths = getV2Paths(archiveDir);
	}

	setLlmFn(fn: LlmFn): void {
		this.llmFn = fn;
	}

	setEmbeddingFn(fn: EmbeddingFn): void {
		this.embeddingFn = fn;
	}

	// ─── Extraction ──────────────────────────────────────────────

	async extractAndStore(conversation: string, project: string): Promise<ExtractedItem[]> {
		const items = await extractMemories(conversation, this.cfg, this.llmFn);
		if (!items.length) return [];

		const knowledge = await loadEntries(this.knowledgePath);
		const lessons = await loadEntries(this.lessonsPath);
		const events = await loadEntries(this.eventsPath);
		const prefs = await loadEntries(this.preferencesPath);
		const facets = await loadEntries(this.facetsPath);
		const v2Semantic = await loadV2Semantic(this.v2Paths);

		for (const item of items) {
			const target =
				item.type === "lesson"
					? lessons
					: item.type === "event"
						? events
					: item.type === "preference"
						? prefs
						: item.type === "pattern" || item.type === "struggle"
							? facets
							: knowledge;
			applyExtraction(target, item, project, this.cfg);
			this.upsertSemanticFromExtractedItem(v2Semantic, item, project);
		}

		const hl = this.cfg.halfLife;
		const ew = this.cfg.evictionWeights;
		await Promise.all([
			saveEntries(this.knowledgePath, knowledge, this.cfg.maxEntries.knowledge, (e) => utilityEntry(e, hl, ew)),
			saveEntries(this.lessonsPath, lessons, this.cfg.maxEntries.lessons, (e) => utilityEntry(e, hl, ew)),
			saveEntries(this.eventsPath, events, this.cfg.maxEntries.events, (e) => utilityEntry(e, hl, ew)),
			saveEntries(this.preferencesPath, prefs, this.cfg.maxEntries.preferences, (e) => utilityEntry(e, hl, ew)),
			saveEntries(this.facetsPath, facets, this.cfg.maxEntries.facets, (e) => utilityEntry(e, hl, ew)),
			saveV2Semantic(this.v2Paths, v2Semantic),
		]);

		return items;
	}

	async extractAndStoreWork(conversation: string, project: string, sessionGoal?: string): Promise<void> {
		const extracted = await extractWork(conversation, this.cfg, this.llmFn);
		if (!extracted || (!extracted.goal && !extracted.summary)) return;

		const entries = await loadWork(this.workPath);
		const now = new Date().toISOString();
		const newWork: WorkEntry = {
			id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			goal: sessionGoal || extracted.goal,
			summary: filterPII(extracted.summary),
			detail: extracted.detail ? filterPII(extracted.detail) : undefined,
			project,
			tags: extractTags(`${extracted.goal} ${extracted.summary}`),
			importance: 6,
			strength: this.cfg.halfLife.work ?? 45,
			created: now,
			eventTime: now,
			accessCount: 0,
			relatedIds: [],
			ttl: this.cfg.forgetting.workTtlDays,
			scope: this.cfg.defaultScope,
		};

		const result = checkWorkDuplicate(entries, newWork);
		if (result.action === "skip") return;
		if (result.action === "update" && result.index !== undefined) {
			const existing = entries[result.index]!;
			entries[result.index] = {
				...existing,
				goal: newWork.goal,
				summary: newWork.summary,
				detail: newWork.detail ?? existing.detail,
				tags: newWork.tags,
				lastAccessed: now,
			};
		} else {
			entries.push(newWork);
		}
		await saveWork(this.workPath, entries, this.cfg.maxEntries.work, (w) =>
			utilityWork(w, this.cfg.halfLife, this.cfg.evictionWeights),
		);
	}

	// ─── Episode Management ──────────────────────────────────────

	async saveEpisode(ep: Episode): Promise<void> {
		await persistEpisode(this.episodesDir, ep);
		const meta = await loadMeta(this.metaPath);
		meta.totalSessions++;
		await writeJson(this.metaPath, meta);
		await this.syncEpisodeToV2(ep);
	}

	async getV2EpisodeMemories(): Promise<EpisodeMemory[]> {
		return loadV2Episodes(this.v2Paths);
	}

	async getV2Snapshot(): Promise<{
		episodes: EpisodeMemory[];
		facets: EpisodeFacet[];
		semantic: import("./types-v2.js").SemanticMemory[];
		procedural: ProceduralMemory[];
		links: MemoryLink[];
	}> {
		const [episodes, facets, semantic, procedural, links] = await Promise.all([
			loadV2Episodes(this.v2Paths),
			loadV2Facets(this.v2Paths),
			loadV2Semantic(this.v2Paths),
			loadV2Procedural(this.v2Paths),
			loadV2Links(this.v2Paths),
		]);
		return { episodes, facets, semantic, procedural, links };
	}

	async searchV2Memories(
		query: string,
		limit = 10,
		scope?: MemoryScope,
	): Promise<Array<{ kind: "episode" | "facet" | "semantic" | "procedural"; id: string; title: string; summary: string; score: number }>> {
		await this.autoReviveRelevantArchive(query, scope);
		const snapshot = await this.getV2Snapshot();
		const project = (scope as { project?: string } | undefined)?.project ?? "";
		const episodes = this.filterAndCleanV2Episodes(snapshot.episodes, project, scope);
		const facets = this.filterAndCleanV2Facets(snapshot.facets, project, scope);
		const semantic = this.filterAndCleanV2Semantic(snapshot.semantic, project, scope);
		const procedural = this.filterAndCleanProcedural(snapshot.procedural, project, scope);
		const matches = await this.querySemanticCandidates(query, project, scope, episodes, facets, semantic, procedural);
		const episodeById = new Map(episodes.map((entry) => [entry.id, entry]));
		const facetById = new Map(facets.map((entry) => [entry.id, entry]));
		const semanticById = new Map(semantic.map((entry) => [entry.id, entry]));
		const proceduralById = new Map(procedural.map((entry) => [entry.id, entry]));
		const results: Array<{ kind: "episode" | "facet" | "semantic" | "procedural"; id: string; title: string; summary: string; score: number }> = [];
		for (const match of matches.slice(0, limit)) {
			if (match.memoryKind === "episode") {
				const entry = episodeById.get(match.memoryId);
				if (entry) {
					results.push({ kind: "episode", id: entry.id, title: entry.title || "Episode", summary: entry.summary, score: match.score });
				}
				continue;
			}
			if (match.memoryKind === "facet") {
				const entry = facetById.get(match.memoryId);
				if (entry) {
					results.push({ kind: "facet", id: entry.id, title: entry.searchText, summary: entry.summary || entry.anchorText || "", score: match.score });
				}
				continue;
			}
			if (match.memoryKind === "semantic") {
				const entry = semanticById.get(match.memoryId);
				if (entry) {
					results.push({ kind: "semantic", id: entry.id, title: entry.name, summary: entry.summary, score: match.score });
				}
				continue;
			}
			const entry = proceduralById.get(match.memoryId);
			if (entry) {
				results.push({ kind: "procedural", id: entry.id, title: entry.name, summary: entry.summary, score: match.score });
			}
		}
		return results;
	}

	async syncV2Embeddings(model = this.cfg.embeddings.model): Promise<number> {
		if (!this.embeddingFn) return 0;
		const snapshot = await this.getV2Snapshot();
		const items = this.buildEmbeddingSourceItems(snapshot.episodes, snapshot.facets, snapshot.semantic, snapshot.procedural);
		await syncEmbeddingIndex(this.cfg.memoryDir, model, items, this.embeddingFn);
		const meta = await loadV2Meta(this.v2Paths);
		await saveV2Meta(this.v2Paths, {
			...meta,
			lastEmbeddingSyncAt: new Date().toISOString(),
		});
		return items.length;
	}

	async consolidate(): Promise<MemoryEntry[]> {
		const result = await this.consolidateDetailed();
		return result.entries;
	}

	async consolidateDetailed(options?: { signal?: AbortSignal }): Promise<{
		entries: MemoryEntry[];
		stats: { episodesConsidered: number; added: number; updated: number; skipped: number };
	}> {
		const episodes = await loadEpisodes(this.episodesDir);
		const unconsolidatedCount = episodes.filter((ep) => !ep.consolidated).length;

		if (options?.signal?.aborted) {
			throw new Error("AbortError");
		}

		let newEntries: MemoryEntry[] = [];
		try {
			newEntries = await consolidateEpisodes(episodes, this.cfg, this.llmFn, options);
		} catch (e) {
			if (e instanceof Error && e.message === "AbortError") throw e;
			throw e;
		}
		if (!newEntries.length) {
			return { entries: [], stats: { episodesConsidered: unconsolidatedCount, added: 0, updated: 0, skipped: 0 } };
		}

		const knowledge = await loadEntries(this.knowledgePath);
		const lessons = await loadEntries(this.lessonsPath);
		const events = await loadEntries(this.eventsPath);
		const [v2Episodes, v2Facets, v2Procedural, v2Semantic] = await Promise.all([
			loadV2Episodes(this.v2Paths),
			loadV2Facets(this.v2Paths),
			loadV2Procedural(this.v2Paths),
			loadV2Semantic(this.v2Paths),
		]);
		const v2Consolidated = consolidateV2Memories(v2Episodes, v2Facets, v2Procedural, this.cfg);
		newEntries = [...newEntries, ...v2Consolidated.entries];
		const allExisting = [...knowledge, ...lessons, ...events];

		let added = 0;
		let updated = 0;
		let skipped = 0;

		for (const entry of newEntries) {
			if (options?.signal?.aborted) {
				throw new Error("AbortError");
			}
			const target = entry.type === "lesson" ? lessons : entry.type === "event" ? events : knowledge;
			const result = checkConsolidationEntry(target, entry, allExisting);
			if (result.action === "skip") {
				skipped++;
				continue;
			}
			if (result.action === "update" && result.index !== undefined) {
				updated++;
				const existing = target[result.index]!;
				target[result.index] = {
					...existing,
					name: entry.name,
					summary: entry.summary,
					detail: entry.detail,
					content: entry.detail,
					tags: entry.tags,
					lastAccessed: new Date().toISOString(),
				};
			} else {
				added++;
				linkNewEntry(entry, allExisting);
				target.push(entry);
				allExisting.push(entry);
			}
		}

		if (options?.signal?.aborted) {
			throw new Error("AbortError");
		}

		const hl = this.cfg.halfLife;
		const ew = this.cfg.evictionWeights;
		await Promise.all([
			saveEntries(this.knowledgePath, knowledge, this.cfg.maxEntries.knowledge, (e) => utilityEntry(e, hl, ew)),
			saveEntries(this.lessonsPath, lessons, this.cfg.maxEntries.lessons, (e) => utilityEntry(e, hl, ew)),
			saveEntries(this.eventsPath, events, this.cfg.maxEntries.events, (e) => utilityEntry(e, hl, ew)),
		]);

		const nextSemantic = [...v2Semantic];
		for (const item of v2Consolidated.semantic) {
			if (!nextSemantic.some((existing) => tagOverlap(existing.tags, item.tags) >= 0.8 && existing.semanticType === item.semanticType)) {
				nextSemantic.push(item);
			}
		}
		for (const episode of v2Episodes) {
			const derived = v2Consolidated.episodeSemanticMap.get(episode.id);
			if (!derived?.length) continue;
			episode.derivedSemanticIds = [...new Set([...(episode.derivedSemanticIds ?? []), ...derived])];
			episode.consolidatedAt = episode.consolidatedAt ?? new Date().toISOString();
		}
		await Promise.all([
			saveV2Episodes(this.v2Paths, v2Episodes),
			saveV2Semantic(this.v2Paths, nextSemantic),
		]);

		for (const ep of episodes) {
			if (ep.consolidated) await persistEpisode(this.episodesDir, ep);
		}

		const meta = await loadMeta(this.metaPath);
		meta.lastConsolidation = new Date().toISOString();
		await writeJson(this.metaPath, meta);

		return {
			entries: newEntries,
			stats: { episodesConsidered: unconsolidatedCount, added, updated, skipped },
		};
	}

	// ─── Retrieval & Injection (Progressive Recall) ────────────

	async getMemoryInjection(project: string, contextTags: string[], scope?: MemoryScope): Promise<string> {
		await this.autoReviveRelevantArchive([project, ...contextTags].join(" ").trim(), scope);
		const [allKnowledge, allLessons, allEvents, allPrefs, allFacets, allEpisodes, allWork, allV2Episodes, allV2EpisodeFacets, allV2Semantic, allProcedural] = await Promise.all([
			loadEntries(this.knowledgePath),
			loadEntries(this.lessonsPath),
			loadEntries(this.eventsPath),
			loadEntries(this.preferencesPath),
			loadEntries(this.facetsPath),
			loadEpisodes(this.episodesDir),
			loadWork(this.workPath),
			loadV2Episodes(this.v2Paths),
			loadV2Facets(this.v2Paths),
			loadV2Semantic(this.v2Paths),
			loadV2Procedural(this.v2Paths),
		]);

		const knowledge = this.filterAndCleanEntries(allKnowledge, scope);
		const lessons = this.filterAndCleanEntries(allLessons, scope);
		const events = this.filterAndCleanEntries(allEvents, scope);
		const prefs = this.filterAndCleanEntries(allPrefs, scope);
		const facets = this.filterAndCleanEntries(allFacets, scope);
		const work = this.filterAndCleanWork(allWork, scope);
		const episodes = filterByScope(allEpisodes, scope);
		const v2Episodes = this.filterAndCleanV2Episodes(allV2Episodes, project, scope);
		const v2EpisodeFacets = this.filterAndCleanV2Facets(allV2EpisodeFacets, project, scope);
		const v2Semantic = this.filterAndCleanV2Semantic(allV2Semantic, project, scope);
		const procedural = this.filterAndCleanProcedural(allProcedural, project, scope);

		const hl = this.cfg.halfLife;
		const sw = this.cfg.scoreWeights;
		const pr = this.cfg.progressiveRecall;
		const p = PROMPTS[this.cfg.locale] ?? PROMPTS.en;
		const semanticQuery = [project, ...contextTags].join(" ").trim();
		const semanticCandidates = await this.querySemanticCandidates(
			semanticQuery,
			project,
			scope,
			v2Episodes,
			v2EpisodeFacets,
			v2Semantic,
			procedural,
		);
		const semanticEpisodeIds = new Set(
			semanticCandidates.filter((item) => item.memoryKind === "episode").map((item) => item.memoryId),
		);
		const semanticFacetIds = new Set(
			semanticCandidates.filter((item) => item.memoryKind === "facet").map((item) => item.memoryId),
		);
		const semanticProcedureIds = new Set(
			semanticCandidates.filter((item) => item.memoryKind === "procedural").map((item) => item.memoryId),
		);
		const semanticV2SemanticIds = new Set(
			semanticCandidates.filter((item) => item.memoryKind === "semantic").map((item) => item.memoryId),
		);

		// Tier all MemoryEntry categories
		const tieredKnowledge = tierEntries(knowledge, project, contextTags, hl, sw, pr);
		const tieredLessons = tierEntries(lessons, project, contextTags, hl, sw, pr);
		const tieredEvents = tierEntries(events, project, contextTags, hl, sw, pr);
		const tieredPrefs = tierEntries(prefs, project, contextTags, hl, sw, pr);
		const tieredFacets = tierEntries(facets, project, contextTags, hl, sw, pr);
		const forcedConversationPrefs = this.selectConversationPreferences(prefs);

		// Budget calculation
		const totalChars = this.cfg.tokenBudget * 4;
		const activeChars = Math.floor(totalChars * pr.budgetActive);
		const cueChars = Math.floor(totalChars * pr.budgetCue);
		const proceduralChars = Math.floor(totalChars * 0.18);

		// Entry length helpers
		const activeLen = (e: MemoryEntry) =>
			(e.name?.length || 0) + (e.summary?.length || 0) + (e.detail?.length || 0) + 30;
		const cueLen = (e: MemoryEntry) => (e.name?.length || 0) + (e.summary?.length || 0) + 30;
		const scoreFn = (e: MemoryEntry) => scoreEntry(e, project, contextTags, hl, sw);
		const proceduralLen = (pItem: ProceduralMemory) =>
			(pItem.name?.length || 0) + (pItem.summary?.length || 0) + pItem.steps.reduce((sum, step) => sum + step.text.length, 0) + 60;
		const proceduralCueLen = (pItem: ProceduralMemory) =>
			(pItem.name?.length || 0) + (pItem.summary?.length || 0) + 40;
		const proceduralScoreFn = (pItem: ProceduralMemory) => this.scoreProceduralMemory(pItem, project, contextTags);
		const episodeMemoryLen = (item: EpisodeMemory) => (item.title?.length || 0) + item.summary.length + 40;
		const episodeFacetLen = (item: EpisodeFacet) =>
			item.searchText.length + (item.anchorText?.length || 0) + (item.summary?.length || 0) + 40;
		const episodeCueLen = (item: EpisodeMemory) => (item.title?.length || 0) + item.summary.length + 36;
		const episodeFacetCueLen = (item: EpisodeFacet) =>
			item.searchText.length + (item.summary?.length || 0) + (item.anchorText?.length || 0) + 36;
		const semanticMemoryLen = (item: SemanticMemory) =>
			(item.name?.length || 0) + item.summary.length + (item.detail?.length || 0) + 40;
		const semanticMemoryCueLen = (item: SemanticMemory) => (item.name?.length || 0) + item.summary.length + 36;
		const episodeScoreFn = (item: EpisodeMemory) => this.scoreEpisodeMemory(item, project, contextTags);
		const episodeFacetScoreFn = (item: EpisodeFacet) => this.scoreEpisodeFacet(item, project, contextTags);
		const semanticMemoryScoreFn = (item: SemanticMemory) => this.scoreV2SemanticMemory(item, project, contextTags);

		// Active tier: pick top entries with full detail, split budget across categories
		const activeBudgetPer = Math.floor(activeChars / 5);
		const activeKnowledge = pickTop(tieredKnowledge.active, scoreFn, activeLen, activeBudgetPer);
		const activeLessons = pickTop(tieredLessons.active, scoreFn, activeLen, activeBudgetPer);
		const activeEvents = pickTop(tieredEvents.active, scoreFn, activeLen, activeBudgetPer);
		const activePrefs = this.mergeUniqueEntries(
			forcedConversationPrefs,
			pickTop(tieredPrefs.active, scoreFn, activeLen, activeBudgetPer),
		);
		const activeFacets = pickTop(tieredFacets.active, scoreFn, activeLen, activeBudgetPer);
		const activeProcedural = pickTop(
			procedural.filter((item) => semanticProcedureIds.has(item.id) || proceduralScoreFn(item) >= 0.45),
			proceduralScoreFn,
			proceduralLen,
			Math.max(400, Math.floor(proceduralChars * 0.55)),
		);
		const activeEpisodeMemories = pickTop(
			v2Episodes.filter((item) => semanticEpisodeIds.has(item.id) || episodeScoreFn(item) >= 0.45),
			episodeScoreFn,
			episodeMemoryLen,
			Math.max(320, Math.floor(activeChars * 0.18)),
		);
		const activeEpisodeFacets = pickTop(
			v2EpisodeFacets.filter((item) => semanticFacetIds.has(item.id) || episodeFacetScoreFn(item) >= 0.42),
			episodeFacetScoreFn,
			episodeFacetLen,
			Math.max(320, Math.floor(activeChars * 0.18)),
		);
		const activeSemanticMemories = pickTop(
			v2Semantic.filter((item) => semanticV2SemanticIds.has(item.id) || semanticMemoryScoreFn(item) >= 0.42),
			semanticMemoryScoreFn,
			semanticMemoryLen,
			Math.max(280, Math.floor(activeChars * 0.16)),
		);

		const activeSeeds = [...activeKnowledge, ...activeLessons, ...activeEvents, ...activePrefs, ...activeFacets];
		const allEntries = [...allKnowledge, ...allLessons, ...allEvents, ...allPrefs, ...allFacets];
		const activeIds = new Set(activeSeeds.map((entry) => entry.id));
		const graphContext = getGraphNeighborhoodBySeeds(activeSeeds, allEntries, 8).filter(
			(neighbor) => !activeIds.has(neighbor.entry.id),
		);

		// Cue tier: pick top entries with name + summary + id, split budget across categories
		const cueBudgetPer = Math.floor(cueChars / 7); // 7 = knowledge + lessons + events + prefs + facets + episodes + work
		const cueKnowledge = pickTop(tieredKnowledge.cue, scoreFn, cueLen, cueBudgetPer);
		const cueLessons = pickTop(tieredLessons.cue, scoreFn, cueLen, cueBudgetPer);
		const cueEvents = pickTop(tieredEvents.cue, scoreFn, cueLen, cueBudgetPer);
		const forcedConversationPrefIds = new Set(forcedConversationPrefs.map((entry) => entry.id));
		const cuePrefs = pickTop(
			tieredPrefs.cue.filter((entry) => !forcedConversationPrefIds.has(entry.id)),
			scoreFn,
			cueLen,
			cueBudgetPer,
		);
		const cueFacets = pickTop(tieredFacets.cue, scoreFn, cueLen, cueBudgetPer);
		const graphContextIds = new Set(graphContext.map((neighbor) => neighbor.entry.id));
		const dedupeCue = (entries: MemoryEntry[]) => entries.filter((entry) => !graphContextIds.has(entry.id));
		const dedupedCueKnowledge = dedupeCue(cueKnowledge);
		const dedupedCueLessons = dedupeCue(cueLessons);
		const dedupedCueEvents = dedupeCue(cueEvents);
		const dedupedCuePrefs = dedupeCue(cuePrefs);
		const dedupedCueFacets = dedupeCue(cueFacets);

		// Episodes and Work use their existing scoring for cue layer
		const topEpisodes = pickTop(
			episodes,
			(ep) => scoreEpisode(ep, project, contextTags, hl, sw),
			(ep) => ep.summary.length + 30,
			cueBudgetPer,
		);
		const topWork = pickTop(
			work,
			(w) => scoreWorkEntry(w, project, contextTags, hl, sw),
			(w) => w.goal.length + w.summary.length + 30,
			cueBudgetPer,
		);
		const cueProcedural = pickTop(
			procedural.filter((item) => !activeProcedural.some((activeItem) => activeItem.id === item.id)),
			proceduralScoreFn,
			proceduralCueLen,
			Math.max(280, Math.floor(proceduralChars * 0.45)),
		);
		const cueEpisodeMemories = pickTop(
			v2Episodes.filter((item) => !activeEpisodeMemories.some((activeItem) => activeItem.id === item.id)),
			episodeScoreFn,
			episodeCueLen,
			Math.max(220, Math.floor(cueChars * 0.12)),
		);
		const cueEpisodeFacets = pickTop(
			v2EpisodeFacets.filter((item) => !activeEpisodeFacets.some((activeItem) => activeItem.id === item.id)),
			episodeFacetScoreFn,
			episodeFacetCueLen,
			Math.max(220, Math.floor(cueChars * 0.12)),
		);
		const cueSemanticMemories = pickTop(
			v2Semantic.filter((item) => !activeSemanticMemories.some((activeItem) => activeItem.id === item.id)),
			semanticMemoryScoreFn,
			semanticMemoryCueLen,
			Math.max(220, Math.floor(cueChars * 0.12)),
		);

		const legacyFacetBridgeActive = activeFacets.filter(
			(entry) => entry.facetData?.kind === "pattern" || entry.facetData?.kind === "struggle",
		);
		const legacyFacetBridgeCue = dedupedCueFacets.filter(
			(entry) => entry.facetData?.kind === "pattern" || entry.facetData?.kind === "struggle",
		);
		const v2SignalCount =
			activeEpisodeMemories.length +
			activeEpisodeFacets.length +
			activeSemanticMemories.length +
			activeProcedural.length +
			cueEpisodeMemories.length +
			cueEpisodeFacets.length +
			cueSemanticMemories.length +
			cueProcedural.length;
		const useLegacyFallback = v2SignalCount === 0;
		const injectedActiveKnowledge = useLegacyFallback ? activeKnowledge : [];
		const injectedActiveLessons = useLegacyFallback ? activeLessons : [];
		const injectedActiveEvents = useLegacyFallback ? activeEvents : [];
		const injectedActivePrefs = useLegacyFallback ? activePrefs : [];
		const injectedCueKnowledge = useLegacyFallback ? dedupedCueKnowledge : [];
		const injectedCueLessons = useLegacyFallback ? dedupedCueLessons : [];
		const injectedCueEvents = useLegacyFallback ? dedupedCueEvents : [];
		const injectedCuePrefs = useLegacyFallback ? dedupedCuePrefs : [];
		const injectedCueEpisodes = useLegacyFallback ? topEpisodes : [];

		// Reinforce all recalled entries (Active + Cue) via spaced repetition
		const allRecalledKnowledge = [...injectedActiveKnowledge, ...injectedCueKnowledge];
		const allRecalledLessons = [...injectedActiveLessons, ...injectedCueLessons];
		const allRecalledEvents = [...injectedActiveEvents, ...injectedCueEvents];
		const allRecalledPrefs = [...injectedActivePrefs, ...injectedCuePrefs];
		const allRecalledFacets = [...legacyFacetBridgeActive, ...legacyFacetBridgeCue];

		await this.reinforceEntries(allRecalledKnowledge, allKnowledge, this.knowledgePath);
		await this.reinforceEntries(allRecalledLessons, allLessons, this.lessonsPath);
		await this.reinforceEntries(allRecalledEvents, allEvents, this.eventsPath);
		await this.reinforceEntries(allRecalledPrefs, allPrefs, this.preferencesPath);
		await this.reinforceEntries(allRecalledFacets, allFacets, this.facetsPath);
		await this.reinforceWork(topWork, allWork);
		await this.reinforceEpisodeMemories([...activeEpisodeMemories, ...cueEpisodeMemories], allV2Episodes);
		await this.reinforceEpisodeFacets([...activeEpisodeFacets, ...cueEpisodeFacets], allV2EpisodeFacets);
		await this.reinforceV2SemanticMemories([...activeSemanticMemories, ...cueSemanticMemories], allV2Semantic);
		await this.reinforceProcedural([...activeProcedural, ...cueProcedural], allProcedural);
		await this.reconsolidateV2AfterRecall(
			allV2Episodes,
			allV2EpisodeFacets,
			allProcedural,
			[...activeEpisodeMemories, ...cueEpisodeMemories],
			[...activeEpisodeFacets, ...cueEpisodeFacets],
			[...activeProcedural, ...cueProcedural],
		);

		// Optional reconsolidation for low-relevance recalled entries
		if (this.llmFn) {
			await this.reconsolidateIfNeeded(allRecalledKnowledge, contextTags, allKnowledge);
			await this.reconsolidateIfNeeded(allRecalledLessons, contextTags, allLessons);
		}

		return this.buildProgressiveInjectionText(
			{
				knowledge: injectedActiveKnowledge,
				lessons: injectedActiveLessons,
				events: injectedActiveEvents,
				preferences: injectedActivePrefs,
				facets: legacyFacetBridgeActive,
				episodeMemories: activeEpisodeMemories,
				episodeFacets: activeEpisodeFacets,
				semanticMemories: activeSemanticMemories,
				procedural: activeProcedural,
			},
			{
				knowledge: injectedCueKnowledge,
				lessons: injectedCueLessons,
				events: injectedCueEvents,
				preferences: injectedCuePrefs,
				facets: legacyFacetBridgeCue,
				episodes: injectedCueEpisodes,
				work: topWork,
				episodeMemories: cueEpisodeMemories,
				episodeFacets: cueEpisodeFacets,
				semanticMemories: cueSemanticMemories,
				procedural: cueProcedural,
			},
			allEntries,
			graphContext,
			p,
		);
	}

	// ─── Progressive Recall Tools ───────────────────────────────

	/** Retrieve a single entry by ID (for recall_memory tool) */
	async getEntryById(id: string): Promise<MemoryEntry | null> {
		for (const { path } of this.getMemoryPathConfigs()) {
			const entries = await loadEntries(path);
			const entry = entries.find((e) => e.id === id);
			if (entry) return entry;
		}
		return null;
	}

	/** Reinforce a single entry by ID (bump accessCount, lastAccessed, strength) */
	async reinforceEntryById(id: string): Promise<boolean> {
		const pathConfigs = this.getMemoryPathConfigs();
		const hl = this.cfg.halfLife;
		const ew = this.cfg.evictionWeights;

		for (const { path, max } of pathConfigs) {
			const entries = await loadEntries(path);
			const entry = entries.find((e) => e.id === id);
			if (entry) {
				entry.accessCount = (entry.accessCount ?? 0) + 1;
				entry.lastAccessed = new Date().toISOString();
				entry.strength = (entry.strength || 30) * this.cfg.strengthGrowthFactor;
				await saveEntries(path, entries, max, (e) => utilityEntry(e, hl, ew));
				return true;
			}
		}
		return false;
	}

	async editEntryById(
		id: string,
		patch: Partial<
			Pick<MemoryEntry, "name" | "summary" | "detail" | "retention" | "salience" | "stability" | "ttl">
		> & { tags?: string[] },
	): Promise<MemoryEntry | null> {
		const located = await this.findEntryLocation(id);
		if (!located) return null;
		const { entry, entries, path, max } = located;
		const detail = patch.detail ?? entry.detail ?? entry.content ?? "";
		entry.name = patch.name ?? entry.name;
		entry.summary = patch.summary ?? entry.summary;
		entry.detail = detail;
		entry.content = detail;
		entry.retention = patch.retention ?? entry.retention;
		entry.salience = patch.salience ?? entry.salience;
		entry.stability = patch.stability ?? entry.stability;
		entry.ttl = patch.ttl ?? entry.ttl;
		entry.tags = patch.tags?.length ? patch.tags : extractTags(`${entry.name || ""} ${entry.summary || ""} ${detail}`);
		entry.lastAccessed = new Date().toISOString();
		await this.persistEntries(path, entries, max);
		return entry;
	}

	async resolveConflictByIds(
		aId: string,
		bId: string,
		action: "merge" | "demote" | "forget" | "mark-situational",
	): Promise<{ action: string; updatedIds: string[] } | null> {
		const aLocated = await this.findEntryLocation(aId);
		const bLocated = await this.findEntryLocation(bId);
		if (!aLocated || !bLocated) return null;

		const pickPrimary = () => {
			const score = (entry: MemoryEntry) =>
				(entry.salience ?? entry.importance) * 2 +
				(entry.accessCount ?? 0) +
				(entry.retention === "core" ? 4 : entry.retention === "key-event" ? 2 : 0);
			return score(aLocated.entry) >= score(bLocated.entry)
				? { primary: aLocated, secondary: bLocated }
				: { primary: bLocated, secondary: aLocated };
		};

		const { primary, secondary } = pickPrimary();

		if (action === "forget") {
			secondary.entries.splice(secondary.entries.findIndex((entry) => entry.id === secondary.entry.id), 1);
			await this.persistEntries(secondary.path, secondary.entries, secondary.max);
			return { action, updatedIds: [primary.entry.id] };
		}

		if (action === "demote") {
			secondary.entry.retention = "ambient";
			secondary.entry.salience = Math.max(1, Math.min(secondary.entry.salience ?? secondary.entry.importance, 4));
			secondary.entry.ttl = secondary.entry.ttl ?? this.cfg.forgetting.ambientTtlDays;
			secondary.entry.lastAccessed = new Date().toISOString();
			await this.persistEntries(secondary.path, secondary.entries, secondary.max);
			return { action, updatedIds: [secondary.entry.id] };
		}

		if (action === "mark-situational") {
			secondary.entry.stability = "situational";
			secondary.entry.retention = "ambient";
			secondary.entry.ttl = Math.min(14, this.cfg.forgetting.ambientTtlDays);
			secondary.entry.lastAccessed = new Date().toISOString();
			await this.persistEntries(secondary.path, secondary.entries, secondary.max);
			return { action, updatedIds: [secondary.entry.id] };
		}

		primary.entry.summary = [primary.entry.summary, secondary.entry.summary].filter(Boolean).join(" | ").slice(0, 300);
		primary.entry.detail = [primary.entry.detail || primary.entry.content, secondary.entry.detail || secondary.entry.content]
			.filter(Boolean)
			.join("\n\n")
			.slice(0, 4000);
		primary.entry.content = primary.entry.detail;
		primary.entry.tags = [...new Set([...(primary.entry.tags ?? []), ...(secondary.entry.tags ?? [])])].slice(0, 30);
		primary.entry.relatedIds = [...new Set([...(primary.entry.relatedIds ?? []), ...(secondary.entry.relatedIds ?? []), secondary.entry.id])].slice(0, 20);
		primary.entry.relations = [
			...new Map(
				[...(primary.entry.relations ?? []), ...(secondary.entry.relations ?? [])].map((relation) => [
					`${relation.id}:${relation.kind}`,
					relation,
				]),
			).values(),
		].slice(0, 30);
		primary.entry.salience = Math.max(primary.entry.salience ?? primary.entry.importance, secondary.entry.salience ?? secondary.entry.importance);
		primary.entry.lastAccessed = new Date().toISOString();
		secondary.entries.splice(secondary.entries.findIndex((entry) => entry.id === secondary.entry.id), 1);
		await Promise.all([
			this.persistEntries(primary.path, primary.entries, primary.max),
			this.persistEntries(secondary.path, secondary.entries, secondary.max),
		]);
		return { action, updatedIds: [primary.entry.id] };
	}

	/** Full-text search across ALL entries including dormant (for search_all_memories tool) */
	async searchAllEntries(query: string, limit = 10): Promise<MemoryEntry[]> {
		const tags = extractTags(query);
		const queryLower = query.toLowerCase();

		const [knowledge, lessons, events, prefs, facets] = await Promise.all([
			loadEntries(this.knowledgePath),
			loadEntries(this.lessonsPath),
			loadEntries(this.eventsPath),
			loadEntries(this.preferencesPath),
			loadEntries(this.facetsPath),
		]);

		const all = [...knowledge, ...lessons, ...events, ...prefs, ...facets];

		return all
			.map((e) => {
				const nameMatch = (e.name || "").toLowerCase().includes(queryLower) ? 2 : 0;
				const summaryMatch = (e.summary || "").toLowerCase().includes(queryLower) ? 1 : 0;
				const tagMatch = tagOverlap(e.tags, tags);
				const relationBoost = (e.relations ?? [])
					.filter((relation) => tags.some((tag) => relation.kind.includes(tag) || relation.id.includes(tag)))
					.reduce((sum, relation) => sum + relation.weight * 0.15, 0);
				return { entry: e, score: nameMatch + summaryMatch + tagMatch + relationBoost };
			})
			.filter((x) => x.score > 0)
			.sort((a, b) => b.score - a.score)
			.slice(0, limit)
			.map((x) => x.entry);
	}

	// ─── Stats ───────────────────────────────────────────────────

	async getStats(): Promise<{
		knowledge: number;
		lessons: number;
		events: number;
		preferences: number;
		facets: number;
		episodes: number;
		work: number;
		archivedKnowledge: number;
		archivedLessons: number;
		archivedEvents: number;
		archivedPreferences: number;
		archivedFacets: number;
		archivedWork: number;
		totalSessions: number;
	}> {
		const [knowledge, lessons, events, prefs, facets, episodes, work, meta, archived] = await Promise.all([
			loadEntries(this.knowledgePath),
			loadEntries(this.lessonsPath),
			loadEntries(this.eventsPath),
			loadEntries(this.preferencesPath),
			loadEntries(this.facetsPath),
			loadEpisodes(this.episodesDir),
			loadWork(this.workPath),
			loadMeta(this.metaPath),
			this.exportArchive(),
		]);
		return {
			knowledge: knowledge.length,
			lessons: lessons.length,
			events: events.length,
			preferences: prefs.length,
			facets: facets.length,
			episodes: episodes.length,
			work: work.length,
			archivedKnowledge: archived.knowledge.length,
			archivedLessons: archived.lessons.length,
			archivedEvents: archived.events.length,
			archivedPreferences: archived.preferences.length,
			archivedFacets: archived.facets.length,
			archivedWork: archived.work.length,
			totalSessions: meta.totalSessions,
		};
	}

	async getV2Stats(): Promise<{
		episodes: number;
		facets: number;
		semantic: number;
		procedural: number;
		archivedSemantic: number;
		archivedProcedural: number;
		links: number;
		embeddings: number;
		lastEmbeddingSyncAt?: string;
		lastReconsolidationAt?: string;
	}> {
		const [episodes, facets, semantic, procedural, links, embeddingIndex, meta, archived] = await Promise.all([
			loadV2Episodes(this.v2Paths),
			loadV2Facets(this.v2Paths),
			loadV2Semantic(this.v2Paths),
			loadV2Procedural(this.v2Paths),
			loadV2Links(this.v2Paths),
			loadEmbeddingIndex(this.cfg.memoryDir),
			loadV2Meta(this.v2Paths),
			this.exportArchive(),
		]);
		return {
			episodes: episodes.length,
			facets: facets.length,
			semantic: semantic.length,
			procedural: procedural.length,
			archivedSemantic: archived.semantic.length,
			archivedProcedural: archived.procedural.length,
			links: links.length,
			embeddings: embeddingIndex.records.length,
			lastEmbeddingSyncAt: meta.lastEmbeddingSyncAt,
			lastReconsolidationAt: meta.lastReconsolidationAt,
		};
	}

	// ─── Direct Access (for CLI, testing) ────────────────────────

	async getAllEntries(): Promise<{
		knowledge: MemoryEntry[];
		lessons: MemoryEntry[];
		events: MemoryEntry[];
		preferences: MemoryEntry[];
		facets: MemoryEntry[];
	}> {
		return {
			knowledge: await loadEntries(this.knowledgePath),
			lessons: await loadEntries(this.lessonsPath),
			events: await loadEntries(this.eventsPath),
			preferences: await loadEntries(this.preferencesPath),
			facets: await loadEntries(this.facetsPath),
		};
	}

	async getRuntimeIdentityEntries(): Promise<{
		knowledge: MemoryEntry[];
		lessons: MemoryEntry[];
		preferences: MemoryEntry[];
		facets: MemoryEntry[];
	}> {
		const runtime = await this.buildRuntimeMemoryView();
		return {
			knowledge: runtime.knowledge,
			lessons: runtime.lessons,
			preferences: runtime.preferences,
			facets: runtime.facets,
		};
	}

	async getAllWork(): Promise<WorkEntry[]> {
		return loadWork(this.workPath);
	}

	async getAllEpisodes(): Promise<Episode[]> {
		return loadEpisodes(this.episodesDir);
	}

	async runStartupMaintenance(maintenanceVersion = 3): Promise<{
		ran: boolean;
		backupPath?: string;
		deduplicated: {
			knowledge: number;
			lessons: number;
			events: number;
			preferences: number;
			facets: number;
			work: number;
			total: number;
		};
		migratedEpisodesToV2: number;
		archived: {
			knowledge: number;
			lessons: number;
			events: number;
			preferences: number;
			facets: number;
			work: number;
			semantic: number;
			procedural: number;
			total: number;
		};
	}> {
		const [meta, v2Meta] = await Promise.all([loadMeta(this.metaPath), loadV2Meta(this.v2Paths)]);
		const alreadyMaintained =
			(meta.lastMaintenanceVersion ?? 0) >= maintenanceVersion &&
			(v2Meta.lastMaintenanceVersion ?? 0) >= maintenanceVersion;
		if (alreadyMaintained) {
			return {
				ran: false,
				backupPath: undefined,
				deduplicated: { knowledge: 0, lessons: 0, events: 0, preferences: 0, facets: 0, work: 0, total: 0 },
				migratedEpisodesToV2: 0,
				archived: { knowledge: 0, lessons: 0, events: 0, preferences: 0, facets: 0, work: 0, semantic: 0, procedural: 0, total: 0 },
			};
		}

		const now = new Date().toISOString();
		const backupPath = await this.createMaintenanceBackup(meta, v2Meta, maintenanceVersion, now);
		const deduplicated = await this.deduplicateAll();
		const episodes = await this.getAllEpisodes();
		for (const episode of episodes) {
			await this.syncEpisodeToV2(episode);
		}
		await this.rebuildV2Links();
		const archived = await this.archiveStaleMemories();
		await this.rebuildV2Links();

		await Promise.all([
			writeJson(this.metaPath, {
				...(await loadMeta(this.metaPath)),
				lastMaintenanceAt: now,
				lastMaintenanceVersion: maintenanceVersion,
				lastBackupAt: meta.lastBackupAt ?? now,
				lastBackupVersion: Math.max(meta.lastBackupVersion ?? 0, maintenanceVersion),
			}),
			saveV2Meta(this.v2Paths, {
				...(await loadV2Meta(this.v2Paths)),
				version: 2,
				lastMaintenanceAt: now,
				lastMaintenanceVersion: maintenanceVersion,
				lastMigrationAt: (await loadV2Meta(this.v2Paths)).lastMigrationAt ?? now,
				lastBackupAt: v2Meta.lastBackupAt ?? now,
				lastBackupVersion: Math.max(v2Meta.lastBackupVersion ?? 0, maintenanceVersion),
			}),
		]);

		return {
			ran: true,
			backupPath,
			deduplicated,
			migratedEpisodesToV2: episodes.length,
			archived,
		};
	}

	private async createMaintenanceBackup(
		meta: Meta,
		v2Meta: { lastBackupVersion?: number },
		maintenanceVersion: number,
		now: string,
	): Promise<string | undefined> {
		const alreadyBackedUp =
			(meta.lastBackupVersion ?? 0) >= maintenanceVersion &&
			(v2Meta.lastBackupVersion ?? 0) >= maintenanceVersion;
		if (alreadyBackedUp) return undefined;

		const safeTimestamp = now.replace(/[:.]/g, "-");
		const backupRoot = join(this.cfg.memoryDir, "_backups");
		const backupDir = join(backupRoot, `maintenance-v${maintenanceVersion}-${safeTimestamp}`);
		await mkdir(backupDir, { recursive: true });

		const filesToCopy = [
			this.knowledgePath,
			this.lessonsPath,
			this.eventsPath,
			this.preferencesPath,
			this.facetsPath,
			this.workPath,
			this.metaPath,
		];
		for (const filePath of filesToCopy) {
			try {
				await cp(filePath, join(backupDir, filePath.split("/").pop() ?? "unknown.json"));
			} catch {
				// Missing files are fine for first-run users.
			}
		}

		for (const dirName of ["episodes", "v2", "_archive"]) {
			const sourceDir = join(this.cfg.memoryDir, dirName);
			try {
				await readdir(sourceDir);
				await cp(sourceDir, join(backupDir, dirName), { recursive: true });
			} catch {
				// Skip directories that do not exist yet.
			}
		}

		await writeJson(join(backupDir, "manifest.json"), {
			createdAt: now,
			maintenanceVersion,
			memoryDir: this.cfg.memoryDir,
		});

		return backupDir;
	}

	private async syncEpisodeToV2(ep: Episode): Promise<void> {
		const [episodes, facets, links, procedural, meta] = await Promise.all([
			loadV2Episodes(this.v2Paths),
			loadV2Facets(this.v2Paths),
			loadV2Links(this.v2Paths),
			loadV2Procedural(this.v2Paths),
			loadV2Meta(this.v2Paths),
		]);

		const now = new Date().toISOString();
		const episodeId = this.makeEpisodeMemoryId(ep);
		const mapped = this.mapEpisodeToV2(ep, now);
		const nextEpisodes = episodes.filter((existing) => existing.id !== episodeId);
		nextEpisodes.push(mapped.episode);

		const nextFacets = facets.filter((facet) => facet.episodeId !== episodeId);
		nextFacets.push(...mapped.facets);

		const facetIds = new Set(mapped.facets.map((facet) => facet.id));
		const nextLinks = links.filter(
			(link) =>
				link.fromId !== episodeId &&
				link.toId !== episodeId &&
				!facetIds.has(link.fromId) &&
				!facetIds.has(link.toId),
		);
		nextLinks.push(...mapped.links);

		const nextProcedural = procedural.filter((item) => !item.sourceEpisodeIds?.includes(episodeId));
		const compiledProcedure = compileProcedureFromEpisode(mapped.episode, mapped.facets, now);
		if (compiledProcedure) {
			nextProcedural.push(compiledProcedure);
			mapped.episode.derivedProcedureIds = [compiledProcedure.id];
			nextEpisodes[nextEpisodes.length - 1] = mapped.episode;
		}

		await Promise.all([
			saveV2Episodes(this.v2Paths, nextEpisodes),
			saveV2Facets(this.v2Paths, nextFacets),
			saveV2Links(this.v2Paths, nextLinks),
			saveV2Procedural(this.v2Paths, nextProcedural),
			saveV2Meta(this.v2Paths, {
				...meta,
				version: 2,
				lastMigrationAt: meta.lastMigrationAt ?? now,
			}),
		]);
		if (this.cfg.embeddings.enabled && this.cfg.embeddings.autoSync && this.embeddingFn) {
			await this.syncV2Embeddings();
		}
	}

	private mapEpisodeToV2(
		ep: Episode,
		now: string,
	): {
		episode: EpisodeMemory;
		facets: EpisodeFacet[];
		links: MemoryLink[];
	} {
		const episodeId = this.makeEpisodeMemoryId(ep);
		const baseTags = [...new Set([...(ep.tags ?? []), ...extractTags(`${ep.project} ${ep.summary} ${ep.userGoal ?? ""}`)])];
		const facetDefs: Array<{
			facetType: FacetKind;
			searchText: string;
			anchorText?: string;
			summary?: string;
			detail?: string;
			outcomeScore?: number;
			causalRole?: EpisodeFacet["causalRole"];
		}> = [];

		if (ep.userGoal?.trim()) {
			facetDefs.push({
				facetType: "goal",
				searchText: ep.userGoal.trim(),
				anchorText: ep.summary,
				summary: `Goal: ${ep.userGoal.trim()}`,
			});
		}

		for (const error of ep.errors.slice(0, 8)) {
			if (!error.trim()) continue;
			facetDefs.push({
				facetType: "error",
				searchText: error.trim(),
				anchorText: ep.summary,
				summary: `Error: ${error.trim()}`,
				causalRole: "signal",
				outcomeScore: Math.max(1, 6 - ep.errors.length),
			});
		}

		for (const observation of ep.keyObservations.slice(0, 8)) {
			if (!observation.trim()) continue;
			facetDefs.push({
				facetType: "insight",
				searchText: observation.trim(),
				anchorText: ep.summary,
				summary: `Insight: ${observation.trim()}`,
				causalRole: "resolution",
				outcomeScore: Math.min(10, ep.importance),
			});
		}

		if (ep.summary.trim()) {
			facetDefs.push({
				facetType: "outcome",
				searchText: ep.summary.trim().slice(0, 200),
				anchorText: ep.summary.trim(),
				summary: ep.summary.trim(),
				detail: [ep.userGoal ? `Goal: ${ep.userGoal}` : "", ep.errors.length ? `Errors: ${ep.errors.join("; ")}` : ""]
					.filter(Boolean)
					.join("\n"),
				causalRole: ep.errors.length > 0 ? "effect" : "signal",
				outcomeScore: ep.errors.length > 0 ? Math.max(3, ep.importance - 1) : ep.importance,
			});
		}

		const facets: EpisodeFacet[] = facetDefs.map((facet, index) => {
			const facetId = `${episodeId}:facet:${index + 1}`;
			const facetTags = [
				...new Set([
					...baseTags,
					facet.facetType,
					...extractTags(`${facet.searchText} ${facet.summary ?? ""} ${facet.anchorText ?? ""}`),
				]),
			].slice(0, 40);
			return {
				id: facetId,
				kind: "facet" as const,
				episodeId,
				facetType: facet.facetType,
				searchText: facet.searchText,
				anchorText: facet.anchorText,
				summary: facet.summary,
				detail: facet.detail,
				accessCount: 0,
				importance: Math.max(1, Math.min(10, ep.importance)),
				salience: Math.max(1, Math.min(10, facet.outcomeScore ?? ep.importance)),
				confidence: 0.7,
				retention: ep.importance >= 8 ? ("key-event" as const) : ("ambient" as const),
				stability: ep.errors.length > 0 ? ("situational" as const) : ("stable" as const),
				tags: facetTags,
				sourceEpisodeIds: [episodeId],
				evidence: [],
				scope: { ...ep.scope, project: ep.project },
				createdAt: ep.startedAt ?? `${ep.date}T00:00:00.000Z`,
				updatedAt: now,
				entityRefs: [],
				aliases: [],
				causalRole: facet.causalRole,
				outcomeScore: facet.outcomeScore,
				structuralAnchor: this.currentStructuralAnchor(),
			};
		});

		const links = facets.map((facet) => ({
			id: `${episodeId}->${facet.id}`,
			fromId: episodeId,
			toId: facet.id,
			type: "has-facet" as const,
			weight: 1,
			explicit: true,
			createdAt: now,
			updatedAt: now,
			evidence: [],
		}));

		const episode: EpisodeMemory = {
			id: episodeId,
			kind: "episode",
			sessionId: ep.sessionId,
			title: ep.userGoal || ep.summary.slice(0, 80),
			summary: ep.summary,
			startedAt: ep.startedAt,
			endedAt: ep.endedAt,
			timeZone: ep.timeZone,
			userGoal: ep.userGoal,
			outcome: ep.errors.length ? "high-friction" : "completed",
			accessCount: 0,
			importance: Math.max(1, Math.min(10, ep.importance)),
			salience: Math.max(1, Math.min(10, ep.importance + Math.min(ep.errors.length, 2))),
			confidence: 0.85,
			retention: ep.importance >= 8 ? ("key-event" as const) : ("ambient" as const),
			stability: ep.errors.length > 0 ? ("situational" as const) : ("stable" as const),
			tags: baseTags.slice(0, 40),
			sourceEpisodeIds: [episodeId],
			evidence: [],
			scope: { ...ep.scope, project: ep.project },
			createdAt: ep.startedAt ?? `${ep.date}T00:00:00.000Z`,
			updatedAt: now,
			filesModified: ep.filesModified,
			toolsUsed: ep.toolsUsed,
			entities: [],
			facetIds: facets.map((facet) => facet.id),
			derivedSemanticIds: [],
			derivedProcedureIds: [],
			consolidatedAt: ep.consolidated ? now : undefined,
			structuralAnchor: this.currentStructuralAnchor(),
		};

		return { episode, facets, links };
	}

	private makeEpisodeMemoryId(ep: Episode): string {
		return `episode:${ep.sessionId}`;
	}

	/** Deduplicate all memory and work entries, merge relatedIds, save. Returns counts of removed duplicates. */
	async deduplicateAll(): Promise<{
		knowledge: number;
		lessons: number;
		events: number;
		preferences: number;
		facets: number;
		work: number;
		total: number;
	}> {
		const [knowledge, lessons, events, prefs, facets, work] = await Promise.all([
			loadEntries(this.knowledgePath),
			loadEntries(this.lessonsPath),
			loadEntries(this.eventsPath),
			loadEntries(this.preferencesPath),
			loadEntries(this.facetsPath),
			loadWork(this.workPath),
		]);

		const k = deduplicateMemoryEntries(knowledge);
		const l = deduplicateMemoryEntries(lessons);
		const ev = deduplicateMemoryEntries(events);
		const p = deduplicateMemoryEntries(prefs);
		const f = deduplicateMemoryEntries(facets);
		const w = deduplicateWorkEntries(work);

		const hl = this.cfg.halfLife;
		const ew = this.cfg.evictionWeights;
		await Promise.all([
			saveEntries(this.knowledgePath, k.deduped, this.cfg.maxEntries.knowledge, (e) =>
				utilityEntry(e, hl, ew),
			),
			saveEntries(this.lessonsPath, l.deduped, this.cfg.maxEntries.lessons, (e) =>
				utilityEntry(e, hl, ew),
			),
			saveEntries(this.eventsPath, ev.deduped, this.cfg.maxEntries.events, (e) =>
				utilityEntry(e, hl, ew),
			),
			saveEntries(this.preferencesPath, p.deduped, this.cfg.maxEntries.preferences, (e) =>
				utilityEntry(e, hl, ew),
			),
			saveEntries(this.facetsPath, f.deduped, this.cfg.maxEntries.facets, (e) =>
				utilityEntry(e, hl, ew),
			),
			saveWork(this.workPath, w.deduped, this.cfg.maxEntries.work, (wr) =>
				utilityWork(wr, this.cfg.halfLife, this.cfg.evictionWeights),
			),
		]);

		const total =
			k.removedCount + l.removedCount + ev.removedCount + p.removedCount + f.removedCount + w.removedCount;
		return {
			knowledge: k.removedCount,
			lessons: l.removedCount,
			events: ev.removedCount,
			preferences: p.removedCount,
			facets: f.removedCount,
			work: w.removedCount,
			total,
		};
	}

	async searchEntries(query: string, scope?: MemoryScope): Promise<MemoryEntry[]> {
		await this.autoReviveRelevantArchive(query, scope);
		const runtime = await this.buildRuntimeMemoryView();
		const tags = extractTags(query);
		const v2Primary = runtime.v2SearchEntries
			.map((entry) => ({
				entry,
				score: scoreEntry(entry, entry.project, tags, this.cfg.halfLife, this.cfg.scoreWeights),
			}))
			.filter((item) => item.score >= 0.42)
			.sort((a, b) => b.score - a.score)
			.map((item) => item.entry);
		if (v2Primary.length > 0) {
			const bridgeFacets = runtime.facets
				.filter((entry) => entry.facetData?.kind === "pattern" || entry.facetData?.kind === "struggle")
				.map((entry) => ({
					entry,
					score: scoreEntry(entry, entry.project, tags, this.cfg.halfLife, this.cfg.scoreWeights),
				}))
				.filter((item) => item.score >= 0.38)
				.sort((a, b) => b.score - a.score)
				.map((item) => item.entry);
			return [...v2Primary, ...bridgeFacets].slice(0, 12);
		}
		const all = [...runtime.knowledge, ...runtime.lessons, ...runtime.events, ...runtime.preferences, ...runtime.facets];
		return all
			.map((entry) => ({
				entry,
				score:
					tagOverlap(entry.tags, tags) +
					(entry.relations ?? [])
						.filter((relation) => tags.some((tag) => relation.kind.includes(tag) || relation.id.includes(tag)))
						.reduce((sum, relation) => sum + relation.weight * 0.12, 0),
			}))
			.filter((item) => item.score > 0)
			.sort((a, b) => b.score - a.score)
			.map((item) => item.entry);
	}

	async autoReviveRelevantArchive(
		query: string,
		scope?: MemoryScope,
		options?: { maxItems?: number; legacyThreshold?: number; v2Threshold?: number },
	): Promise<Array<{ id: string; location: "knowledge" | "lessons" | "events" | "preferences" | "facets" | "semantic" | "procedural" | "work" }>> {
		const trimmed = query.trim();
		const contextTags = extractTags(trimmed);
		if (!trimmed || contextTags.length === 0) return [];

		const project = (scope as { project?: string } | undefined)?.project ?? "";
		const hl = this.cfg.halfLife;
		const sw = this.cfg.scoreWeights;
		const maxItems = options?.maxItems ?? NanoMemEngine.AUTO_REVIVE_MAX_ITEMS;
		const legacyThreshold = options?.legacyThreshold ?? 0.82;
		const v2Threshold = options?.v2Threshold ?? 0.8;
		const revived: Array<{ id: string; location: "knowledge" | "lessons" | "events" | "preferences" | "facets" | "semantic" | "procedural" | "work" }> = [];

		const archive = await this.exportArchive();
		const legacyCandidates = [
			...archive.knowledge.map((entry) => ({ entry, location: "knowledge" as const })),
			...archive.lessons.map((entry) => ({ entry, location: "lessons" as const })),
			...archive.events.map((entry) => ({ entry, location: "events" as const })),
			...archive.preferences.map((entry) => ({ entry, location: "preferences" as const })),
			...archive.facets.map((entry) => ({ entry, location: "facets" as const })),
		]
			.filter(({ entry }) => !scope?.userId || !entry.scope?.userId || entry.scope.userId === scope.userId)
			.filter(({ entry }) => !scope?.agentId || !entry.scope?.agentId || entry.scope.agentId === scope.agentId)
			.map(({ entry, location }) => ({
				id: entry.id,
				location,
				score: scoreEntry(entry, project || entry.project, contextTags, hl, sw),
			}))
			.filter((candidate) => candidate.score >= legacyThreshold)
			.sort((a, b) => b.score - a.score)
			.slice(0, maxItems);

		for (const candidate of legacyCandidates) {
			const result = await this.restoreArchivedEntry(candidate.id);
			if (result.ok && result.location) revived.push({ id: candidate.id, location: result.location });
		}

		if (revived.length >= maxItems) return revived;

		const semanticCandidates = archive.semantic
			.filter((entry) => !scope?.userId || !entry.scope?.userId || entry.scope.userId === scope.userId)
			.filter((entry) => !scope?.agentId || !entry.scope?.agentId || entry.scope.agentId === scope.agentId)
			.filter((entry) => !project || !entry.scope?.project || entry.scope.project === project)
			.map((entry) => ({ id: entry.id, location: "semantic" as const, score: this.scoreV2SemanticMemory(entry, project, contextTags) }))
			.filter((candidate) => candidate.score >= v2Threshold);
		const proceduralCandidates = archive.procedural
			.filter((entry) => !scope?.userId || !entry.scope?.userId || entry.scope.userId === scope.userId)
			.filter((entry) => !scope?.agentId || !entry.scope?.agentId || entry.scope.agentId === scope.agentId)
			.filter((entry) => !project || !entry.scope?.project || entry.scope.project === project)
			.map((entry) => ({
				id: entry.id,
				location: "procedural" as const,
				// Archived procedures are often older superseded versions, so revive scoring should not punish status as heavily.
				score: this.scoreProceduralMemory(entry, project, contextTags) + (entry.status === "superseded" || entry.status === "deprecated" ? 0.24 : 0),
			}))
			.filter((candidate) => candidate.score >= v2Threshold);

		const v2Candidates = [...semanticCandidates, ...proceduralCandidates]
			.sort((a, b) => b.score - a.score)
			.slice(0, Math.max(0, maxItems - revived.length));

		for (const candidate of v2Candidates) {
			const result = await this.restoreArchivedEntry(candidate.id);
			if (result.ok && result.location) revived.push({ id: candidate.id, location: result.location });
		}

		return revived;
	}

	async getAlignmentSnapshot(): Promise<AlignmentSnapshot> {
		const all = await this.buildRuntimeMemoryView();
		const memoryEntries = [...all.knowledge, ...all.lessons, ...all.events, ...all.preferences, ...all.facets];
		const sortByInfluence = (entries: MemoryEntry[]) =>
			[...entries].sort((a, b) => {
				const aScore =
					(a.salience ?? a.importance) * ((a.accessCount ?? 0) + 1) + (a.retention === "core" ? 2 : 0);
				const bScore =
					(b.salience ?? b.importance) * ((b.accessCount ?? 0) + 1) + (b.retention === "core" ? 2 : 0);
				return bScore - aScore;
			});
		const identityCore = sortByInfluence(
			memoryEntries.filter((entry) => entry.stability !== "situational" && entry.retention === "core"),
		).slice(0, 8);
		const keyEvents = sortByInfluence(
			memoryEntries.filter((entry) => entry.type === "event" || entry.retention === "key-event"),
		).slice(0, 8);
		const behaviorDrivers = sortByInfluence(
			memoryEntries.filter((entry) => entry.type === "pattern" || entry.type === "preference" || entry.type === "lesson"),
		).slice(0, 8);
		const currentState = sortByInfluence(
			memoryEntries.filter((entry) => entry.stability === "situational" || entry.stateData),
		).slice(0, 6);
		const relationshipEdges = sortByInfluence(memoryEntries)
			.flatMap((entry) =>
				(entry.relations ?? []).map((relation) => ({
					fromId: entry.id,
					toId: relation.id,
					kind: relation.kind,
					weight: relation.weight,
				})),
			)
			.sort((a, b) => b.weight - a.weight)
			.slice(0, 12);
		const conflicts = this.detectAlignmentConflicts(memoryEntries).slice(0, 8);

		return {
			identityCore,
			keyEvents,
			behaviorDrivers,
			currentState,
			relationshipEdges,
			conflicts,
			generatedAt: new Date().toISOString(),
		};
	}

	async forgetEntry(id: string): Promise<boolean> {
		const paths = [this.knowledgePath, this.lessonsPath, this.eventsPath, this.preferencesPath, this.facetsPath];
		for (const path of paths) {
			const entries = await loadEntries(path);
			const idx = entries.findIndex((e) => e.id === id);
			if (idx >= 0) {
				entries.splice(idx, 1);
				const hl = this.cfg.halfLife;
				const ew = this.cfg.evictionWeights;
				await saveEntries(path, entries, Infinity, (e) => utilityEntry(e, hl, ew));
				return true;
			}
		}
		return false;
	}

	async exportAll(): Promise<{
		knowledge: MemoryEntry[];
		lessons: MemoryEntry[];
		events: MemoryEntry[];
		preferences: MemoryEntry[];
		facets: MemoryEntry[];
		work: WorkEntry[];
		episodes: Episode[];
		meta: Meta;
	}> {
		const [knowledge, lessons, events, preferences, facets, work, episodes, meta] = await Promise.all([
			loadEntries(this.knowledgePath),
			loadEntries(this.lessonsPath),
			loadEntries(this.eventsPath),
			loadEntries(this.preferencesPath),
			loadEntries(this.facetsPath),
			loadWork(this.workPath),
			loadEpisodes(this.episodesDir),
			loadMeta(this.metaPath),
		]);
		return { knowledge, lessons, events, preferences, facets, work, episodes, meta };
	}

	async exportArchive(): Promise<{
		knowledge: MemoryEntry[];
		lessons: MemoryEntry[];
		events: MemoryEntry[];
		preferences: MemoryEntry[];
		facets: MemoryEntry[];
		work: WorkEntry[];
		semantic: SemanticMemory[];
		procedural: ProceduralMemory[];
	}> {
		const [knowledge, lessons, events, preferences, facets, work, semantic, procedural] = await Promise.all([
			loadEntries(this.archiveKnowledgePath),
			loadEntries(this.archiveLessonsPath),
			loadEntries(this.archiveEventsPath),
			loadEntries(this.archivePreferencesPath),
			loadEntries(this.archiveFacetsPath),
			loadWork(this.archiveWorkPath),
			loadV2Semantic(this.archiveV2Paths),
			loadV2Procedural(this.archiveV2Paths),
		]);
		return { knowledge, lessons, events, preferences, facets, work, semantic, procedural };
	}

	async exportAllV2(): Promise<{
		episodes: EpisodeMemory[];
		facets: EpisodeFacet[];
		semantic: import("./types-v2.js").SemanticMemory[];
		procedural: ProceduralMemory[];
		links: MemoryLink[];
	}> {
		const [episodes, facets, semantic, procedural, links] = await Promise.all([
			loadV2Episodes(this.v2Paths),
			loadV2Facets(this.v2Paths),
			loadV2Semantic(this.v2Paths),
			loadV2Procedural(this.v2Paths),
			loadV2Links(this.v2Paths),
		]);
		return { episodes, facets, semantic, procedural, links };
	}

	async rebuildV2Links(): Promise<{ total: number; auto: number }> {
		const snapshot = await this.exportAllV2();
		const nextLinks = this.materializeV2Links(snapshot.semantic, snapshot.procedural, snapshot.links);
		await saveV2Links(this.v2Paths, nextLinks);
		return {
			total: nextLinks.length,
			auto: nextLinks.filter((link) => link.id.startsWith(NanoMemEngine.AUTO_V2_LINK_PREFIX)).length,
		};
	}

	async archiveStaleMemories(now = new Date().toISOString()): Promise<{
		knowledge: number;
		lessons: number;
		events: number;
		preferences: number;
		facets: number;
		work: number;
		semantic: number;
		procedural: number;
		total: number;
	}> {
		const [knowledge, lessons, events, preferences, facets, work, archived, semantic, procedural, archivedSemantic, archivedProcedural] =
			await Promise.all([
				loadEntries(this.knowledgePath),
				loadEntries(this.lessonsPath),
				loadEntries(this.eventsPath),
				loadEntries(this.preferencesPath),
				loadEntries(this.facetsPath),
				loadWork(this.workPath),
				this.exportArchive(),
				loadV2Semantic(this.v2Paths),
				loadV2Procedural(this.v2Paths),
				loadV2Semantic(this.archiveV2Paths),
				loadV2Procedural(this.archiveV2Paths),
			]);

		const knowledgeResult = this.partitionArchivedEntries(knowledge, now);
		const lessonsResult = this.partitionArchivedEntries(lessons, now);
		const eventsResult = this.partitionArchivedEntries(events, now);
		const preferencesResult = this.partitionArchivedEntries(preferences, now);
		const facetsResult = this.partitionArchivedEntries(facets, now);
		const workResult = this.partitionArchivedWork(work, now);
		const semanticResult = this.partitionArchivedSemantic(semantic, now);
		const proceduralResult = this.partitionArchivedProcedural(procedural, now);

		const hl = this.cfg.halfLife;
		const ew = this.cfg.evictionWeights;
		await Promise.all([
			saveEntries(this.knowledgePath, knowledgeResult.active, this.cfg.maxEntries.knowledge, (entry) => utilityEntry(entry, hl, ew)),
			saveEntries(this.lessonsPath, lessonsResult.active, this.cfg.maxEntries.lessons, (entry) => utilityEntry(entry, hl, ew)),
			saveEntries(this.eventsPath, eventsResult.active, this.cfg.maxEntries.events, (entry) => utilityEntry(entry, hl, ew)),
			saveEntries(this.preferencesPath, preferencesResult.active, this.cfg.maxEntries.preferences, (entry) => utilityEntry(entry, hl, ew)),
			saveEntries(this.facetsPath, facetsResult.active, this.cfg.maxEntries.facets, (entry) => utilityEntry(entry, hl, ew)),
			saveWork(this.workPath, workResult.active, this.cfg.maxEntries.work, (entry) => utilityWork(entry, this.cfg.halfLife, this.cfg.evictionWeights)),
			saveEntries(this.archiveKnowledgePath, this.mergeArchivedEntries(archived.knowledge, knowledgeResult.archived), Infinity, (entry) =>
				utilityEntry(entry, hl, ew),
			),
			saveEntries(this.archiveLessonsPath, this.mergeArchivedEntries(archived.lessons, lessonsResult.archived), Infinity, (entry) =>
				utilityEntry(entry, hl, ew),
			),
			saveEntries(this.archiveEventsPath, this.mergeArchivedEntries(archived.events, eventsResult.archived), Infinity, (entry) =>
				utilityEntry(entry, hl, ew),
			),
			saveEntries(
				this.archivePreferencesPath,
				this.mergeArchivedEntries(archived.preferences, preferencesResult.archived),
				Infinity,
				(entry) => utilityEntry(entry, hl, ew),
			),
			saveEntries(this.archiveFacetsPath, this.mergeArchivedEntries(archived.facets, facetsResult.archived), Infinity, (entry) =>
				utilityEntry(entry, hl, ew),
			),
			saveWork(
				this.archiveWorkPath,
				this.mergeArchivedWork(archived.work, workResult.archived),
				Infinity,
				(entry) => utilityWork(entry, this.cfg.halfLife, this.cfg.evictionWeights),
			),
			saveV2Semantic(this.v2Paths, semanticResult.active),
			saveV2Procedural(this.v2Paths, proceduralResult.active),
			saveV2Semantic(this.archiveV2Paths, this.mergeArchivedV2(archivedSemantic, semanticResult.archived)),
			saveV2Procedural(this.archiveV2Paths, this.mergeArchivedV2(archivedProcedural, proceduralResult.archived)),
		]);

		const total =
			knowledgeResult.archived.length +
			lessonsResult.archived.length +
			eventsResult.archived.length +
			preferencesResult.archived.length +
			facetsResult.archived.length +
			workResult.archived.length +
			semanticResult.archived.length +
			proceduralResult.archived.length;

		return {
			knowledge: knowledgeResult.archived.length,
			lessons: lessonsResult.archived.length,
			events: eventsResult.archived.length,
			preferences: preferencesResult.archived.length,
			facets: facetsResult.archived.length,
			work: workResult.archived.length,
			semantic: semanticResult.archived.length,
			procedural: proceduralResult.archived.length,
			total,
		};
	}

	async restoreArchivedEntry(id: string): Promise<{
		ok: boolean;
		location?: "knowledge" | "lessons" | "events" | "preferences" | "facets" | "work" | "semantic" | "procedural";
	}> {
		const hl = this.cfg.halfLife;
		const ew = this.cfg.evictionWeights;
		const restoreLegacy = async (
			activePath: string,
			archivePath: string,
			location: "knowledge" | "lessons" | "events" | "preferences" | "facets",
		): Promise<{ ok: boolean; location?: typeof location }> => {
			const [active, archived] = await Promise.all([loadEntries(activePath), loadEntries(archivePath)]);
			const index = archived.findIndex((entry) => entry.id === id);
			if (index < 0) return { ok: false };
			const [entry] = archived.splice(index, 1);
			active.push({
				...entry,
				archivedAt: undefined,
				archiveReason: undefined,
				revivedAt: new Date().toISOString(),
			});
			await Promise.all([
				saveEntries(activePath, active, Infinity, (candidate) => utilityEntry(candidate, hl, ew)),
				saveEntries(archivePath, archived, Infinity, (candidate) => utilityEntry(candidate, hl, ew)),
			]);
			return { ok: true, location };
		};

		for (const [activePath, archivePath, location] of [
			[this.knowledgePath, this.archiveKnowledgePath, "knowledge"],
			[this.lessonsPath, this.archiveLessonsPath, "lessons"],
			[this.eventsPath, this.archiveEventsPath, "events"],
			[this.preferencesPath, this.archivePreferencesPath, "preferences"],
			[this.facetsPath, this.archiveFacetsPath, "facets"],
		] as const) {
			const result = await restoreLegacy(activePath, archivePath, location);
			if (result.ok) return result;
		}

		{
			const [active, archived] = await Promise.all([loadWork(this.workPath), loadWork(this.archiveWorkPath)]);
			const index = archived.findIndex((entry) => entry.id === id);
			if (index >= 0) {
				const [entry] = archived.splice(index, 1);
				active.push({
					...entry,
					archivedAt: undefined,
					archiveReason: undefined,
					revivedAt: new Date().toISOString(),
				});
				await Promise.all([
					saveWork(this.workPath, active, Infinity, (candidate) => utilityWork(candidate, this.cfg.halfLife, this.cfg.evictionWeights)),
					saveWork(
						this.archiveWorkPath,
						archived,
						Infinity,
						(candidate) => utilityWork(candidate, this.cfg.halfLife, this.cfg.evictionWeights),
					),
				]);
				return { ok: true, location: "work" };
			}
		}

		{
			const [active, archived] = await Promise.all([loadV2Semantic(this.v2Paths), loadV2Semantic(this.archiveV2Paths)]);
			const index = archived.findIndex((entry) => entry.id === id);
			if (index >= 0) {
				const [entry] = archived.splice(index, 1);
				active.push({
					...entry,
					archivedAt: undefined,
					archiveReason: undefined,
					revivedAt: new Date().toISOString(),
				});
				await Promise.all([saveV2Semantic(this.v2Paths, active), saveV2Semantic(this.archiveV2Paths, archived)]);
				await this.rebuildV2Links();
				return { ok: true, location: "semantic" };
			}
		}

		{
			const [active, archived] = await Promise.all([loadV2Procedural(this.v2Paths), loadV2Procedural(this.archiveV2Paths)]);
			const index = archived.findIndex((entry) => entry.id === id);
			if (index >= 0) {
				const [entry] = archived.splice(index, 1);
				active.push({
					...entry,
					archivedAt: undefined,
					archiveReason: undefined,
					revivedAt: new Date().toISOString(),
				});
				await Promise.all([saveV2Procedural(this.v2Paths, active), saveV2Procedural(this.archiveV2Paths, archived)]);
				await this.rebuildV2Links();
				return { ok: true, location: "procedural" };
			}
		}

		return { ok: false };
	}

	async inspectV2Memory(project = "", scope?: MemoryScope): Promise<{
		counts: {
			episodes: number;
			facets: number;
			semantic: number;
			procedural: number;
			activeProcedural: number;
			supersededProcedural: number;
			semanticConflicts: number;
			proceduralConflicts: number;
			procedureChains: number;
		};
		procedureChains: Array<{
			rootId: string;
			name: string;
			status: ProceduralMemory["status"];
			versionDepth: number;
			ids: string[];
		}>;
		proceduralConflicts: Array<{
			aId: string;
			bId: string;
			aName: string;
			bName: string;
			score: number;
			reason: string;
		}>;
		semanticConflicts: Array<{
			aId: string;
			bId: string;
			aName: string;
			bName: string;
			reason: string;
		}>;
	}> {
		const snapshot = await this.exportAllV2();
		const episodes = this.filterAndCleanV2Episodes(snapshot.episodes, project, scope);
		const facets = this.filterAndCleanV2Facets(snapshot.facets, project, scope);
		const semantic = this.filterAndCleanV2Semantic(snapshot.semantic, project, scope);
		const allProcedural = snapshot.procedural.filter((entry) => {
			if (scope?.userId && entry.scope?.userId && entry.scope.userId !== scope.userId) return false;
			if (scope?.agentId && entry.scope?.agentId && entry.scope.agentId !== scope.agentId) return false;
			if (project && entry.scope?.project && entry.scope.project !== project) return false;
			return true;
		});
		const activeProcedural = allProcedural.filter((entry) => entry.status !== "deprecated" && entry.status !== "superseded");
		const procedureChains = this.buildProceduralChains(allProcedural);
		const proceduralConflicts = this.detectProceduralConflicts(activeProcedural);
		const semanticConflicts = this.detectSemanticConflicts(semantic);

		return {
			counts: {
				episodes: episodes.length,
				facets: facets.length,
				semantic: semantic.length,
				procedural: allProcedural.length,
				activeProcedural: activeProcedural.length,
				supersededProcedural: allProcedural.filter((entry) => entry.status === "superseded").length,
				semanticConflicts: semanticConflicts.length,
				proceduralConflicts: proceduralConflicts.length,
				procedureChains: procedureChains.length,
			},
			procedureChains,
			proceduralConflicts,
			semanticConflicts,
		};
	}

	// ─── Full Insights Report ────────────────────────────────────────

	async generateFullInsights(): Promise<FullInsightsReport> {
		const all = await this.buildRuntimeMemoryView();
		return buildFullInsightsReport(all, this.llmFn, this.cfg.locale);
	}

	/**
	 * Generate enhanced insights report (includes human-readable insights + developer persona + root cause analysis)
	 */
	async generateEnhancedInsights(): Promise<{
		report: FullInsightsReport;
		persona?: DeveloperPersona;
		humanInsights: HumanInsight[];
		rootCauses: RootCauseInsight[];
	}> {
		const all = await this.buildRuntimeMemoryView();

		// Generate base report and human-readable insights in parallel
		const [baseReport, humanData] = await Promise.all([
			buildFullInsightsReport(all, this.llmFn, this.cfg.locale),
			generateHumanInsights(all, this.llmFn, this.cfg.locale),
		]);

		return {
			report: baseReport,
			persona: humanData.persona,
			humanInsights: humanData.humanInsights,
			rootCauses: humanData.rootCauses,
		};
	}

	// ─── Insights Generation ─────────────────────────────────────

	async generateInsights(): Promise<InsightsReport> {
		const all = await this.buildRuntimeMemoryView();
		const stats = {
			knowledge: all.knowledge.length,
			lessons: all.lessons.length,
			preferences: all.preferences.length,
			facets: all.facets.length,
			episodes: all.episodes.length,
			work: all.work.length,
			totalSessions: all.meta.totalSessions,
		};

		// Separate patterns and struggles from facets
		const patternEntries = all.facets.filter((e) => e.type === "pattern");
		const struggleEntries = all.facets.filter((e) => e.type === "struggle");

		// Weight calculation: (accessCount + 1) × (importance / 10)
		const calcWeight = (e: MemoryEntry, unresolvedBonus = false): number => {
			const base = (e.accessCount + 1) * (e.importance / 10);
			return unresolvedBonus ? base * 1.5 : base;
		};

		// Build PatternInsight[]
		const patterns: PatternInsight[] = patternEntries
			.map((e) => ({
				entry: e,
				weight: calcWeight(e),
				trigger: e.facetData?.kind === "pattern" ? e.facetData.trigger : (e.summary || e.detail || "").slice(0, 50),
				behavior: e.facetData?.kind === "pattern" ? e.facetData.behavior : (e.summary || e.detail || ""),
			}))
			.sort((a, b) => b.weight - a.weight);

		// Build StruggleInsight[]
		const struggles: StruggleInsight[] = struggleEntries
			.map((e) => {
				const isResolved = e.facetData?.kind === "struggle" ? !!e.facetData.solution : false;
				return {
					entry: e,
					weight: calcWeight(e, !isResolved),
					problem: e.facetData?.kind === "struggle" ? e.facetData.problem : (e.summary || e.detail || ""),
					attempts: e.facetData?.kind === "struggle" ? e.facetData.attempts : [],
					solution: e.facetData?.kind === "struggle" ? e.facetData.solution : "",
					resolved: isResolved,
				};
			})
			.sort((a, b) => {
				// Unresolved first, then by weight
				if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
				return b.weight - a.weight;
			});

		// Top lessons and knowledge by importance × accessCount
		const sortByRelevance = (arr: MemoryEntry[]) =>
			[...arr].sort((a, b) => b.importance * (b.accessCount + 1) - a.importance * (a.accessCount + 1));

		const topLessons = sortByRelevance(all.lessons).slice(0, 10);
		const topKnowledge = sortByRelevance(all.knowledge).slice(0, 10);

		// Generate recommendations (LLM or rules-based fallback)
		const recommendations = await this.generateRecommendations(patterns, struggles, topLessons);

		return {
			patterns,
			struggles,
			topLessons,
			topKnowledge,
			preferences: all.preferences,
			stats,
			recommendations,
			generatedAt: new Date().toISOString(),
		};
	}

	private async generateRecommendations(
		patterns: PatternInsight[],
		struggles: StruggleInsight[],
		lessons: MemoryEntry[],
	): Promise<string[]> {
		// Try LLM-based recommendations if available
		if (this.llmFn) {
			try {
				const p = PROMPTS[this.cfg.locale] ?? PROMPTS.en;
				const input = JSON.stringify({
					patterns: patterns.slice(0, 5).map((pa) => ({ trigger: pa.trigger, behavior: pa.behavior })),
					struggles: struggles.slice(0, 5).map((s) => ({ problem: s.problem, resolved: s.resolved })),
					lessons: lessons.slice(0, 5).map((l) => l.summary || l.detail || l.content || ""),
				});
				const raw = await this.llmFn(p.insightsRecommendationSystem, input);
				const cleaned = raw
					.replace(/```json?\n?/g, "")
					.replace(/```/g, "")
					.trim();
				const result = JSON.parse(cleaned) as string[];
				if (Array.isArray(result) && result.length > 0) {
					return result.slice(0, 5);
				}
			} catch {
				// Fall through to rules-based
			}
		}

		// Rules-based fallback recommendations
		return this.generateRulesBasedRecommendations(patterns, struggles, lessons);
	}

	private generateRulesBasedRecommendations(
		patterns: PatternInsight[],
		struggles: StruggleInsight[],
		lessons: MemoryEntry[],
	): string[] {
		const recommendations: string[] = [];

		// High-weight patterns → automation suggestion
		if (patterns.length > 0) {
			const top = patterns[0]!;
			recommendations.push(
				`You consistently ${top.behavior} when ${top.trigger}. Consider automating this behavior.`,
			);
		}

		// Unresolved struggles → systematic review suggestion
		const unresolved = struggles.filter((s) => !s.resolved);
		if (unresolved.length >= 2) {
			recommendations.push(
				`You have ${unresolved.length} unresolved issues. Consider tackling them systematically.`,
			);
		}

		// Recurring tag patterns in struggles → domain-specific review
		const struggleTags = struggles.flatMap((s) => s.entry.tags);
		const tagCounts = struggleTags.reduce(
			(acc, tag) => {
				acc[tag] = (acc[tag] || 0) + 1;
				return acc;
			},
			{} as Record<string, number>,
		);
		const topTag = Object.entries(tagCounts).sort((a, b) => b[1] - a[1])[0];
		if (topTag && topTag[1] >= 3) {
			recommendations.push(
				`Issues related to "${topTag[0]}" appear frequently. Consider deeper learning in this area.`,
			);
		}

		// Lessons accumulation → expertise recognition
		if (lessons.length >= 5) {
			recommendations.push(
				`You've accumulated ${lessons.length} lessons. This is valuable expertise.`,
			);
		}

		// No data → encouragement
		if (patterns.length === 0 && struggles.length === 0 && lessons.length === 0) {
			recommendations.push(`Keep using the system to let it learn your work habits.`);
		}

		return recommendations.slice(0, 5);
	}

	// ─── Private Helpers ─────────────────────────────────────────

	private getMemoryPathConfigs(): Array<{ path: string; max: number }> {
		return [
			{ path: this.knowledgePath, max: this.cfg.maxEntries.knowledge },
			{ path: this.lessonsPath, max: this.cfg.maxEntries.lessons },
			{ path: this.eventsPath, max: this.cfg.maxEntries.events },
			{ path: this.preferencesPath, max: this.cfg.maxEntries.preferences },
			{ path: this.facetsPath, max: this.cfg.maxEntries.facets },
		];
	}

	private async findEntryLocation(
		id: string,
	): Promise<{ entry: MemoryEntry; entries: MemoryEntry[]; path: string; max: number } | null> {
		for (const { path, max } of this.getMemoryPathConfigs()) {
			const entries = await loadEntries(path);
			const entry = entries.find((candidate) => candidate.id === id);
			if (entry) return { entry, entries, path, max };
		}
		return null;
	}

	private async persistEntries(path: string, entries: MemoryEntry[], max: number): Promise<void> {
		const hl = this.cfg.halfLife;
		const ew = this.cfg.evictionWeights;
		await saveEntries(path, entries, max, (entry) => utilityEntry(entry, hl, ew));
	}

	private filterAndCleanEntries(entries: MemoryEntry[], scope?: MemoryScope): MemoryEntry[] {
		return filterByScope(evictExpiredEntries(entries).filter((entry) => !entry.archivedAt), scope);
	}

	private filterAndCleanWork(entries: WorkEntry[], scope?: MemoryScope): WorkEntry[] {
		return filterByScope(evictExpiredWork(entries).filter((entry) => !entry.archivedAt), scope);
	}

	private filterAndCleanProcedural(
		entries: ProceduralMemory[],
		project: string,
		scope?: MemoryScope,
	): ProceduralMemory[] {
		return entries.filter((entry) => {
			if (scope?.userId && entry.scope?.userId && entry.scope.userId !== scope.userId) return false;
			if (scope?.agentId && entry.scope?.agentId && entry.scope.agentId !== scope.agentId) return false;
			if (project && entry.scope?.project && entry.scope.project !== project) return false;
			return !entry.archivedAt && entry.status !== "deprecated" && entry.status !== "superseded";
		});
	}

	private filterAndCleanV2Episodes(entries: EpisodeMemory[], project: string, scope?: MemoryScope): EpisodeMemory[] {
		return entries.filter((entry) => {
			if (scope?.userId && entry.scope?.userId && entry.scope.userId !== scope.userId) return false;
			if (scope?.agentId && entry.scope?.agentId && entry.scope.agentId !== scope.agentId) return false;
			if (project && entry.scope?.project && entry.scope.project !== project) return false;
			return !entry.archivedAt;
		});
	}

	private filterAndCleanV2Facets(entries: EpisodeFacet[], project: string, scope?: MemoryScope): EpisodeFacet[] {
		return entries.filter((entry) => {
			if (scope?.userId && entry.scope?.userId && entry.scope.userId !== scope.userId) return false;
			if (scope?.agentId && entry.scope?.agentId && entry.scope.agentId !== scope.agentId) return false;
			if (project && entry.scope?.project && entry.scope.project !== project) return false;
			return !entry.archivedAt;
		});
	}

	private filterAndCleanV2Semantic(entries: SemanticMemory[], project: string, scope?: MemoryScope): SemanticMemory[] {
		return entries.filter((entry) => {
			if (scope?.userId && entry.scope?.userId && entry.scope.userId !== scope.userId) return false;
			if (scope?.agentId && entry.scope?.agentId && entry.scope.agentId !== scope.agentId) return false;
			if (project && entry.scope?.project && entry.scope.project !== project) return false;
			return !entry.archivedAt && !entry.supersededById;
		});
	}

	private mergeArchivedEntries(existing: MemoryEntry[], incoming: MemoryEntry[]): MemoryEntry[] {
		const merged = new Map(existing.map((entry) => [entry.id, entry]));
		for (const entry of incoming) merged.set(entry.id, entry);
		return [...merged.values()].sort((a, b) => (b.archivedAt ?? b.created).localeCompare(a.archivedAt ?? a.created));
	}

	private mergeArchivedWork(existing: WorkEntry[], incoming: WorkEntry[]): WorkEntry[] {
		const merged = new Map(existing.map((entry) => [entry.id, entry]));
		for (const entry of incoming) merged.set(entry.id, entry);
		return [...merged.values()].sort((a, b) => (b.archivedAt ?? b.created).localeCompare(a.archivedAt ?? a.created));
	}

	private mergeArchivedV2<T extends { id: string; createdAt: string; archivedAt?: string }>(existing: T[], incoming: T[]): T[] {
		const merged = new Map(existing.map((entry) => [entry.id, entry]));
		for (const entry of incoming) merged.set(entry.id, entry);
		return [...merged.values()].sort((a, b) => (b.archivedAt ?? b.createdAt).localeCompare(a.archivedAt ?? a.createdAt));
	}

	private partitionArchivedEntries(entries: MemoryEntry[], now: string): { active: MemoryEntry[]; archived: MemoryEntry[] } {
		const active: MemoryEntry[] = [];
		const archived: MemoryEntry[] = [];
		for (const entry of entries) {
			const reason = this.getLegacyArchiveReason(entry);
			if (!reason) {
				active.push(entry);
				continue;
			}
			archived.push({
				...entry,
				archivedAt: entry.archivedAt ?? now,
				archiveReason: entry.archiveReason ?? reason,
			});
		}
		return { active, archived };
	}

	private partitionArchivedWork(entries: WorkEntry[], now: string): { active: WorkEntry[]; archived: WorkEntry[] } {
		const active: WorkEntry[] = [];
		const archived: WorkEntry[] = [];
		for (const entry of entries) {
			const reason = this.getWorkArchiveReason(entry);
			if (!reason) {
				active.push(entry);
				continue;
			}
			archived.push({
				...entry,
				archivedAt: entry.archivedAt ?? now,
				archiveReason: entry.archiveReason ?? reason,
			});
		}
		return { active, archived };
	}

	private partitionArchivedSemantic(entries: SemanticMemory[], now: string): { active: SemanticMemory[]; archived: SemanticMemory[] } {
		const active: SemanticMemory[] = [];
		const archived: SemanticMemory[] = [];
		for (const entry of entries) {
			const reason = this.getSemanticArchiveReason(entry);
			if (!reason) {
				active.push(entry);
				continue;
			}
			archived.push({
				...entry,
				archivedAt: entry.archivedAt ?? now,
				archiveReason: entry.archiveReason ?? reason,
			});
		}
		return { active, archived };
	}

	private partitionArchivedProcedural(entries: ProceduralMemory[], now: string): { active: ProceduralMemory[]; archived: ProceduralMemory[] } {
		const active: ProceduralMemory[] = [];
		const archived: ProceduralMemory[] = [];
		for (const entry of entries) {
			const reason = this.getProceduralArchiveReason(entry);
			if (!reason) {
				active.push(entry);
				continue;
			}
			archived.push({
				...entry,
				archivedAt: entry.archivedAt ?? now,
				archiveReason: entry.archiveReason ?? reason,
			});
		}
		return { active, archived };
	}

	private getLegacyArchiveReason(entry: MemoryEntry): string | undefined {
		if (entry.archivedAt) return entry.archiveReason ?? "pre-archived";
		if (entry.revivedAt && daysSince(entry.revivedAt) <= this.cfg.forgetting.reviveCooldownDays) return undefined;
		const anchor = entry.lastAccessed ?? entry.eventTime ?? entry.created;
		const ageDays = daysSince(anchor);
		const lowSignal = (entry.accessCount ?? 0) <= 1 && entry.importance <= 6 && (entry.salience ?? entry.importance) <= 6;
		if (entry.retention === "ambient" && lowSignal && ageDays > this.cfg.forgetting.ambientTtlDays) {
			return "stale-ambient-memory";
		}
		return undefined;
	}

	private inferSemanticRetention(item: ExtractedItem): SemanticMemory["retention"] {
		if (item.retention) return item.retention;
		if (item.stability === "situational" || item.stateData) return "ambient";
		switch (item.type) {
			case "preference":
			case "pattern":
				return "core";
			case "lesson":
			case "decision":
			case "event":
			case "struggle":
				return "key-event";
			default:
				return "ambient";
		}
	}

	private inferSemanticStability(item: ExtractedItem): SemanticMemory["stability"] {
		if (item.stability === "situational") return "situational";
		if (item.stateData) return "volatile";
		switch (item.type) {
			case "preference":
			case "pattern":
				return "stable";
			case "event":
			case "struggle":
				return "situational";
			default:
				return "stable";
		}
	}

	private inferSemanticImportance(item: ExtractedItem): number {
		switch (item.type) {
			case "struggle":
			case "event":
				return 9;
			case "lesson":
			case "decision":
				return 8;
			case "pattern":
				return 7;
			case "preference":
				return 6;
			default:
				return 5;
		}
	}

	private mapExtractedItemToSemanticType(item: ExtractedItem): SemanticMemory["semanticType"] {
		switch (item.type) {
			case "lesson":
				return "lesson";
			case "preference":
				return "preference";
			case "decision":
				return "decision";
			case "pattern":
				return "pattern";
			case "struggle":
				return "struggle";
			case "event":
				return "event";
			default:
				return "fact";
		}
	}

	private upsertSemanticFromExtractedItem(semantic: SemanticMemory[], item: ExtractedItem, project: string): void {
		if (item.type === "retract") return;
		const detail = filterPII(item.detail || item.content || "");
		const name = item.name || detail.slice(0, 30) || item.summary || "memory";
		const summary = item.summary || detail.slice(0, 150) || name;
		const semanticType = this.mapExtractedItemToSemanticType(item);
		const tags = extractTags(`${name} ${summary} ${detail}`);
		const now = new Date().toISOString();
		const existing = semantic.find(
			(entry) =>
				entry.semanticType === semanticType &&
				entry.scope?.project === project &&
				(tagOverlap(entry.tags, tags) >= 0.72 ||
					`${entry.name} ${entry.summary}`.trim().toLowerCase() === `${name} ${summary}`.trim().toLowerCase()),
		);
		if (existing) {
			existing.name = name;
			existing.summary = summary;
			existing.detail = detail || existing.detail;
			existing.tags = [...new Set(tags)];
			existing.updatedAt = now;
			existing.retention = this.inferSemanticRetention(item);
			existing.stability = this.inferSemanticStability(item);
			existing.salience = Math.max(existing.salience, this.inferSemanticImportance(item));
			existing.importance = Math.max(existing.importance, this.inferSemanticImportance(item));
			return;
		}

		semantic.push({
			id: `semantic:extract:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			kind: "semantic",
			semanticType,
			name,
			summary,
			detail,
			accessCount: 0,
			importance: this.inferSemanticImportance(item),
			salience: Math.max(4, this.inferSemanticImportance(item)),
			confidence: 0.8,
			retention: this.inferSemanticRetention(item),
			stability: this.inferSemanticStability(item),
			tags,
			evidence: [],
			scope: { ...this.cfg.defaultScope, project },
			createdAt: now,
			updatedAt: now,
			abstractionLevel: semanticType === "event" ? "instance" : "generalization",
			structuralAnchor: this.currentStructuralAnchor(),
		});
	}

	private semanticKindToLegacyType(kind: SemanticMemory["semanticType"]): MemoryEntry["type"] {
		switch (kind) {
			case "lesson":
				return "lesson";
			case "preference":
				return "preference";
			case "decision":
				return "decision";
			case "event":
				return "event";
			case "pattern":
				return "pattern";
			case "struggle":
				return "struggle";
			default:
				return "fact";
		}
	}

	private semanticToRuntimeEntry(entry: SemanticMemory): MemoryEntry {
		const type = this.semanticKindToLegacyType(entry.semanticType);
		return {
			id: entry.id,
			type,
			name: entry.name,
			summary: entry.summary,
			detail: entry.detail,
			content: entry.detail || entry.summary,
			tags: entry.tags,
			project: entry.scope?.project || "default",
			importance: entry.importance,
			strength: undefined,
			created: entry.createdAt,
			eventTime: entry.validFrom ?? entry.createdAt,
			lastAccessed: entry.lastAccessedAt,
			accessCount: entry.accessCount,
			relatedIds: [...new Set([...(entry.supersedesIds ?? []), ...(entry.conflictWithIds ?? [])])],
			scope: entry.scope,
			retention: entry.retention === "ambient" ? "ambient" : entry.retention === "core" ? "core" : "key-event",
			salience: entry.salience,
			stability: entry.stability === "volatile" ? "situational" : entry.stability === "stable" ? "stable" : "situational",
		};
	}

	private proceduralToRuntimeEntry(entry: ProceduralMemory): MemoryEntry {
		return {
			id: entry.id,
			type: "decision",
			name: entry.name,
			summary: entry.summary,
			detail: [entry.contextText, entry.boundaries, entry.steps.map((step) => step.text).join("\n")].filter(Boolean).join("\n"),
			content: entry.summary,
			tags: entry.tags,
			project: entry.scope?.project || "default",
			importance: entry.importance,
			strength: undefined,
			created: entry.createdAt,
			eventTime: entry.validFrom ?? entry.createdAt,
			lastAccessed: entry.lastAccessedAt,
			accessCount: entry.accessCount,
			relatedIds: entry.supersedesIds,
			scope: entry.scope,
			retention: entry.retention === "ambient" ? "ambient" : entry.retention === "core" ? "core" : "key-event",
			salience: entry.salience,
			stability: entry.stability === "volatile" ? "situational" : entry.stability === "stable" ? "stable" : "situational",
		};
	}

	private async buildRuntimeMemoryView(): Promise<{
		knowledge: MemoryEntry[];
		lessons: MemoryEntry[];
		events: MemoryEntry[];
		preferences: MemoryEntry[];
		facets: MemoryEntry[];
		work: WorkEntry[];
		episodes: Episode[];
		meta: Meta;
		v2SearchEntries: MemoryEntry[];
	}> {
		const [legacy, work, episodes, meta, semantic, procedural] = await Promise.all([
			this.exportAll(),
			this.getAllWork(),
			this.getAllEpisodes(),
			loadMeta(this.metaPath),
			loadV2Semantic(this.v2Paths),
			loadV2Procedural(this.v2Paths),
		]);
		const cleanSemantic = semantic.filter((entry) => !entry.archivedAt && !entry.supersededById);
		const cleanProcedural = procedural.filter((entry) => !entry.archivedAt && entry.status !== "deprecated");
		const semanticEntries = cleanSemantic.map((entry) => this.semanticToRuntimeEntry(entry));
		const proceduralEntries = cleanProcedural.map((entry) => this.proceduralToRuntimeEntry(entry));
		const v2SignalCount = semanticEntries.length + proceduralEntries.length;
		const useLegacyFallback = v2SignalCount === 0;

		const byType = (entries: MemoryEntry[], type: MemoryEntry["type"]) => entries.filter((entry) => entry.type === type);
		const runtimeEntries = [...semanticEntries, ...proceduralEntries];

		return {
			knowledge: useLegacyFallback ? legacy.knowledge : byType(runtimeEntries, "fact").filter((entry) => entry.type === "fact"),
			lessons: useLegacyFallback ? legacy.lessons : byType(runtimeEntries, "lesson"),
			events: useLegacyFallback ? legacy.events : byType(runtimeEntries, "event"),
			preferences: useLegacyFallback ? legacy.preferences : byType(runtimeEntries, "preference"),
			facets: legacy.facets,
			work,
			episodes,
			meta,
			v2SearchEntries: runtimeEntries,
		};
	}

	private getWorkArchiveReason(entry: WorkEntry): string | undefined {
		if (entry.archivedAt) return entry.archiveReason ?? "pre-archived";
		if (entry.revivedAt && daysSince(entry.revivedAt) <= this.cfg.forgetting.reviveCooldownDays) return undefined;
		const anchor = entry.lastAccessed ?? entry.eventTime ?? entry.created;
		const ageDays = daysSince(anchor);
		if ((entry.accessCount ?? 0) <= 1 && entry.importance <= 6 && ageDays > this.cfg.forgetting.workTtlDays) {
			return "stale-work-memory";
		}
		return undefined;
	}

	private getSemanticArchiveReason(entry: SemanticMemory): string | undefined {
		if (entry.archivedAt) return entry.archiveReason ?? "pre-archived";
		if (entry.revivedAt && daysSince(entry.revivedAt) <= this.cfg.forgetting.reviveCooldownDays) return undefined;
		const anchor = entry.lastAccessedAt ?? entry.updatedAt ?? entry.createdAt;
		const ageDays = daysSince(anchor);
		if (entry.supersededById && ageDays > this.cfg.forgetting.ambientTtlDays) {
			return "superseded-semantic-memory";
		}
		const lowSignal = (entry.accessCount ?? 0) <= 1 && entry.importance <= 6 && entry.confidence < 0.85;
		if (entry.retention === "ambient" && lowSignal && ageDays > this.cfg.forgetting.ambientTtlDays * 2) {
			return "stale-semantic-memory";
		}
		return undefined;
	}

	private getProceduralArchiveReason(entry: ProceduralMemory): string | undefined {
		if (entry.archivedAt) return entry.archiveReason ?? "pre-archived";
		if (entry.revivedAt && daysSince(entry.revivedAt) <= this.cfg.forgetting.reviveCooldownDays) return undefined;
		const anchor = entry.lastAccessedAt ?? entry.updatedAt ?? entry.createdAt;
		const ageDays = daysSince(anchor);
		if ((entry.status === "superseded" || entry.status === "deprecated") && ageDays > this.cfg.forgetting.ambientTtlDays) {
			return "stale-procedure-version";
		}
		if (entry.status === "draft" && (entry.accessCount ?? 0) <= 1 && entry.importance <= 6 && ageDays > this.cfg.forgetting.ambientTtlDays * 2) {
			return "abandoned-draft-procedure";
		}
		return undefined;
	}

	private buildProceduralChains(entries: ProceduralMemory[]): Array<{
		rootId: string;
		name: string;
		status: ProceduralMemory["status"];
		versionDepth: number;
		ids: string[];
	}> {
		const byId = new Map(entries.map((entry) => [entry.id, entry]));
		const roots = entries.filter((entry) => !entry.supersededById || !byId.has(entry.supersededById));
		return roots
				.map((root) => {
				const ids = new Set<string>();
				const stack = [root.id];
				while (stack.length) {
					const currentId = stack.pop();
					if (!currentId || ids.has(currentId)) continue;
					ids.add(currentId);
					for (const entry of entries) {
						if (entry.supersededById === currentId) stack.push(entry.id);
						if (entry.supersedesIds?.includes(currentId)) stack.push(entry.id);
					}
				}
				const chainEntries = [...ids].map((id) => byId.get(id)).filter((entry): entry is ProceduralMemory => Boolean(entry));
				return {
					rootId: root.id,
					name: root.name,
					status: root.status,
					versionDepth: chainEntries.length,
					ids: chainEntries
						.sort((a, b) => {
							const aVersion = a.version ?? 0;
							const bVersion = b.version ?? 0;
							if (aVersion !== bVersion) return bVersion - aVersion;
							return a.updatedAt.localeCompare(b.updatedAt);
						})
						.map((entry) => entry.id),
					};
				})
				.filter((chain) => chain.versionDepth > 1)
			.sort((a, b) => b.versionDepth - a.versionDepth || a.name.localeCompare(b.name));
	}

	private materializeV2Links(
		semantic: SemanticMemory[],
		procedural: ProceduralMemory[],
		existingLinks: MemoryLink[],
		now = new Date().toISOString(),
	): MemoryLink[] {
		const manualLinks = existingLinks.filter((link) => !link.id.startsWith(NanoMemEngine.AUTO_V2_LINK_PREFIX));
		const autoLinks = new Map<string, MemoryLink>();
		const proceduralConflicts = this.detectProceduralConflicts(
			procedural.filter((entry) => entry.status !== "deprecated" && entry.status !== "superseded"),
		);
		const semanticConflicts = this.detectSemanticConflicts(semantic);

		const addAutoLink = (
			fromId: string,
			toId: string,
			type: MemoryLink["type"],
			weight: number,
			evidence: MemoryLink["evidence"] = [],
		): void => {
			if (!fromId || !toId || fromId === toId) return;
			const directional = type === "supersedes";
			const [normalizedFrom, normalizedTo] = directional || fromId < toId ? [fromId, toId] : [toId, fromId];
			const id = `${NanoMemEngine.AUTO_V2_LINK_PREFIX}${type}:${normalizedFrom}->${normalizedTo}`;
			autoLinks.set(id, {
				id,
				fromId: normalizedFrom,
				toId: normalizedTo,
				type,
				weight,
				explicit: false,
				createdAt: autoLinks.get(id)?.createdAt ?? now,
				updatedAt: now,
				evidence,
			});
		};

		for (const entry of semantic) {
			for (const supersededId of entry.supersedesIds ?? []) {
				addAutoLink(entry.id, supersededId, "supersedes", 0.92);
			}
			if (entry.supersededById) {
				addAutoLink(entry.supersededById, entry.id, "supersedes", 0.92);
			}
		}

		for (const entry of procedural) {
			for (const supersededId of entry.supersedesIds ?? []) {
				addAutoLink(entry.id, supersededId, "supersedes", 0.94);
			}
			if (entry.supersededById) {
				addAutoLink(entry.supersededById, entry.id, "supersedes", 0.94);
			}
		}

		for (const conflict of semanticConflicts) {
			addAutoLink(conflict.aId, conflict.bId, "conflicts-with", 0.88);
		}

		for (const conflict of proceduralConflicts) {
			addAutoLink(conflict.aId, conflict.bId, "conflicts-with", Math.max(0.72, conflict.score));
		}

		return [...manualLinks, ...autoLinks.values()].sort((a, b) => a.id.localeCompare(b.id));
	}

	private detectProceduralConflicts(entries: ProceduralMemory[]): Array<{
		aId: string;
		bId: string;
		aName: string;
		bName: string;
		score: number;
		reason: string;
	}> {
		const conflicts: Array<{
			aId: string;
			bId: string;
			aName: string;
			bName: string;
			score: number;
			reason: string;
		}> = [];
		for (let i = 0; i < entries.length; i++) {
			for (let j = i + 1; j < entries.length; j++) {
				const a = entries[i];
				const b = entries[j];
				if (!a || !b || a.id === b.id) continue;
				const tagScore = tagOverlap(a.tags ?? [], b.tags ?? []);
				const lexicalScore = tagOverlap(
					extractTags(`${a.name} ${a.searchText} ${a.summary}`),
					extractTags(`${b.name} ${b.searchText} ${b.summary}`),
				);
				const similarity = Math.max(tagScore, lexicalScore);
				const sameIntent =
					a.searchText.trim().toLowerCase() === b.searchText.trim().toLowerCase() ||
					a.name.trim().toLowerCase() === b.name.trim().toLowerCase();
				const boundariesDiffer =
					(a.boundaries ?? "").trim().toLowerCase() !== (b.boundaries ?? "").trim().toLowerCase() ||
					(a.contextText ?? "").trim().toLowerCase() !== (b.contextText ?? "").trim().toLowerCase();
				if ((similarity >= 0.72 || sameIntent) && boundariesDiffer) {
					conflicts.push({
						aId: a.id,
						bId: b.id,
						aName: a.name,
						bName: b.name,
						score: Number(similarity.toFixed(3)),
						reason: "High-overlap active procedures differ in boundaries or context.",
					});
				}
			}
		}
		return conflicts.sort((a, b) => b.score - a.score || a.aName.localeCompare(b.aName));
	}

	private detectSemanticConflicts(entries: SemanticMemory[]): Array<{
		aId: string;
		bId: string;
		aName: string;
		bName: string;
		reason: string;
	}> {
		const byId = new Map(entries.map((entry) => [entry.id, entry]));
		const seen = new Set<string>();
		const conflicts: Array<{
			aId: string;
			bId: string;
			aName: string;
			bName: string;
			reason: string;
		}> = [];
		for (const entry of entries) {
			for (const conflictId of entry.conflictWithIds ?? []) {
				const other = byId.get(conflictId);
				if (!other) continue;
				const pairKey = [entry.id, other.id].sort().join("::");
				if (seen.has(pairKey)) continue;
				seen.add(pairKey);
				conflicts.push({
					aId: entry.id,
					bId: other.id,
					aName: entry.name,
					bName: other.name,
					reason: "Explicit semantic conflict link.",
				});
			}
		}
		return conflicts.sort((a, b) => a.aName.localeCompare(b.aName) || a.bName.localeCompare(b.bName));
	}

	private buildEmbeddingSourceItems(
		episodes: EpisodeMemory[],
		facets: EpisodeFacet[],
		semantic: SemanticMemory[],
		procedural: ProceduralMemory[],
	): EmbeddingSourceItem[] {
		const episodeItems: EmbeddingSourceItem[] = episodes.map((entry) => ({
			memoryId: entry.id,
			memoryKind: "episode",
			text: [entry.title ?? "", entry.summary, entry.userGoal ?? "", entry.outcome ?? ""].filter(Boolean).join("\n"),
		}));
		const facetItems: EmbeddingSourceItem[] = facets.map((entry) => ({
			memoryId: entry.id,
			memoryKind: "facet",
			text: [entry.searchText, entry.summary ?? "", entry.anchorText ?? "", entry.detail ?? ""].filter(Boolean).join("\n"),
		}));
		const semanticItems: EmbeddingSourceItem[] = semantic.map((entry) => ({
			memoryId: entry.id,
			memoryKind: "semantic",
			text: [entry.name, entry.summary, entry.detail ?? ""].filter(Boolean).join("\n"),
		}));
		const proceduralItems: EmbeddingSourceItem[] = procedural.map((entry) => ({
			memoryId: entry.id,
			memoryKind: "procedural",
			text: [
				entry.name,
				entry.searchText,
				entry.summary,
				entry.contextText ?? "",
				entry.boundaries ?? "",
				entry.steps.map((step) => step.text).join("\n"),
			]
				.filter(Boolean)
				.join("\n"),
		}));
		return [...episodeItems, ...facetItems, ...semanticItems, ...proceduralItems];
	}

	private async querySemanticCandidates(
		queryText: string,
		project: string,
		scope: MemoryScope | undefined,
		episodes: EpisodeMemory[],
		facets: EpisodeFacet[],
		semantic: SemanticMemory[],
		procedural: ProceduralMemory[],
	): Promise<Array<{ memoryId: string; memoryKind: "episode" | "facet" | "semantic" | "procedural"; score: number }>> {
		if (!this.embeddingFn || !queryText.trim()) return [];
		const items = this.buildEmbeddingSourceItems(episodes, facets, semantic, procedural);
		if (!items.length) return [];
		await syncEmbeddingIndex(this.cfg.memoryDir, this.cfg.embeddings.model, items, this.embeddingFn);
		const matches = await queryEmbeddingIndex(this.cfg.memoryDir, this.cfg.embeddings.model, queryText, this.embeddingFn, 12);
		const visibleIds = new Set([
			...episodes.map((entry) => entry.id),
			...facets.map((entry) => entry.id),
			...semantic.map((entry) => entry.id),
			...procedural.map((entry) => entry.id),
		]);
		return matches
			.filter((match) => visibleIds.has(match.memoryId))
			.map((match) => ({ memoryId: match.memoryId, memoryKind: match.memoryKind, score: match.score }))
			.filter((match) => match.score >= 0.18);
	}

	private currentStructuralAnchor = currentStructuralAnchor;
	private computeStructuralBoost = computeStructuralBoost;
	private scoreEpisodeMemory(entry: EpisodeMemory, project: string, contextTags: string[]): number {
		return scoreEpisodeMemoryFn(entry, project, contextTags, this.cfg.structuralWeight);
	}
	private scoreEpisodeFacet(entry: EpisodeFacet, project: string, contextTags: string[]): number {
		return scoreEpisodeFacetFn(entry, project, contextTags, this.cfg.structuralWeight);
	}
	private scoreV2SemanticMemory(entry: SemanticMemory, project: string, contextTags: string[]): number {
		return scoreV2SemanticMemoryFn(entry, project, contextTags, this.cfg.structuralWeight);
	}
	private scoreProceduralMemory(entry: ProceduralMemory, project: string, contextTags: string[]): number {
		return scoreProceduralMemoryFn(entry, project, contextTags, this.cfg.structuralWeight);
	}

	private async reinforceEntries(recalled: MemoryEntry[], all: MemoryEntry[], savePath: string): Promise<void> {
		const ids = new Set(recalled.map((e) => e.id));
		const now = new Date().toISOString();
		for (const entry of all) {
			if (ids.has(entry.id)) {
				entry.accessCount = (entry.accessCount ?? 0) + 1;
				entry.lastAccessed = now;
				entry.strength = (entry.strength || 30) * this.cfg.strengthGrowthFactor;
			}
		}
		reinforceRelations(recalled, all);
		const pathConfig = this.getMemoryPathConfigs().find((config) => config.path === savePath);
		await this.persistEntries(savePath, all, pathConfig?.max ?? this.cfg.maxEntries.knowledge);
	}

	private async reinforceProcedural(recalled: ProceduralMemory[], all: ProceduralMemory[]): Promise<void> {
		if (!recalled.length) return;
		const ids = new Set(recalled.map((entry) => entry.id));
		const now = new Date().toISOString();
		for (const entry of all) {
			if (!ids.has(entry.id)) continue;
			entry.accessCount = (entry.accessCount ?? 0) + 1;
			entry.lastAccessedAt = now;
			entry.updatedAt = entry.updatedAt || now;
		}
		await saveV2Procedural(this.v2Paths, all);
	}

	private async reinforceEpisodeMemories(recalled: EpisodeMemory[], all: EpisodeMemory[]): Promise<void> {
		if (!recalled.length) return;
		const ids = new Set(recalled.map((entry) => entry.id));
		const now = new Date().toISOString();
		for (const entry of all) {
			if (!ids.has(entry.id)) continue;
			entry.accessCount = (entry.accessCount ?? 0) + 1;
			entry.lastAccessedAt = now;
			entry.updatedAt = entry.updatedAt || now;
		}
		await saveV2Episodes(this.v2Paths, all);
	}

	private async reinforceEpisodeFacets(recalled: EpisodeFacet[], all: EpisodeFacet[]): Promise<void> {
		if (!recalled.length) return;
		const ids = new Set(recalled.map((entry) => entry.id));
		const now = new Date().toISOString();
		for (const entry of all) {
			if (!ids.has(entry.id)) continue;
			entry.accessCount = (entry.accessCount ?? 0) + 1;
			entry.lastAccessedAt = now;
			entry.updatedAt = entry.updatedAt || now;
		}
		await saveV2Facets(this.v2Paths, all);
	}

	private async reinforceV2SemanticMemories(recalled: SemanticMemory[], all: SemanticMemory[]): Promise<void> {
		if (!recalled.length) return;
		const ids = new Set(recalled.map((entry) => entry.id));
		const now = new Date().toISOString();
		for (const entry of all) {
			if (!ids.has(entry.id)) continue;
			entry.accessCount = (entry.accessCount ?? 0) + 1;
			entry.lastAccessedAt = now;
			entry.updatedAt = entry.updatedAt || now;
		}
		await saveV2Semantic(this.v2Paths, all);
	}

	private async reconsolidateV2AfterRecall(
		episodes: EpisodeMemory[],
		facets: EpisodeFacet[],
		procedural: ProceduralMemory[],
		recalledEpisodes: EpisodeMemory[],
		recalledFacets: EpisodeFacet[],
		recalledProcedural: ProceduralMemory[],
	): Promise<void> {
		const reconsolidated = reconsolidateV2Memories(
			episodes,
			facets,
			procedural,
			recalledEpisodes.map((entry) => entry.id),
			recalledFacets.map((entry) => entry.id),
			recalledProcedural.map((entry) => entry.id),
		);
		await Promise.all([
			saveV2Episodes(this.v2Paths, reconsolidated.episodes),
			saveV2Facets(this.v2Paths, reconsolidated.facets),
			saveV2Procedural(this.v2Paths, reconsolidated.procedural),
			saveV2Meta(this.v2Paths, {
				...(await loadV2Meta(this.v2Paths)),
				lastReconsolidationAt: new Date().toISOString(),
			}),
		]);
		await this.rebuildV2Links();
	}

	private detectAlignmentConflicts(
		entries: MemoryEntry[],
	): Array<{
		aId: string;
		bId: string;
		reason: string;
		severity: number;
		recommendation: "merge" | "demote" | "forget" | "mark-situational";
		rationale: string;
	}> {
		const candidates = entries.filter(
			(entry) =>
				entry.stability !== "situational" &&
				(entry.retention === "core" || entry.retention === "key-event") &&
				!!(entry.summary || entry.detail || entry.name),
		);
		const conflicts: Array<{
			aId: string;
			bId: string;
			reason: string;
			severity: number;
			recommendation: "merge" | "demote" | "forget" | "mark-situational";
			rationale: string;
		}> = [];
		const seen = new Set<string>();
		const positiveMarkers = ["prefer", "always", "use", "enable", "include", "like", "keep", "should"];
		const negativeMarkers = ["avoid", "never", "disable", "remove", "dislike", "hate", "stop", "do not", "don't"];
		const getText = (entry: MemoryEntry) =>
			`${entry.name || ""} ${entry.summary || ""} ${entry.detail || ""}`.toLowerCase();
		const polarity = (text: string): "positive" | "negative" | "neutral" => {
			const hasPositive = positiveMarkers.some((marker) => text.includes(marker));
			const hasNegative = negativeMarkers.some((marker) => text.includes(marker));
			if (hasPositive && !hasNegative) return "positive";
			if (hasNegative && !hasPositive) return "negative";
			return "neutral";
		};

		for (let i = 0; i < candidates.length; i++) {
			for (let j = i + 1; j < candidates.length; j++) {
				const a = candidates[i]!;
				const b = candidates[j]!;
				if (a.id === b.id) continue;
				const overlap = tagOverlap(a.tags, b.tags);
				if (overlap < 0.45) continue;
				const aPolarity = polarity(getText(a));
				const bPolarity = polarity(getText(b));
				if (aPolarity === "neutral" || bPolarity === "neutral" || aPolarity === bPolarity) continue;
				const pairKey = [a.id, b.id].sort().join(":");
				if (seen.has(pairKey)) continue;
				seen.add(pairKey);
				const severity = Math.min(
					1,
					overlap * 0.6 + ((a.salience ?? a.importance) + (b.salience ?? b.importance)) / 20 * 0.4,
				);
				const reason = `Potential conflict on shared context: ${aPolarity} vs ${bPolarity}`;
				const recommendation = this.suggestConflictAction(a, b, severity);
				const rationale = this.explainConflictAction(a, b, recommendation);
				conflicts.push({ aId: a.id, bId: b.id, reason, severity, recommendation, rationale });
			}
		}

		return conflicts.sort((a, b) => b.severity - a.severity);
	}

	private suggestConflictAction(
		a: MemoryEntry,
		b: MemoryEntry,
		severity: number,
	): "merge" | "demote" | "forget" | "mark-situational" {
		const aStable = a.stability !== "situational";
		const bStable = b.stability !== "situational";
		const aRecent = daysSince(a.created) <= 14;
		const bRecent = daysSince(b.created) <= 14;
		const aLowSignal = (a.salience ?? a.importance) <= 4;
		const bLowSignal = (b.salience ?? b.importance) <= 4;

		if (aStable !== bStable) return "mark-situational";
		if (severity >= 0.8 && (aLowSignal || bLowSignal)) return "forget";
		if (severity >= 0.65 && (aRecent || bRecent)) return "demote";
		return "merge";
	}

	private explainConflictAction(
		a: MemoryEntry,
		b: MemoryEntry,
		action: "merge" | "demote" | "forget" | "mark-situational",
	): string {
		switch (action) {
			case "mark-situational":
				return "One side looks more temporary than the other, so this conflict likely comes from short-term context rather than true identity drift.";
			case "forget":
				return "One side has weak signal compared with the conflict risk, so forgetting the weaker memory is safer than keeping both.";
			case "demote":
				return "At least one side is recent enough that it may be an overfit; demoting it reduces the chance of personality drift.";
			default:
				return "Both memories may describe the same preference from different angles, so a merged memory is likely safer than keeping them separate.";
		}
	}

	private async reinforceWork(recalled: WorkEntry[], all: WorkEntry[]): Promise<void> {
		const ids = new Set(recalled.map((w) => w.id));
		const now = new Date().toISOString();
		for (const w of all) {
			if (ids.has(w.id)) {
				w.accessCount = (w.accessCount ?? 0) + 1;
				w.lastAccessed = now;
				w.strength = (w.strength || 45) * this.cfg.strengthGrowthFactor;
			}
		}
		await saveWork(this.workPath, all, this.cfg.maxEntries.work, (w) =>
			utilityWork(w, this.cfg.halfLife, this.cfg.evictionWeights),
		);
	}

	private async reconsolidateIfNeeded(
		recalled: MemoryEntry[],
		contextTags: string[],
		_allEntries: MemoryEntry[],
	): Promise<void> {
		if (!this.llmFn) return;
		const p = PROMPTS[this.cfg.locale];
		for (const entry of recalled) {
			const overlap = tagOverlap(entry.tags, contextTags);
			if (overlap >= 0.3) continue;
			try {
				const memText = entry.detail || entry.summary || entry.content || "";
				const updated = await this.llmFn(
					p.reconsolidationSystem,
					`Original memory: ${memText}\n\nCurrent context tags: ${contextTags.join(", ")}`,
				);
				if (updated && updated.length > 10) {
					const trimmed = updated.trim();
					entry.detail = trimmed;
					entry.content = trimmed;
					entry.summary = trimmed.length <= 150 ? trimmed : `${trimmed.slice(0, 147)}...`;
					entry.tags = extractTags(trimmed);
				}
			} catch {
				/* graceful degradation */
			}
		}
	}

	private buildProgressiveInjectionText(
		active: {
			knowledge: MemoryEntry[];
			lessons: MemoryEntry[];
			events: MemoryEntry[];
			preferences: MemoryEntry[];
			facets: MemoryEntry[];
			episodeMemories: EpisodeMemory[];
			episodeFacets: EpisodeFacet[];
			semanticMemories: SemanticMemory[];
			procedural: ProceduralMemory[];
		},
		cue: {
			knowledge: MemoryEntry[];
			lessons: MemoryEntry[];
			events: MemoryEntry[];
			preferences: MemoryEntry[];
			facets: MemoryEntry[];
			episodes: Episode[];
			work: WorkEntry[];
			episodeMemories: EpisodeMemory[];
			episodeFacets: EpisodeFacet[];
			semanticMemories: SemanticMemory[];
			procedural: ProceduralMemory[];
		},
		allEntries: MemoryEntry[],
		graphContext: GraphNeighbor[],
		p: PromptSet,
	): string {
		const sections: string[] = [];
		const proceduralSectionTitle = "Procedures";
		const episodicSectionTitle = "Episode Threads";
		const semanticSectionTitle = "Semantic Abstractions";

		// ── Active tier: full detail ──
		const activeLines: string[] = [];
		const conversationPreferenceLines: string[] = [];
		const keyEventLines: string[] = [];
		const stateLines: string[] = [];

		const formatActiveEntry = (e: MemoryEntry): string => {
			const related = getGraphContextSummaries(e, allEntries, 3);
			const suffix = related.length ? ` [→ ${related.join("; ")}]` : "";
			return `- [ID: ${e.id}] **${e.name || "—"}**: ${e.summary || ""}\n  ${e.detail || ""}${suffix}`;
		};

		const formatActiveEvent = (e: MemoryEntry): string => {
			const related = getGraphContextSummaries(e, allEntries, 4);
			const outcome = e.eventData?.outcome ? `\n  Outcome: ${e.eventData.outcome}` : "";
			const suffix = related.length ? ` [→ ${related.join("; ")}]` : "";
			return `- [ID: ${e.id}] **${e.name || "—"}**: ${e.summary || ""}\n  ${e.detail || ""}${outcome}${suffix}`;
		};

		const formatActiveFacet = (e: MemoryEntry): string => {
			if (e.facetData?.kind === "pattern") {
				return `- [ID: ${e.id}] **${e.name || "—"}**: When ${e.facetData.trigger} → ${e.facetData.behavior}\n  ${e.detail || ""}`;
			}
			if (e.facetData?.kind === "struggle") {
				return `- [ID: ${e.id}] **${e.name || "—"}**: ${e.facetData.problem}\n  Tried: ${e.facetData.attempts.join(", ")} | Solved: ${e.facetData.solution}\n  ${e.detail || ""}`;
			}
			return formatActiveEntry(e);
		};

		const pushActiveEntry = (entry: MemoryEntry) => {
			if (this.isConversationPreference(entry)) {
				conversationPreferenceLines.push(formatActiveEntry(entry));
				return;
			}
			if (entry.stability === "situational" || entry.stateData) {
				const mood = entry.stateData?.mood ? ` (${entry.stateData.mood})` : "";
				stateLines.push(`- [ID: ${entry.id}] **${entry.name || "Unknown"}**${mood}: ${entry.summary || ""}`);
				return;
			}
			activeLines.push(formatActiveEntry(entry));
		};

		for (const e of active.lessons) pushActiveEntry(e);
		for (const e of active.knowledge) pushActiveEntry(e);
		for (const e of active.preferences) pushActiveEntry(e);
		for (const e of active.facets) activeLines.push(formatActiveFacet(e));
		for (const e of active.events) keyEventLines.push(formatActiveEvent(e));
		const episodicLines = active.episodeMemories.map((entry) => {
			const goal = entry.userGoal ? ` | Goal: ${entry.userGoal}` : "";
			const outcome = entry.outcome ? ` | Outcome: ${entry.outcome}` : "";
			return `- [ID: ${entry.id}] **${entry.title || "Episode"}**: ${entry.summary}${goal}${outcome}`;
		});
		const episodicFacetLines = active.episodeFacets.map((entry) => {
			const detail = entry.anchorText ? `\n  ${entry.anchorText}` : "";
			return `- [ID: ${entry.id}] [${entry.facetType}] **${entry.searchText}**${detail}`;
		});
		const semanticLines = active.semanticMemories.map((entry) => {
			const detail = entry.detail ? `\n  ${entry.detail}` : "";
			return `- [ID: ${entry.id}] [${entry.semanticType}] **${entry.name}**: ${entry.summary}${detail}`;
		});
		const proceduralLines = active.procedural.map((entry) => {
			const steps = entry.steps.slice(0, 4).map((step, index) => `${index + 1}. ${step.text}`).join("\n  ");
			const boundaries = entry.boundaries ? `\n  Boundaries: ${entry.boundaries}` : "";
			return `- [ID: ${entry.id}] **${entry.name}**: ${entry.summary}\n  ${steps}${boundaries}`;
		});

		if (conversationPreferenceLines.length) {
			sections.push(`### ${p.sectionConversationPreferences}\n${conversationPreferenceLines.join("\n")}`);
		}
		if (activeLines.length) {
			sections.push(`### ${p.sectionActiveMemories}\n${activeLines.join("\n")}`);
		}
		if (episodicLines.length || episodicFacetLines.length) {
			sections.push(`### ${episodicSectionTitle}\n${[...episodicLines, ...episodicFacetLines].join("\n")}`);
		}
		if (semanticLines.length) {
			sections.push(`### ${semanticSectionTitle}\n${semanticLines.join("\n")}`);
		}
		if (proceduralLines.length) {
			sections.push(`### ${proceduralSectionTitle}\n${proceduralLines.join("\n")}`);
		}
		if (keyEventLines.length) {
			sections.push(`### ${p.sectionKeyEvents ?? "Key Events"}\n${keyEventLines.join("\n")}`);
		}
		if (stateLines.length) {
			sections.push(`### ${p.sectionCurrentState ?? "Current State Signals"}\n${stateLines.join("\n")}`);
		}

		const relatedLines = graphContext.map(
			(neighbor) =>
				`- [${neighbor.relation}] [ID: ${neighbor.entry.id}] [${neighbor.entry.type}] **${
					neighbor.entry.name || "Unknown"
				}**: ${neighbor.entry.summary || ""}`,
		);
		if (relatedLines.length) {
			sections.push(`### ${p.sectionRelatedContext ?? "Related Context"}\n${relatedLines.join("\n")}`);
		}

		// ── Cue tier: name + summary + id ──
		const cueLines: string[] = [];

		const formatCueEntry = (e: MemoryEntry): string =>
			`- [ID: ${e.id}] [${e.type}] **${e.name || "—"}**: ${e.summary || ""}`;

		const formatCueFacet = (e: MemoryEntry): string => {
			if (e.facetData?.kind === "pattern") {
				return `- [ID: ${e.id}] [pattern] **${e.name || "—"}**: When ${e.facetData.trigger} → ${e.facetData.behavior}`;
			}
			if (e.facetData?.kind === "struggle") {
				return `- [ID: ${e.id}] [struggle] **${e.name || "—"}**: ${e.facetData.problem}`;
			}
			return formatCueEntry(e);
		};

		const formatCueEvent = (e: MemoryEntry): string =>
			`- [ID: ${e.id}] [event] **${e.name || "—"}**: ${e.summary || ""}`;

		for (const e of cue.lessons) cueLines.push(formatCueEntry(e));
		for (const e of cue.knowledge) cueLines.push(formatCueEntry(e));
		for (const e of cue.events) cueLines.push(formatCueEvent(e));
		for (const e of cue.preferences) cueLines.push(formatCueEntry(e));
		for (const e of cue.facets) cueLines.push(formatCueFacet(e));
		for (const episode of cue.episodeMemories) {
			cueLines.push(`- [ID: ${episode.id}] [episode] **${episode.title || "Episode"}**: ${episode.summary}`);
		}
		for (const facet of cue.episodeFacets) {
			cueLines.push(`- [ID: ${facet.id}] [episode-${facet.facetType}] **${facet.searchText}**: ${facet.summary || facet.anchorText || ""}`);
		}
		for (const semantic of cue.semanticMemories) {
			cueLines.push(`- [ID: ${semantic.id}] [semantic-${semantic.semanticType}] **${semantic.name}**: ${semantic.summary}`);
		}
		for (const procedure of cue.procedural) {
			cueLines.push(`- [ID: ${procedure.id}] [procedural] **${procedure.name}**: ${procedure.summary}`);
		}

		// Episodes in cue layer (no ID-based recall)
		for (const ep of cue.episodes) {
			cueLines.push(
				`- [${ep.date}] ${ep.project}: ${ep.summary}${ep.userGoal ? ` (Goal: ${ep.userGoal})` : ""}`,
			);
		}
		// Work in cue layer
		for (const w of cue.work) {
			cueLines.push(`- [${w.created.slice(0, 10)}] ${w.goal}: ${w.summary}`);
		}

		if (cueLines.length) {
			sections.push(`### ${p.sectionMemoryCues}\n*${p.memoryCueHint}*\n${cueLines.join("\n")}`);
		}

		if (!sections.length) return "";
		const soulStyle = process.env.NANOSOUL_MEMORY_STYLE;
		const behaviorBlock = soulStyle
			? `${p.memoryBehavior}\n\n${soulStyle}`
			: p.memoryBehavior;
		return `## ${p.injectionHeader}\n\n${sections.join("\n\n")}\n\n---\n${behaviorBlock}`;
	}

	private isConversationPreference(entry: MemoryEntry): boolean {
		if (entry.type !== "preference") return false;
		const text = `${entry.name || ""}\n${entry.summary || ""}\n${entry.detail || ""}\n${entry.content || ""}`;
		return NanoMemEngine.CONVERSATION_PREFERENCE_PATTERNS.some((pattern) => pattern.test(text));
	}

	private selectConversationPreferences(entries: MemoryEntry[]): MemoryEntry[] {
		return entries
			.filter((entry) => this.isConversationPreference(entry))
			.filter((entry) => entry.stability !== "situational")
			.sort((a, b) => this.rankConversationPreference(b) - this.rankConversationPreference(a))
			.slice(0, 3);
	}

	private rankConversationPreference(entry: MemoryEntry): number {
		return (entry.salience ?? entry.importance ?? 0) * 10 + (entry.accessCount ?? 0) * 2 - daysSince(entry.created);
	}

	private mergeUniqueEntries(preferred: MemoryEntry[], fallback: MemoryEntry[]): MemoryEntry[] {
		const merged: MemoryEntry[] = [];
		const seen = new Set<string>();
		for (const entry of [...preferred, ...fallback]) {
			if (seen.has(entry.id)) continue;
			seen.add(entry.id);
			merged.push(entry);
		}
		return merged;
	}
}
