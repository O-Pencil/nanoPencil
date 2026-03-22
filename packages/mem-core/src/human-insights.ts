/**
 * [INPUT]: ExportAllResult, LlmFn, locale
 * [OUTPUT]: 开发者画像 + 人话版洞察 + 根因分析
 * [POS]: LLM-powered human-readable insights generation
 */

import { PROMPTS } from "./i18n.js";
import type {
	DeveloperPersona,
	EnhancedInsightsReport,
	ExportAllResult,
	HumanInsight,
	LlmFn,
	RootCauseInsight,
} from "./types.js";

function buildHumanInsightsData(all: ExportAllResult): {
	tools: string;
	languages: string;
	wins: string;
	struggles: string;
	lessons: string;
	errors: string;
} {
	// 工具使用
	const tools =
		all.episodes.length > 0
			? Object.entries(
					all.episodes.reduce(
						(acc, ep) => {
							for (const [tool, count] of Object.entries(ep.toolsUsed || {})) {
								acc[tool] = (acc[tool] || 0) + count;
							}
							return acc;
						},
						{} as Record<string, number>,
					),
				)
					.sort((a, b) => b[1] - a[1])
					.slice(0, 10)
					.map(([t, c]) => `${t} (${c}次)`)
					.join(", ")
			: "暂无数据";

	// 语言统计
	const langCounts: Record<string, number> = {};
	for (const ep of all.episodes) {
		for (const f of ep.filesModified || []) {
			const ext = f.includes(".") ? f.split(".").pop()?.toLowerCase() ?? "other" : "other";
			langCounts[ext] = (langCounts[ext] || 0) + 1;
		}
	}
	const languages =
		Object.keys(langCounts).length > 0
			? Object.entries(langCounts)
					.sort((a, b) => b[1] - a[1])
					.slice(0, 8)
					.map(([l, c]) => `${l} (${c}个文件)`)
					.join(", ")
			: "暂无数据";

	// 已解决的问题 (wins)
	const wins =
		all.facets
			.filter((f) => f.type === "struggle" && f.facetData?.kind === "struggle" && f.facetData.solution)
			.slice(0, 8)
			.map((f) => f.summary || f.facetData?.kind === "struggle" && f.facetData.problem)
			.filter(Boolean)
			.join("; ") || "暂无记录";

	// 未解决的问题 (struggles)
	const struggles =
		all.facets
			.filter((f) => f.type === "struggle" && (!f.facetData || (f.facetData.kind === "struggle" && !f.facetData.solution)))
			.slice(0, 8)
			.map((f) => f.facetData?.kind === "struggle" ? f.facetData.problem : (f.summary || f.detail || ""))
			.filter(Boolean)
			.join("; ") || "暂无记录";

	// 经验教训
	const lessons =
		all.lessons
			.slice(0, 10)
			.map((l) => l.summary || l.detail || l.content || "")
			.filter(Boolean)
			.join("; ") || "暂无记录";

	// 错误统计
	const errorCounts: Record<string, number> = {};
	for (const ep of all.episodes) {
		for (const err of ep.errors || []) {
			const key = err.slice(0, 50).trim();
			errorCounts[key] = (errorCounts[key] || 0) + 1;
		}
	}
	const errors =
		Object.keys(errorCounts).length > 0
			? Object.entries(errorCounts)
					.sort((a, b) => b[1] - a[1])
					.slice(0, 10)
					.map(([e, c]) => `${e} (${c}次)`)
					.join("; ")
			: "暂无错误记录";

	return { tools, languages, wins, struggles, lessons, errors };
}

