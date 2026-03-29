/**
 * [INPUT]: NanomemConfig, optional LlmFn
 * [OUTPUT]: NanoMemEngine — unified API for memory CRUD, injection, consolidation
 * [POS]: Facade layer — composes store, scoring, eviction, update, linking, privacy, extraction, consolidation
 *
 * Host products create an engine instance and call its methods.
 * No dependency on any specific AI framework — LLM is pluggable.
 */

import { join } from "node:path";
import { getConfig, type NanomemConfig } from "./config.js";
import { consolidateEpisodes } from "./consolidation.js";
import { utilityEntry, utilityWork } from "./eviction.js";
import { extractMemories, extractWork } from "./extraction.js";
import type { PromptSet } from "./i18n.js";
import { PROMPTS } from "./i18n.js";
import { getRelatedSummaries, linkNewEntry } from "./linking.js";
import { evictExpiredEntries, evictExpiredWork, filterByScope, filterPII } from "./privacy.js";
import { extractTags, pickTop, scoreEntry, scoreEpisode, scoreWorkEntry, tagOverlap, tierEntries } from "./scoring.js";
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
		const prefs = await loadEntries(this.preferencesPath);
		const facets = await loadEntries(this.facetsPath);

		for (const item of items) {
			const target =
				item.type === "lesson"
					? lessons
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
		const episodes = await loadEpisodes(this.episodesDir);
		const newEntries = await consolidateEpisodes(episodes, this.cfg, this.llmFn);
		if (!newEntries.length) return [];

		const knowledge = await loadEntries(this.knowledgePath);
		const lessons = await loadEntries(this.lessonsPath);
		const allExisting = [...knowledge, ...lessons];

		for (const entry of newEntries) {
			const target = entry.type === "lesson" ? lessons : knowledge;
			const result = checkConsolidationEntry(target, entry, allExisting);
			if (result.action === "skip") continue;
			if (result.action === "update" && result.index !== undefined) {
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
				linkNewEntry(entry, allExisting);
				target.push(entry);
				allExisting.push(entry);
			}
		}

		const hl = this.cfg.halfLife;
		const ew = this.cfg.evictionWeights;
		await Promise.all([
			saveEntries(this.knowledgePath, knowledge, this.cfg.maxEntries.knowledge, (e) => utilityEntry(e, hl, ew)),
			saveEntries(this.lessonsPath, lessons, this.cfg.maxEntries.lessons, (e) => utilityEntry(e, hl, ew)),
		]);

		for (const ep of episodes) {
			if (ep.consolidated) await persistEpisode(this.episodesDir, ep);
		}

		const meta = await loadMeta(this.metaPath);
		meta.lastConsolidation = new Date().toISOString();
		await writeJson(this.metaPath, meta);

		return newEntries;
	}

	// ─── Retrieval & Injection (Progressive Recall) ────────────

	async getMemoryInjection(project: string, contextTags: string[], scope?: MemoryScope): Promise<string> {
		const [allKnowledge, allLessons, allPrefs, allFacets, allEpisodes, allWork] = await Promise.all([
			loadEntries(this.knowledgePath),
			loadEntries(this.lessonsPath),
			loadEntries(this.preferencesPath),
			loadEntries(this.facetsPath),
			loadEpisodes(this.episodesDir),
			loadWork(this.workPath),
		]);

		const knowledge = this.filterAndCleanEntries(allKnowledge, scope);
		const lessons = this.filterAndCleanEntries(allLessons, scope);
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
		const activeBudgetPer = Math.floor(activeChars / 4);
		const activeKnowledge = pickTop(tieredKnowledge.active, scoreFn, activeLen, activeBudgetPer);
		const activeLessons = pickTop(tieredLessons.active, scoreFn, activeLen, activeBudgetPer);
		const activePrefs = pickTop(tieredPrefs.active, scoreFn, activeLen, activeBudgetPer);
		const activeFacets = pickTop(tieredFacets.active, scoreFn, activeLen, activeBudgetPer);

		// Cue tier: pick top entries with name + summary + id, split budget across categories
		const cueBudgetPer = Math.floor(cueChars / 6); // 6 = knowledge + lessons + prefs + facets + episodes + work
		const cueKnowledge = pickTop(tieredKnowledge.cue, scoreFn, cueLen, cueBudgetPer);
		const cueLessons = pickTop(tieredLessons.cue, scoreFn, cueLen, cueBudgetPer);
		const cuePrefs = pickTop(tieredPrefs.cue, scoreFn, cueLen, cueBudgetPer);
		const cueFacets = pickTop(tieredFacets.cue, scoreFn, cueLen, cueBudgetPer);

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
		const allRecalledKnowledge = [...activeKnowledge, ...cueKnowledge];
		const allRecalledLessons = [...activeLessons, ...cueLessons];
		const allRecalledPrefs = [...activePrefs, ...cuePrefs];
		const allRecalledFacets = [...activeFacets, ...cueFacets];

		await this.reinforceEntries(allRecalledKnowledge, allKnowledge, this.knowledgePath);
		await this.reinforceEntries(allRecalledLessons, allLessons, this.lessonsPath);
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
				preferences: activePrefs,
				facets: activeFacets,
			},
			{
				knowledge: cueKnowledge,
				lessons: cueLessons,
				preferences: cuePrefs,
				facets: cueFacets,
				episodes: topEpisodes,
				work: topWork,
			},
			allKnowledge,
			p,
		);
	}

	// ─── Progressive Recall Tools ───────────────────────────────

	/** Retrieve a single entry by ID (for recall_memory tool) */
	async getEntryById(id: string): Promise<MemoryEntry | null> {
		const paths = [this.knowledgePath, this.lessonsPath, this.preferencesPath, this.facetsPath];
		for (const path of paths) {
			const entries = await loadEntries(path);
			const entry = entries.find((e) => e.id === id);
			if (entry) return entry;
		}
		return null;
	}

	/** Reinforce a single entry by ID (bump accessCount, lastAccessed, strength) */
	async reinforceEntryById(id: string): Promise<boolean> {
		const pathConfigs = [
			{ path: this.knowledgePath, max: this.cfg.maxEntries.knowledge },
			{ path: this.lessonsPath, max: this.cfg.maxEntries.lessons },
			{ path: this.preferencesPath, max: this.cfg.maxEntries.preferences },
			{ path: this.facetsPath, max: this.cfg.maxEntries.facets },
		];
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

	/** Full-text search across ALL entries including dormant (for search_all_memories tool) */
	async searchAllEntries(query: string, limit = 10): Promise<MemoryEntry[]> {
		const tags = extractTags(query);
		const queryLower = query.toLowerCase();

		const [knowledge, lessons, prefs, facets] = await Promise.all([
			loadEntries(this.knowledgePath),
			loadEntries(this.lessonsPath),
			loadEntries(this.preferencesPath),
			loadEntries(this.facetsPath),
		]);

		const all = [...knowledge, ...lessons, ...prefs, ...facets];

		return all
			.map((e) => {
				const nameMatch = (e.name || "").toLowerCase().includes(queryLower) ? 2 : 0;
				const summaryMatch = (e.summary || "").toLowerCase().includes(queryLower) ? 1 : 0;
				const tagMatch = tagOverlap(e.tags, tags);
				return { entry: e, score: nameMatch + summaryMatch + tagMatch };
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
		preferences: number;
		facets: number;
		episodes: number;
		work: number;
		totalSessions: number;
	}> {
		const [knowledge, lessons, prefs, facets, episodes, work, meta] = await Promise.all([
			loadEntries(this.knowledgePath),
			loadEntries(this.lessonsPath),
			loadEntries(this.preferencesPath),
			loadEntries(this.facetsPath),
			loadEpisodes(this.episodesDir),
			loadWork(this.workPath),
			loadMeta(this.metaPath),
		]);
		return {
			knowledge: knowledge.length,
			lessons: lessons.length,
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
		preferences: MemoryEntry[];
		facets: MemoryEntry[];
	}> {
		return {
			knowledge: await loadEntries(this.knowledgePath),
			lessons: await loadEntries(this.lessonsPath),
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
		preferences: number;
		facets: number;
		work: number;
		total: number;
	}> {
		const [knowledge, lessons, prefs, facets, work] = await Promise.all([
			loadEntries(this.knowledgePath),
			loadEntries(this.lessonsPath),
			loadEntries(this.preferencesPath),
			loadEntries(this.facetsPath),
			loadWork(this.workPath),
		]);

		const k = deduplicateMemoryEntries(knowledge);
		const l = deduplicateMemoryEntries(lessons);
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
			k.removedCount + l.removedCount + p.removedCount + f.removedCount + w.removedCount;
		return {
			knowledge: k.removedCount,
			lessons: l.removedCount,
			preferences: p.removedCount,
			facets: f.removedCount,
			work: w.removedCount,
			total,
		};
	}

	async searchEntries(query: string, scope?: MemoryScope): Promise<MemoryEntry[]> {
		const tags = extractTags(query);
		const { knowledge, lessons, preferences, facets } = await this.getAllEntries();
		const all = [...knowledge, ...lessons, ...preferences, ...facets];
		return filterByScope(all, scope)
			.map((e) => ({ entry: e, score: tagOverlap(e.tags, tags) }))
			.filter((x) => x.score > 0)
			.sort((a, b) => b.score - a.score)
			.map((x) => x.entry);
	}

	async forgetEntry(id: string): Promise<boolean> {
		const paths = [this.knowledgePath, this.lessonsPath, this.preferencesPath, this.facetsPath];
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
		preferences: MemoryEntry[];
		facets: MemoryEntry[];
		work: WorkEntry[];
		episodes: Episode[];
		meta: Meta;
	}> {
		const [knowledge, lessons, preferences, facets, work, episodes, meta] = await Promise.all([
			loadEntries(this.knowledgePath),
			loadEntries(this.lessonsPath),
			loadEntries(this.preferencesPath),
			loadEntries(this.facetsPath),
			loadWork(this.workPath),
			loadEpisodes(this.episodesDir),
			loadMeta(this.metaPath),
		]);
		return { knowledge, lessons, preferences, facets, work, episodes, meta };
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
		const hl = this.cfg.halfLife;
		const ew = this.cfg.evictionWeights;
		await saveEntries(
			savePath,
			all,
			savePath === this.lessonsPath
				? this.cfg.maxEntries.lessons
				: savePath === this.preferencesPath
					? this.cfg.maxEntries.preferences
					: savePath === this.facetsPath
						? this.cfg.maxEntries.facets
						: this.cfg.maxEntries.knowledge,
			(e) => utilityEntry(e, hl, ew),
		);
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
			preferences: MemoryEntry[];
			facets: MemoryEntry[];
		},
		cue: {
			knowledge: MemoryEntry[];
			lessons: MemoryEntry[];
			preferences: MemoryEntry[];
			facets: MemoryEntry[];
			episodes: Episode[];
			work: WorkEntry[];
		},
		allKnowledge: MemoryEntry[],
		p: PromptSet,
	): string {
		const sections: string[] = [];

		// ── Active tier: full detail ──
		const activeLines: string[] = [];

		const formatActiveEntry = (e: MemoryEntry): string => {
			const related = getRelatedSummaries(e, allKnowledge, 2);
			const suffix = related.length ? ` [→ ${related.join("; ")}]` : "";
			return `- [ID: ${e.id}] **${e.name || "—"}**: ${e.summary || ""}\n  ${e.detail || ""}${suffix}`;
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

		for (const e of active.lessons) activeLines.push(formatActiveEntry(e));
		for (const e of active.knowledge) activeLines.push(formatActiveEntry(e));
		for (const e of active.preferences) activeLines.push(formatActiveEntry(e));
		for (const e of active.facets) activeLines.push(formatActiveFacet(e));

		if (activeLines.length) {
			sections.push(`### ${p.sectionActiveMemories}\n${activeLines.join("\n")}`);
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

		for (const e of cue.lessons) cueLines.push(formatCueEntry(e));
		for (const e of cue.knowledge) cueLines.push(formatCueEntry(e));
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
