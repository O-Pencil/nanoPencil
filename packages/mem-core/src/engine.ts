/**
 * [INPUT]: NanomemConfig, optional LlmFn
 * [OUTPUT]: NanoMemEngine — unified API for memory CRUD, injection, consolidation
 * [POS]: Facade layer — composes store, scoring, eviction, update, linking, privacy, extraction, consolidation
 *
 * Host products create an engine instance and call its methods.
 * No dependency on any specific AI framework — LLM is pluggable.
 */
/**
 * [UPSTREAM]: 
 * [SURFACE]: 
 * [LOCUS]: packages/mem-core/src/engine.ts - 
 * [COVENANT]: Change → update this header
 */

import { join } from "node:path";
import { getConfig, type NanomemConfig } from "./config.js";
import { consolidateEpisodes } from "./consolidation.js";
import { utilityEntry, utilityWork } from "./eviction.js";
import { extractMemories, extractWork } from "./extraction.js";
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
import { applyExtraction, checkConsolidationEntry, checkWorkDuplicate } from "./update.js";

export class NanoMemEngine {
	readonly cfg: NanomemConfig;
	private llmFn?: LlmFn;

	private knowledgePath: string;
	private lessonsPath: string;
	private eventsPath: string;
	private preferencesPath: string;
	private facetsPath: string;
	private workPath: string;
	private metaPath: string;
	private episodesDir: string;

	constructor(overrides?: Partial<NanomemConfig>, llmFn?: LlmFn) {
		this.cfg = getConfig(overrides);
		this.llmFn = llmFn;
		this.knowledgePath = join(this.cfg.memoryDir, "knowledge.json");
		this.lessonsPath = join(this.cfg.memoryDir, "lessons.json");
		this.eventsPath = join(this.cfg.memoryDir, "events.json");
		this.preferencesPath = join(this.cfg.memoryDir, "preferences.json");
		this.facetsPath = join(this.cfg.memoryDir, "facets.json");
		this.workPath = join(this.cfg.memoryDir, "work.json");
		this.metaPath = join(this.cfg.memoryDir, "meta.json");
		this.episodesDir = join(this.cfg.memoryDir, "episodes");
	}

	setLlmFn(fn: LlmFn): void {
		this.llmFn = fn;
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
		}

