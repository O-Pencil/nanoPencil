/**
 * [WHO]: extractFacetsFromTranscript, generateParallelInsights
 * [FROM]: Depends on core/session/session-manager, core/extensions-host/types, ./types, ./prompts, ./session-scanner
 * [TO]: Consumed by ./index
 * [HERE]: extensions/builtin/insights/insights-engine.ts - LLM facet extraction and parallel insight generation
 *
 * LLM insight generation engine.
 *
 * Port of Claude Code src/commands/insights.ts:
 * - extractFacetsFromAPI → extractFacetsFromTranscript
 * - generateParallelInsights → generateParallelInsights
 * - generateSectionInsight (helper)
 */

import type { SessionEntry } from "../../../core/session/session-manager.js";
import type { ExtensionContext } from "../../../core/extensions-host/types.js";
import type { SessionFacets, AggregatedData, InsightResults, InsightSection } from "./types.js";
import {
	FACET_EXTRACTION_PROMPT,
	FACET_EXTRACTION_SCHEMA,
	INSIGHT_SECTIONS,
	buildAtAGlancePrompt,
} from "./prompts.js";
import { formatTranscriptForFacets, formatTranscriptWithSummarization } from "./session-scanner.js";

// ============================================================================
// Helpers
// ============================================================================

function extractJsonFromResponse(response: string): Record<string, unknown> | null {
	// Try to extract JSON from the response (may be wrapped in markdown code fences)
	const jsonMatch = response.match(/\{[\s\S]*\}/);
	if (!jsonMatch) return null;
	try {
		return JSON.parse(jsonMatch[0]) as Record<string, unknown>;
	} catch {
		return null;
	}
}

function safeEntries<V>(obj: Record<string, V> | undefined | null): [string, V][] {
	return obj ? Object.entries(obj) : [];
}

// ============================================================================
// Facet extraction
// ============================================================================

export async function extractFacetsFromTranscript(
	entries: SessionEntry[],
	sessionId: string,
	ctx: ExtensionContext,
): Promise<SessionFacets | null> {
	try {
		// Format transcript, with summarization for long sessions
		const transcript = await formatTranscriptWithSummarization(
			entries,
			async (systemPrompt, userMessage) => {
				return ctx.completeSimple(systemPrompt, userMessage);
			},
		);

		const prompt = FACET_EXTRACTION_PROMPT + transcript + "\n\n" + FACET_EXTRACTION_SCHEMA;

		const response = await ctx.completeSimple(
			"You are a session analysis assistant. Respond ONLY with valid JSON.",
			prompt,
		);

		if (!response) return null;

		const parsed = extractJsonFromResponse(response);
		if (!parsed) return null;

		// Validate required fields
		if (!parsed.underlying_goal || !parsed.brief_summary) return null;

		return {
			session_id: sessionId,
			underlying_goal: String(parsed.underlying_goal),
			goal_categories: (parsed.goal_categories as Record<string, number>) || {},
			outcome: String(parsed.outcome || "unclear_from_transcript"),
			user_satisfaction_counts: (parsed.user_satisfaction_counts as Record<string, number>) || {},
			claude_helpfulness: String(parsed.claude_helpfulness || "moderately_helpful"),
			session_type: String(parsed.session_type || "single_task"),
			friction_counts: (parsed.friction_counts as Record<string, number>) || {},
			friction_detail: String(parsed.friction_detail || ""),
			primary_success: String(parsed.primary_success || "none"),
			brief_summary: String(parsed.brief_summary),
			user_instructions_to_claude: parsed.user_instructions_to_claude as string[] | undefined,
		};
	} catch {
		return null;
	}
}

// ============================================================================
// Data context builder
// ============================================================================

function buildDataContext(data: AggregatedData): string {
	// Top 8 tools
	const topTools = Object.entries(data.tool_counts)
		.sort(([, a], [, b]) => b - a)
		.slice(0, 8)
		.map(([name, count]) => `${name}: ${count}`)
		.join(", ");

	// Top 8 goals
	const topGoals = Object.entries(data.goal_categories)
		.sort(([, a], [, b]) => b - a)
		.slice(0, 8)
		.map(([name, count]) => `${name}: ${count}`)
		.join(", ");

	// Outcomes
	const outcomesStr = Object.entries(data.outcomes)
		.map(([k, v]) => `${k}: ${v}`)
		.join(", ");

	// Satisfaction
	const satisfactionStr = Object.entries(data.satisfaction)
		.map(([k, v]) => `${k}: ${v}`)
		.join(", ");

	// Friction
	const frictionStr = Object.entries(data.friction)
		.sort(([, a], [, b]) => b - a)
		.map(([k, v]) => `${k}: ${v}`)
		.join(", ");

	// Success
	const successStr = Object.entries(data.success)
		.sort(([, a], [, b]) => b - a)
		.map(([k, v]) => `${k}: ${v}`)
		.join(", ");

	// Languages
	const languagesStr = Object.entries(data.languages)
		.sort(([, a], [, b]) => b - a)
		.slice(0, 8)
		.map(([k, v]) => `${k}: ${v}`)
		.join(", ");

	return `## Aggregate Statistics
- Total sessions: ${data.total_sessions}
- Total messages: ${data.total_messages}
- Duration: ${data.total_duration_hours.toFixed(1)} hours
- Days active: ${data.days_active}
- Messages/day: ${data.messages_per_day}
- Git commits: ${data.git_commits}, pushes: ${data.git_pushes}
- Lines: +${data.total_lines_added}/-${data.total_lines_removed}
- Files modified: ${data.total_files_modified}
- Tool errors: ${data.total_tool_errors}
- Median response time: ${data.median_response_time.toFixed(1)}s

## Top Tools: ${topTools}
## Top Goals: ${topGoals}
## Outcomes: ${outcomesStr}
## Satisfaction: ${satisfactionStr}
## Friction: ${frictionStr}
## Success: ${successStr}
## Languages: ${languagesStr}`;
}

