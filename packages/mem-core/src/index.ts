/**
 * [INPUT]: N/A
 * [OUTPUT]: Public API surface for nanomem
 * [POS]: Barrel export — hosts import NanoMemEngine, getConfig, types from here
 */

export type { NanomemConfig, ProgressiveRecallConfig } from "./config.js";
export { getConfig } from "./config.js";
export { NanoMemEngine } from "./engine.js";
export type { PromptSet } from "./i18n.js";
export { PROMPTS } from "./i18n.js";
export { renderInsightsHtml } from "./insights-html.js";
export { renderFullInsightsHtml } from "./full-insights-html.js";
export { getRelatedSummaries, linkNewEntry } from "./linking.js";
export { evictExpiredEntries, evictExpiredWork, filterByScope, filterPII, matchesScope } from "./privacy.js";
export type { ScoreWeights } from "./scoring.js";
export {
	daysSince,
	decay,
	extractTags,
	getInjectionLevel,
	pickTop,
	scoreEntry,
	scoreEpisode,
	scoreWorkEntry,
	tagOverlap,
	tierEntries,
} from "./scoring.js";
export type {
	Episode,
	ExtractedItem,
	ExtractedWork,
	FacetData,
	FullInsightsReport,
	FullInsightsAtAGlance,
	FullInsightsProjectArea,
	FullInsightsChart,
	FullInsightsChartRow,
	FullInsightsWin,
	FullInsightsFriction,
	FullInsightsFeatureToTry,
	FullInsightsUsagePattern,
	InjectionLevel,
	InsightsReport,
	LlmFn,
	MemoryEntry,
	MemoryScope,
	Meta,
	PatternInsight,
	StruggleInsight,
	UpdateAction,
	WorkEntry,
} from "./types.js";