		const hl = this.cfg.halfLife;
		const ew = this.cfg.evictionWeights;
		await Promise.all([
			saveEntries(this.knowledgePath, knowledge, this.cfg.maxEntries.knowledge, (e) => utilityEntry(e, hl, ew)),
			saveEntries(this.lessonsPath, lessons, this.cfg.maxEntries.lessons, (e) => utilityEntry(e, hl, ew)),
			saveEntries(this.eventsPath, events, this.cfg.maxEntries.events, (e) => utilityEntry(e, hl, ew)),
			saveEntries(this.preferencesPath, prefs, this.cfg.maxEntries.preferences, (e) => utilityEntry(e, hl, ew)),
			saveEntries(this.facetsPath, facets, this.cfg.maxEntries.facets, (e) => utilityEntry(e, hl, ew)),
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
		const [allKnowledge, allLessons, allEvents, allPrefs, allFacets, allEpisodes, allWork] = await Promise.all([
			loadEntries(this.knowledgePath),
			loadEntries(this.lessonsPath),
			loadEntries(this.eventsPath),
			loadEntries(this.preferencesPath),
			loadEntries(this.facetsPath),
			loadEpisodes(this.episodesDir),
			loadWork(this.workPath),
		]);

		const knowledge = this.filterAndCleanEntries(allKnowledge, scope);
		const lessons = this.filterAndCleanEntries(allLessons, scope);
		const events = this.filterAndCleanEntries(allEvents, scope);
		const prefs = this.filterAndCleanEntries(allPrefs, scope);
		const facets = this.filterAndCleanEntries(allFacets, scope);
		const work = this.filterAndCleanWork(allWork, scope);
		const episodes = filterByScope(allEpisodes, scope);

		const hl = this.cfg.halfLife;
		const sw = this.cfg.scoreWeights;
		const pr = this.cfg.progressiveRecall;
		const p = PROMPTS[this.cfg.locale] ?? PROMPTS.en;

		// Tier all MemoryEntry categories
		const tieredKnowledge = tierEntries(knowledge, project, contextTags, hl, sw, pr);
		const tieredLessons = tierEntries(lessons, project, contextTags, hl, sw, pr);
		const tieredEvents = tierEntries(events, project, contextTags, hl, sw, pr);
		const tieredPrefs = tierEntries(prefs, project, contextTags, hl, sw, pr);
		const tieredFacets = tierEntries(facets, project, contextTags, hl, sw, pr);

		// Budget calculation
		const totalChars = this.cfg.tokenBudget * 4;
		const activeChars = Math.floor(totalChars * pr.budgetActive);
		const cueChars = Math.floor(totalChars * pr.budgetCue);

		// Entry length helpers
		const activeLen = (e: MemoryEntry) =>
			(e.name?.length || 0) + (e.summary?.length || 0) + (e.detail?.length || 0) + 30;
		const cueLen = (e: MemoryEntry) => (e.name?.length || 0) + (e.summary?.length || 0) + 30;
		const scoreFn = (e: MemoryEntry) => scoreEntry(e, project, contextTags, hl, sw);

		// Active tier: pick top entries with full detail, split budget across categories
		const activeBudgetPer = Math.floor(activeChars / 5);
		const activeKnowledge = pickTop(tieredKnowledge.active, scoreFn, activeLen, activeBudgetPer);
		const activeLessons = pickTop(tieredLessons.active, scoreFn, activeLen, activeBudgetPer);
		const activeEvents = pickTop(tieredEvents.active, scoreFn, activeLen, activeBudgetPer);
		const activePrefs = pickTop(tieredPrefs.active, scoreFn, activeLen, activeBudgetPer);
		const activeFacets = pickTop(tieredFacets.active, scoreFn, activeLen, activeBudgetPer);

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
		const cuePrefs = pickTop(tieredPrefs.cue, scoreFn, cueLen, cueBudgetPer);
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

		// Reinforce all recalled entries (Active + Cue) via spaced repetition
		const allRecalledKnowledge = [...activeKnowledge, ...dedupedCueKnowledge];
		const allRecalledLessons = [...activeLessons, ...dedupedCueLessons];
		const allRecalledEvents = [...activeEvents, ...dedupedCueEvents];
		const allRecalledPrefs = [...activePrefs, ...dedupedCuePrefs];
		const allRecalledFacets = [...activeFacets, ...dedupedCueFacets];

		await this.reinforceEntries(allRecalledKnowledge, allKnowledge, this.knowledgePath);
		await this.reinforceEntries(allRecalledLessons, allLessons, this.lessonsPath);
		await this.reinforceEntries(allRecalledEvents, allEvents, this.eventsPath);
		await this.reinforceEntries(allRecalledPrefs, allPrefs, this.preferencesPath);
		await this.reinforceEntries(allRecalledFacets, allFacets, this.facetsPath);
		await this.reinforceWork(topWork, allWork);

		// Optional reconsolidation for low-relevance recalled entries
		if (this.llmFn) {
			await this.reconsolidateIfNeeded(allRecalledKnowledge, contextTags, allKnowledge);
			await this.reconsolidateIfNeeded(allRecalledLessons, contextTags, allLessons);
		}

		return this.buildProgressiveInjectionText(
			{
				knowledge: activeKnowledge,
				lessons: activeLessons,
				events: activeEvents,
				preferences: activePrefs,
				facets: activeFacets,
			},
			{
				knowledge: dedupedCueKnowledge,
				lessons: dedupedCueLessons,
				events: dedupedCueEvents,
				preferences: dedupedCuePrefs,
				facets: dedupedCueFacets,
				episodes: topEpisodes,
				work: topWork,
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
		totalSessions: number;
	}> {
		const [knowledge, lessons, events, prefs, facets, episodes, work, meta] = await Promise.all([
			loadEntries(this.knowledgePath),
			loadEntries(this.lessonsPath),
			loadEntries(this.eventsPath),
			loadEntries(this.preferencesPath),
			loadEntries(this.facetsPath),
			loadEpisodes(this.episodesDir),
			loadWork(this.workPath),
			loadMeta(this.metaPath),
		]);
		return {
			knowledge: knowledge.length,
			lessons: lessons.length,
			events: events.length,
			preferences: prefs.length,
			facets: facets.length,
			episodes: episodes.length,
			work: work.length,
			totalSessions: meta.totalSessions,
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

	async getAllWork(): Promise<WorkEntry[]> {
		return loadWork(this.workPath);
	}

	async getAllEpisodes(): Promise<Episode[]> {
		return loadEpisodes(this.episodesDir);
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
		const tags = extractTags(query);
		const { knowledge, lessons, events, preferences, facets } = await this.getAllEntries();
		const all = [...knowledge, ...lessons, ...events, ...preferences, ...facets];
		return filterByScope(all, scope)
			.map((e) => ({
				entry: e,
				score:
					tagOverlap(e.tags, tags) +
					(e.relations ?? [])
						.filter((relation) => tags.some((tag) => relation.kind.includes(tag) || relation.id.includes(tag)))
						.reduce((sum, relation) => sum + relation.weight * 0.12, 0),
			}))
			.filter((x) => x.score > 0)
			.sort((a, b) => b.score - a.score)
			.map((x) => x.entry);
	}

	async getAlignmentSnapshot(): Promise<AlignmentSnapshot> {
		const all = await this.exportAll();
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

	// ─── Full Insights Report ────────────────────────────────────────

	async generateFullInsights(): Promise<FullInsightsReport> {
		const all = await this.exportAll();
		return buildFullInsightsReport(all, this.llmFn, this.cfg.locale);
	}

	/**
	 * 生成增强版洞察报告（包含大白话洞察 + 开发者画像 + 根因分析）
	 */
	async generateEnhancedInsights(): Promise<{
		report: FullInsightsReport;
		persona?: DeveloperPersona;
		humanInsights: HumanInsight[];
		rootCauses: RootCauseInsight[];
	}> {
		const all = await this.exportAll();

		// 并行生成基础报告和大白话洞察
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
		const all = await this.exportAll();
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
		const isZh = this.cfg.locale === "zh";

		// High-weight patterns → automation suggestion
		if (patterns.length > 0) {
			const top = patterns[0]!;
			recommendations.push(
				isZh
					? `你在「${top.trigger}」时稳定执行「${top.behavior}」，考虑将此行为自动化`
					: `You consistently ${top.behavior} when ${top.trigger}. Consider automating this behavior.`,
			);
		}

		// Unresolved struggles → systematic review suggestion
		const unresolved = struggles.filter((s) => !s.resolved);
		if (unresolved.length >= 2) {
			recommendations.push(
				isZh
					? `有 ${unresolved.length} 个未解决的问题，建议系统性地逐个攻克`
					: `You have ${unresolved.length} unresolved issues. Consider tackling them systematically.`,
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
				isZh
					? `「${topTag[0]}」相关的问题反复出现，建议深入学习该领域`
					: `Issues related to "${topTag[0]}" appear frequently. Consider deeper learning in this area.`,
			);
		}

		// Lessons accumulation → expertise recognition
		if (lessons.length >= 5) {
			recommendations.push(
				isZh
					? `你已积累 ${lessons.length} 条经验教训，这是宝贵的知识财富`
					: `You've accumulated ${lessons.length} lessons. This is valuable expertise.`,
			);
		}

		// No data → encouragement
		if (patterns.length === 0 && struggles.length === 0 && lessons.length === 0) {
			recommendations.push(
				isZh ? `继续使用系统，让它学习你的工作习惯` : `Keep using the system to let it learn your work habits.`,
			);
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
		return filterByScope(evictExpiredEntries(entries), scope);
	}

	private filterAndCleanWork(entries: WorkEntry[], scope?: MemoryScope): WorkEntry[] {
		return filterByScope(evictExpiredWork(entries), scope);
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
		},
		cue: {
			knowledge: MemoryEntry[];
			lessons: MemoryEntry[];
			events: MemoryEntry[];
			preferences: MemoryEntry[];
			facets: MemoryEntry[];
			episodes: Episode[];
			work: WorkEntry[];
		},
		allEntries: MemoryEntry[],
		graphContext: GraphNeighbor[],
		p: PromptSet,
	): string {
		const sections: string[] = [];

		// ── Active tier: full detail ──
		const activeLines: string[] = [];
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

		if (activeLines.length) {
			sections.push(`### ${p.sectionActiveMemories}\n${activeLines.join("\n")}`);
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
}