function buildFacetSummaries(facets: Map<string, SessionFacets>, max = 50): string {
	const summaries: string[] = [];
	for (const [, facet] of Array.from(facets)) {
		if (summaries.length >= max) break;
		summaries.push(
			`- Goal: ${facet.underlying_goal} | Outcome: ${facet.outcome} | Type: ${facet.session_type} | Summary: ${facet.brief_summary}`,
		);
	}
	return summaries.join("\n");
}

function buildFrictionDetails(facets: Map<string, SessionFacets>, max = 20): string {
	const details: string[] = [];
	for (const [, facet] of Array.from(facets)) {
		if (details.length >= max) break;
		if (facet.friction_detail) {
			details.push(`- ${facet.friction_detail}`);
		}
	}
	return details.join("\n");
}

function buildUserInstructions(facets: Map<string, SessionFacets>, max = 15): string {
	const instructions: string[] = [];
	for (const [, facet] of Array.from(facets)) {
		if (facet.user_instructions_to_claude) {
			for (const inst of facet.user_instructions_to_claude) {
				if (instructions.length >= max) break;
				instructions.push(`- ${inst}`);
			}
		}
		if (instructions.length >= max) break;
	}
	return instructions.join("\n");
}

// ============================================================================
// Section insight generation
// ============================================================================

async function generateSectionInsight(
	section: InsightSection,
	extraContext: string,
	ctx: ExtensionContext,
): Promise<{ name: string; result: Record<string, unknown> | null }> {
	try {
		const fullPrompt = extraContext
			? section.prompt + "\n\n" + extraContext
			: section.prompt;

		const response = await ctx.completeSimple(
			"You are a usage analysis assistant. Respond ONLY with valid JSON.",
			fullPrompt,
		);

		if (!response) return { name: section.name, result: null };

		const parsed = extractJsonFromResponse(response);
		return { name: section.name, result: parsed };
	} catch {
		return { name: section.name, result: null };
	}
}

// ============================================================================
// Parallel insights generation
// ============================================================================

export async function generateParallelInsights(
	data: AggregatedData,
	facets: Map<string, SessionFacets>,
	ctx: ExtensionContext,
): Promise<InsightResults> {
	const insights: InsightResults = {};

	// Build context for all sections
	const dataContext = buildDataContext(data);
	const facetSummaries = buildFacetSummaries(facets);
	const frictionDetails = buildFrictionDetails(facets);
	const userInstructions = buildUserInstructions(facets);

	const extraContext = [
		dataContext,
		facetSummaries ? `\n## Session Summaries\n${facetSummaries}` : "",
		frictionDetails ? `\n## Friction Details\n${frictionDetails}` : "",
		userInstructions ? `\n## User Instructions to Agent\n${userInstructions}` : "",
	].join("\n");

	// Run all sections in parallel
	const results = await Promise.all(
		INSIGHT_SECTIONS.map((section) => generateSectionInsight(section, extraContext, ctx)),
	);

	// Map results
	for (const { name, result } of results) {
		if (!result) continue;
		switch (name) {
			case "project_areas":
				insights.project_areas = result as InsightResults["project_areas"];
				break;
			case "interaction_style":
				insights.interaction_style = result as InsightResults["interaction_style"];
				break;
			case "what_works":
				insights.what_works = result as InsightResults["what_works"];
				break;
			case "friction_analysis":
				insights.friction_analysis = result as InsightResults["friction_analysis"];
				break;
			case "suggestions":
				insights.suggestions = result as InsightResults["suggestions"];
				break;
			case "on_the_horizon":
				insights.on_the_horizon = result as InsightResults["on_the_horizon"];
				break;
			case "fun_ending":
				insights.fun_ending = result as InsightResults["fun_ending"];
				break;
		}
	}

	// Generate "At a Glance" with access to other sections' outputs
	try {
		const projectAreasText =
			insights.project_areas?.areas
				?.map((a) => `- ${a.name}: ${a.description}`)
				.join("\n") || "";

		const bigWinsText =
			insights.what_works?.impressive_workflows
				?.map((w) => `- ${w.title}: ${w.description}`)
				.join("\n") || "";

		const frictionText =
			insights.friction_analysis?.categories
				?.map((c) => `- ${c.category}: ${c.description}`)
				.join("\n") || "";

		const featuresText =
			insights.suggestions?.features_to_try
				?.map((f) => `- ${f.feature}: ${f.one_liner}`)
				.join("\n") || "";

		const patternsText =
			insights.suggestions?.usage_patterns
				?.map((p) => `- ${p.title}: ${p.suggestion}`)
				.join("\n") || "";

		const horizonText =
			insights.on_the_horizon?.opportunities
				?.map((o) => `- ${o.title}: ${o.whats_possible}`)
				.join("\n") || "";

		const atAGlancePrompt = buildAtAGlancePrompt(
			dataContext,
			projectAreasText,
			bigWinsText,
			frictionText,
			featuresText,
			patternsText,
			horizonText,
		);

		const atAGlanceResponse = await ctx.completeSimple(
			"You are a usage analysis assistant. Respond ONLY with valid JSON.",
			atAGlancePrompt,
		);

		if (atAGlanceResponse) {
			const parsed = extractJsonFromResponse(atAGlanceResponse);
			if (parsed) {
				insights.at_a_glance = parsed as InsightResults["at_a_glance"];
			}
		}
	} catch {
		// At-a-glance is optional
	}

	return insights;
}