function parseHumanInsightsResponse(raw: string): {
	persona?: DeveloperPersona;
	insights: HumanInsight[];
	rootCauses: RootCauseInsight[];
} | null {
	try {
		const cleaned = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
		const parsed = JSON.parse(cleaned);

		// Validate structure
		if (typeof parsed !== "object" || parsed === null) return null;

		const persona = parsed.persona
			? {
					whatTheyDo: String(parsed.persona.whatTheyDo || ""),
					experienceLevel: String(parsed.persona.experienceLevel || ""),
					superpowers: Array.isArray(parsed.persona.superpowers)
						? parsed.persona.superpowers.map(String)
						: [],
					painPoints: Array.isArray(parsed.persona.painPoints)
						? parsed.persona.painPoints.map(String)
						: [],
					workStyle: String(parsed.persona.workStyle || ""),
					summary: String(parsed.persona.summary || ""),
				}
			: undefined;

		const insights: HumanInsight[] = Array.isArray(parsed.insights)
			? parsed.insights.map((i: unknown) => ({
					title: String((i as Record<string, unknown>).title || ""),
					content: String((i as Record<string, unknown>).content || ""),
					icon: String((i as Record<string, unknown>).icon || "💡"),
					utility: ["high", "medium", "low"].includes(String((i as Record<string, unknown>).utility))
						? (String((i as Record<string, unknown>).utility) as "high" | "medium" | "low")
						: "medium",
					tags: Array.isArray((i as Record<string, unknown>).tags)
						? (i as Record<string, unknown>).tags.map(String)
						: [],
				}))
			: [];

		const rootCauses: RootCauseInsight[] = Array.isArray(parsed.rootCauses)
			? parsed.rootCauses.map((r: unknown) => ({
					symptom: String((r as Record<string, unknown>).symptom || ""),
					rootCause: String((r as Record<string, unknown>).rootCause || ""),
					evidence: Array.isArray((r as Record<string, unknown>).evidence)
						? (r as Record<string, unknown>).evidence.map(String)
						: [],
					suggestion: String((r as Record<string, unknown>).suggestion || ""),
				}))
			: [];

		return { persona, insights, rootCauses };
	} catch {
		return null;
	}
}

/**
 * 生成大白话版洞察报告
 */
export async function generateHumanInsights(
	all: ExportAllResult,
	llmFn: LlmFn | undefined,
	locale: string,
): Promise<{
	persona?: DeveloperPersona;
	humanInsights: HumanInsight[];
	rootCauses: RootCauseInsight[];
}> {
	// 如果没有 LLM，返回空结果
	if (!llmFn) {
		return { humanInsights: [], rootCauses: [] };
	}

	const p = PROMPTS[locale] || PROMPTS.en;
	const data = buildHumanInsightsData(all);

	// 构建用户 prompt，替换模板变量
	let userPrompt = p.humanInsightsUserTemplate;
	userPrompt = userPrompt.replace("{{tools}}", data.tools);
	userPrompt = userPrompt.replace("{{languages}}", data.languages);
	userPrompt = userPrompt.replace("{{wins}}", data.wins);
	userPrompt = userPrompt.replace("{{struggles}}", data.struggles);
	userPrompt = userPrompt.replace("{{lessons}}", data.lessons);
	userPrompt = userPrompt.replace("{{errors}}", data.errors);

	try {
		const raw = await llmFn(p.humanInsightsSystemPrompt, userPrompt);
		const parsed = parseHumanInsightsResponse(raw);

		if (parsed) {
			return {
				persona: parsed.persona,
				humanInsights: parsed.insights,
				rootCauses: parsed.rootCauses,
			};
		}
	} catch {
		// Fallback to empty
	}

	return { humanInsights: [], rootCauses: [] };
}

/**
 * 将人类可读洞察合并到 FullInsightsReport 生成流程中
 */
export async function buildEnhancedInsightsReport(
	all: ExportAllResult,
	llmFn: LlmFn | undefined,
	locale: string,
): Promise<EnhancedInsightsReport> {
	// 这个函数会在 engine.ts 中被调用来生成完整报告
	// 目前 placeholder - 实际逻辑在对应的调用处
	const humanData = await generateHumanInsights(all, llmFn, locale);

	// 返回一个基础结构，实际的完整报告会在调用处构建
	return {
		stats: {
			knowledge: all.knowledge.length,
			lessons: all.lessons.length,
			preferences: all.preferences.length,
			facets: all.facets.length,
			episodes: all.episodes.length,
			work: all.work.length,
			totalSessions: all.meta.totalSessions,
		},
		atAGlance: { working: "", hindering: "", quickWins: "", ambitious: "" },
		projectAreas: [],
		charts: [],
		wins: [],
		frictions: [],
		patterns: [],
		recommendations: [],
		featuresToTry: [],
		usagePatterns: [],
		generatedAt: new Date().toISOString(),
		locale,
		persona: humanData.persona,
		humanInsights: humanData.humanInsights,
		rootCauses: humanData.rootCauses,
		comparisons: [],
	};
}