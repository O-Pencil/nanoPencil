/**
 * [INPUT]: process.env, optional overrides
 * [OUTPUT]: NanomemConfig — memory dir, token budget, scoring weights, etc.
 * [POS]: Shared by engine and adapters; host products configure via this
 */

import { homedir } from "node:os";
import { join } from "node:path";
import type { MemoryScope } from "./types.js";

export interface ProgressiveRecallConfig {
	/** Score threshold for Active tier — inject full detail */
	thresholdActive: number;
	/** Score threshold for Cue tier — inject name + summary + id */
	thresholdCue: number;
	/** Budget ratio for Active tier (default 0.15 = 15%) */
	budgetActive: number;
	/** Budget ratio for Cue tier (default 0.70 = 70%) */
	budgetCue: number;
	/** Force entries created within this many hours to Active tier */
	forceRecentHours: number;
	/** Force entries with importance >= this value to Active tier */
	forceImportanceMin: number;
}

export interface NanomemConfig {
	memoryDir: string;
	tokenBudget: number;
	budget: { lessons: number; knowledge: number; episodes: number; preferences: number; work: number; facets: number };
	halfLife: Record<string, number>;
	maxEntries: { knowledge: number; lessons: number; preferences: number; work: number; facets: number };
	consolidationThreshold: number;
	/** Stanford-style retrieval scoring weights */
	scoreWeights: { recency: number; importance: number; relevance: number };
	/** Utility-weighted eviction: access frequency vs base impact */
	evictionWeights: { accessFrequency: number; baseImpact: number };
	/** Default scope for all operations */
	defaultScope?: MemoryScope;
	/** Locale for LLM prompts and injection templates */
	locale: "en" | "zh";
	/** Strength growth factor on each successful recall (spaced repetition) */
	strengthGrowthFactor: number;
	/** Progressive recall injection configuration */
	progressiveRecall: ProgressiveRecallConfig;
}

const DEFAULT_BUDGET = {
	lessons: 0.2,
	knowledge: 0.2,
	episodes: 0.18,
	preferences: 0.1,
	work: 0.2,
	facets: 0.12,
} as const;

const DEFAULT_HALF_LIFE: Record<string, number> = {
	lesson: 90,
	fact: 60,
	episode: 14,
	preference: 120,
	decision: 45,
	entity: 30,
	work: 45,
	pattern: 180,
	struggle: 120,
};

const DEFAULT_MAX_ENTRIES = { knowledge: 1000, lessons: 500, preferences: 200, work: 400, facets: 400 };
const DEFAULT_SCORE_WEIGHTS = { recency: 1, importance: 1, relevance: 1 };
const DEFAULT_EVICTION_WEIGHTS = { accessFrequency: 0.4, baseImpact: 0.6 };
const DEFAULT_PROGRESSIVE_RECALL: ProgressiveRecallConfig = {
	thresholdActive: 0.7,
	thresholdCue: 0.35,
	budgetActive: 0.15,
	budgetCue: 0.70,
	forceRecentHours: 24,
	forceImportanceMin: 9,
};

export function getConfig(overrides?: Partial<NanomemConfig>): NanomemConfig {
	const tokenBudget = Number(process.env.NANOMEM_TOKEN_BUDGET) || 6000;
	const memoryDir = process.env.NANOMEM_MEMORY_DIR || overrides?.memoryDir || join(homedir(), ".nanomem", "memory");
	const locale = (process.env.NANOMEM_LOCALE as "en" | "zh") || overrides?.locale || "en";
	return {
		memoryDir,
		tokenBudget: overrides?.tokenBudget ?? tokenBudget,
		budget: overrides?.budget ?? { ...DEFAULT_BUDGET },
		halfLife: overrides?.halfLife ?? { ...DEFAULT_HALF_LIFE },
		maxEntries: overrides?.maxEntries ?? { ...DEFAULT_MAX_ENTRIES },
		consolidationThreshold: overrides?.consolidationThreshold ?? 10,
		scoreWeights: overrides?.scoreWeights ?? { ...DEFAULT_SCORE_WEIGHTS },
		evictionWeights: overrides?.evictionWeights ?? { ...DEFAULT_EVICTION_WEIGHTS },
		defaultScope: overrides?.defaultScope,
		locale,
		strengthGrowthFactor: overrides?.strengthGrowthFactor ?? 1.5,
		progressiveRecall: overrides?.progressiveRecall ?? { ...DEFAULT_PROGRESSIVE_RECALL },
	};
}
