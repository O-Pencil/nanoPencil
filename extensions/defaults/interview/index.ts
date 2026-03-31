/**
 * Interview Extension - Clarify ambiguous user requests.
 *
 * Provides:
 * - /interview command: force an interactive clarification and inject refined intent.
 * - interview tool: allow the model to auto-trigger clarification via tool_call.
 * - before_agent_start hook: preprocess each user prompt and inject refined intent when needed.
 *
 * Key implementation constraints:
 * - In non-UI modes (RPC/print), the extension must not block on dialogs; it falls back to probe-only refined intent.
 * - The extension should never throw on user cancel; it should proceed with best-effort placeholders.
 */

import { type Static, Type } from "@sinclair/typebox";
import type {
	ExtensionAPI,
	BeforeAgentStartEvent,
	BeforeAgentStartEventResult,
	ExtensionContext,
	ExtensionCommandContext,
	RegisteredCommand,
} from "../../../core/extensions/types.js";
import type { ReadonlySessionManager } from "../../../core/session/session-manager.js";

const INTERVIEW_CUSTOM_TYPE = "interview_refined";

const INTERVIEW_PROBE_SYSTEM_PROMPT = `
You are an "Interview probe" engine that clarifies ambiguous user requests.

Your goals:
1) Estimate how complete the user's request is for immediate execution.
2) Output a completionScore (0..1). Higher means clearer.
3) If critical info is missing (goal/deliverable/constraints/style/acceptance), output missingSlots (highest priority first).
4) Always generate refinedIntent: rewrite the request into an executable specification. If something is unknown, use an explicit placeholder (e.g. "{TBD: ...}").

Hard requirements:
- Output MUST be a single valid JSON object only. No extra text, no markdown, no code fences.
- JSON fields:
  - completionScore: number (0..1)
  - refinedIntent: string (always present, non-empty)
  - missingSlots: Array<{
      key: string,
      question: string,
      options?: string[],
      allowCustom?: boolean
    }>
- Rules:
  - If the request is already clear enough to start implementing, missingSlots MUST be [], and completionScore MUST be >= 0.8.
  - If the request is a greeting/small-talk/memory check/pure emotion (e.g. "hello", "do you remember me", "chat a bit"), treat it as clear enough: missingSlots MUST be [], completionScore MUST be >= 0.8, and refinedIntent can be a short restatement/response.
  - missingSlots MUST contain at most 3 items.
  - Prefer returning only the single most important missing slot.
  - question MUST be a single concise sentence (no long paragraphs).
  - options, when provided, MUST be short, directly selectable user options.
`.trim();

function clamp01(n: number): number {
	return Math.max(0, Math.min(1, n));
}

function tryParseStrictJsonObject(text: string): unknown | undefined {
	const trimmed = text.trim();
	if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return undefined;
	try {
		return JSON.parse(trimmed);
	} catch {
		return undefined;
	}
}

function truncateForPrompt(str: string, maxChars: number): string {
	if (str.length <= maxChars) return str;
	return str.slice(0, maxChars);
}

const LOOP_PROMPT_PREFIX = "[LOOP:";

function isLoopManagedPrompt(prompt: string): boolean {
	const trimmed = prompt.trim();
	if (!trimmed) return false;

	return (
		trimmed.startsWith(LOOP_PROMPT_PREFIX) ||
		trimmed.includes("Autonomous loop goal:") ||
		trimmed.includes("You are inside a managed loop.")
	);
}

/**
 * Check if interview should be triggered based on prompt content and context.
 * Only triggers for:
 * 1. Explicit /interview command (handled separately)
 * 2. Task-like requests that likely need clarification
 * 4. NOT after persona switch (flag set by interactive-mode)
 */
function isTaskLikePrompt(prompt: string): boolean {
	const p = prompt.trim();
	if (!p) return false;

	// Clear task intent (verbs / outcomes).
	const taskVerbPattern =
		/(做|写|实现|开发|设计|制作|生成|编写|搭建|部署|构建|修复|优化|重构|改进|完善|输出|交付|策划|规划|说明)/;
	const outputPattern =
		/(网站|作品集|页面|前端|后端|UI|界面|代码|程序|脚本|文档|README|PRD|测试|单元测试|接口|API|数据库|SQL|功能|需求|方案|计划)/;

	// "review/debug" intent e.g. "帮我看看这段代码/报错"
	const reviewPattern = /(看看|检查|分析|debug|定位|排查)/i;
	const reviewTargetPattern = /(代码|报错|错误|bug|异常|日志|log|trace|stack|SQL)/;

	// Request signals are often used with task verbs, but keep them optional.
	const requestSignalPattern = /(帮我|请你|能不能|可以|希望|需要|麻烦|拜托|给我)/;

	const hasTaskVerb = taskVerbPattern.test(p);
	const hasOutput = outputPattern.test(p);

	// Combined heuristics reduce false positives from greetings/chitchat.
	const looksLikeRequest = requestSignalPattern.test(p) || hasOutput;
	if ((hasTaskVerb && looksLikeRequest) || (hasOutput && hasTaskVerb)) return true;

	// Special case: review/debug without explicit task verb.
	if (reviewPattern.test(p) && reviewTargetPattern.test(p)) return true;

	return false;
}

function isNonTaskPrompt(prompt: string): boolean {
	const p = prompt.trim();
	if (!p) return false;

	// Greetings / small talk.
	const greetingPattern = /^(你好|您好|早上好|下午好|晚上好|嗨|hello|hi|hey)\b/i;
	const chitchatPattern = /(闲聊|聊聊|唠嗑|无聊|随便讲讲|随便聊聊)/i;

	// Memory / identity checks.
	const memoryPattern = /(你还记得我吗|还记得我吗|还记得我|记得我|记住我|你记不记得我|忘记我|你是谁)/i;

	// Generic "whatever" agreement without a concrete deliverable.
	const vagueAgreementPattern = /(都行|随便|无所谓|你决定|怎么都行)/i;

	// If it matches a non-task pattern AND it's not task-like, treat it as non-task.
	if (greetingPattern.test(p)) return !isTaskLikePrompt(p);
	if (chitchatPattern.test(p)) return !isTaskLikePrompt(p);
	if (memoryPattern.test(p)) return !isTaskLikePrompt(p);
	if (vagueAgreementPattern.test(p) && !isTaskLikePrompt(p)) return true;

	// Keep "very short" from triggering interview, but we can still classify short non-task messages as non-task.
	if (p.length < 20 && !isTaskLikePrompt(p)) return true;

	return false;
}

function shouldRunInterview(prompt: string): boolean {
	// Check if we just switched persona - skip interview on first message after switch
	if (process.env.PI_JUST_SWITCHED_PERSONA === "true") {
		return false;
	}

	// Loop-generated follow-up turns should stay autonomous and never re-open interview.
	if (isLoopManagedPrompt(prompt)) {
		return false;
	}

	// Avoid triggering interview for greetings/small-talk/memory questions.
	if (isNonTaskPrompt(prompt)) return false;

	// Trigger only when request looks task-like; actual "need clarification" is decided in probe/completionScore.
	return isTaskLikePrompt(prompt);
}

function getUserTextFromSessionManager(sm: ReadonlySessionManager): string | undefined {
	const entries = sm.getEntries();
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		if (entry.type !== "message") continue;
		const msg = entry.message as any;
		if (msg.role !== "user") continue;
		const content = msg.content;
		if (typeof content === "string") return content;
		if (Array.isArray(content)) {
			const parts = content
				.filter((b) => b && b.type === "text" && typeof b.text === "string")
				.map((b) => b.text);
			const text = parts.join("\n").trim();
			if (text) return text;
		}
	}
	return undefined;
}

type MissingSlot = {
	key: string;
	question: string;
	options?: string[];
	allowCustom?: boolean;
};

type ProbeOutput = {
	completionScore: number;
	refinedIntent: string;
	missingSlots: MissingSlot[];
};

function buildProbeContext(input: {
	originalIntent: string;
	answers: Record<string, string>;
	capabilities: {
		hasUI: boolean;
		mode: "interactive" | "nonInteractive";
		cwd?: string;
		model?: { provider?: string; id?: string; name?: string };
	};
}): string {
	return [
		"[Original request]",
		input.originalIntent,
		"",
		"[Known answers (JSON)]",
		JSON.stringify(input.answers),
		"",
		"[Runtime capabilities (JSON)]",
		JSON.stringify(input.capabilities),
	].join("\n").trim();
}

function normalizeMissingSlots(raw: unknown): MissingSlot[] {
	if (!Array.isArray(raw)) return [];
	const seen = new Set<string>();
	const out: MissingSlot[] = [];
	for (const s of raw) {
		if (!s || typeof s !== "object") continue;
		const key = typeof (s as any).key === "string" ? String((s as any).key).trim() : "";
		const question = typeof (s as any).question === "string" ? String((s as any).question).trim() : "";
		if (!key || !question) continue;
		if (seen.has(key)) continue;
		seen.add(key);
		const options =
			Array.isArray((s as any).options) && (s as any).options.length > 0
				? (s as any).options.map((v: any) => String(v).trim()).filter(Boolean).slice(0, 6)
				: undefined;
		const allowCustom = typeof (s as any).allowCustom === "boolean" ? (s as any).allowCustom : undefined;
		out.push({
			key: key.slice(0, 40),
			question: question.slice(0, 220),
			options,
			allowCustom,
		});
		if (out.length >= 3) break;
	}
	return out;
}

function coerceProbeOutput(parsed: unknown, fallback: ProbeOutput): ProbeOutput {
	if (!parsed || typeof parsed !== "object") return fallback;
	const p = parsed as any;

	let completionScore = clamp01(typeof p.completionScore === "number" ? p.completionScore : fallback.completionScore);
	let refinedIntent =
		typeof p.refinedIntent === "string" && p.refinedIntent.trim() ? p.refinedIntent.trim() : fallback.refinedIntent;
	let missingSlots = normalizeMissingSlots(p.missingSlots);

	// Consistency guards:
	if (completionScore < 0.8 && missingSlots.length === 0) {
		missingSlots = fallback.missingSlots;
		completionScore = Math.min(0.6, completionScore || 0.6);
	}
	if (completionScore >= 0.8 && missingSlots.length > 0) {
		missingSlots = [];
	}
	if (!refinedIntent.trim()) refinedIntent = fallback.refinedIntent;

	return { completionScore, refinedIntent, missingSlots };
}

async function runProbe(
	ctx: ExtensionContext,
	originalIntent: string,
	answers: Record<string, string>,
	capabilities: {
		hasUI: boolean;
		mode: "interactive" | "nonInteractive";
		cwd?: string;
		model?: { provider?: string; id?: string; name?: string };
	},
): Promise<ProbeOutput> {
	const userMessage = buildProbeContext({ originalIntent, answers, capabilities });
	const raw = await ctx.completeSimple(INTERVIEW_PROBE_SYSTEM_PROMPT, userMessage);
	const fallback: ProbeOutput = {
		completionScore: 0.25,
		refinedIntent: `Original request: ${originalIntent}\n\nMissing critical info (TBD): deliverable, constraints, acceptance criteria.`,
		missingSlots: [
			{
				key: "deliverable",
				question: "What is the final deliverable/output you want (e.g., code, doc, PRD, tests, script)?",
				allowCustom: true,
			},
			{
				key: "constraints",
				question: "Any hard constraints (language/framework/runtime/must-use libraries/things to avoid)?",
				allowCustom: true,
			},
			{
				key: "acceptance",
				question: "How should we validate/accept the result (tests, performance target, format, sample I/O)?",
				allowCustom: true,
			},
		],
	};

	if (!raw) return fallback;

	const parsed = tryParseStrictJsonObject(raw);
	return coerceProbeOutput(parsed, fallback);
}

async function askSlotWithUI(ctx: ExtensionContext, round: number, slot: MissingSlot): Promise<string | undefined> {
	const title = `Interview clarification (${round}): ${slot.question}`;
	if (slot.options && slot.options.length > 0 && ctx.hasUI) {
		const options = [...slot.options];
		const allowCustom = slot.allowCustom === true;
		const customIndex = allowCustom ? options.length : -1;
		if (allowCustom) options.push("Other (custom)");

		const choice = await ctx.ui.select(title, options);
		if (!choice) return undefined;
		if (customIndex !== -1 && choice === "Other (custom)") {
			const v = await ctx.ui.input(`Enter a custom answer: ${slot.key}`, slot.question);
			return v?.trim();
		}
		return choice.trim();
	}

	if (!ctx.hasUI) return undefined;
	const v = await ctx.ui.input(title, slot.question);
	return v?.trim();
}

async function runInterview(
	ctx: ExtensionContext,
	originalIntent: string,
	maxRounds: number,
): Promise<{
	refinedIntent: string;
	completionScore: number;
	answers: Record<string, string>;
	missingSlotsRemaining: MissingSlot[];
}> {
	const capabilities = {
		hasUI: ctx.hasUI,
		mode: ctx.hasUI ? ("interactive" as const) : ("nonInteractive" as const),
		cwd: ctx.cwd,
		model: ctx.model
			? { provider: ctx.model.provider, id: ctx.model.id, name: (ctx.model as any).name }
			: undefined,
	};
	const answers: Record<string, string> = {};

	// Non-UI mode: probe only once (best-effort).
	if (!ctx.hasUI) {
		const probe = await runProbe(ctx, originalIntent, answers, capabilities);
		return {
			refinedIntent: probe.refinedIntent,
			completionScore: probe.completionScore,
			answers,
			missingSlotsRemaining: probe.missingSlots,
		};
	}

	let finalProbe: ProbeOutput | undefined;
	for (let i = 1; i <= maxRounds; i++) {
		const probe = await runProbe(ctx, originalIntent, answers, capabilities);
		finalProbe = probe;

		if (probe.missingSlots.length === 0 || probe.completionScore >= 0.8) break;

		const slot = probe.missingSlots[0];
		ctx.ui.setWorkingMessage?.(`Interview: asking follow-up (${i})...`);
		const value = await askSlotWithUI(ctx, i, slot);
		ctx.ui.setWorkingMessage?.();

		if (!value) break; // user cancelled
		answers[slot.key] = value;
	}

	// If we broke early or still missing, run one last probe for best refinedIntent.
	const ensureProbe = finalProbe ?? (await runProbe(ctx, originalIntent, answers, capabilities));
	const missingSlotsRemaining = ensureProbe.missingSlots.filter((s) => answers[s.key] === undefined);

	return {
		refinedIntent: ensureProbe.refinedIntent,
		completionScore: ensureProbe.completionScore,
		answers,
		missingSlotsRemaining,
	};
}

function buildInjectionText(input: {
	originalIntent: string;
	refinedIntent: string;
	completionScore: number;
	answers: Record<string, string>;
	missingSlotsRemaining: MissingSlot[];
}): string {
	const answeredKeys = Object.keys(input.answers);
	const remainingKeys = input.missingSlotsRemaining.map((s) => s.key);

	const answersLines =
		answeredKeys.length > 0
			? answeredKeys.map((k) => `- ${k}: ${input.answers[k]}`).join("\n")
			: "(无)";
	const remainingLines =
		remainingKeys.length > 0
			? remainingKeys.map((k) => `- ${k}`).join("\n")
			: "(无)";

	return [
		"[Interview Refined Intent]",
		`completionScore: ${input.completionScore.toFixed(2)}`,
		"",
		"[Original request]",
		input.originalIntent,
		"",
		"[Refined intent]",
		input.refinedIntent,
		"",
		"[Answered]",
		answersLines,
		"",
		"[Still TBD]",
		remainingLines,
		"",
		"Use the refinedIntent above as the single source of truth for planning and execution.",
	].join("\n");
}

function buildToolResultText(refinedIntent: string): string {
	return refinedIntent;
}

const interviewToolSchema = Type.Object({
	query: Type.String({ description: "The user's original request/intent" }),
	maxRounds: Type.Optional(Type.Number({ description: "Max follow-up rounds (default: 3)" })),
	answers: Type.Optional(Type.Record(Type.String(), Type.String())),
});

type InterviewToolInput = Static<typeof interviewToolSchema>;

export default async function interviewExtension(pi: ExtensionAPI) {
	// Minimal custom message renderer is optional - default renderer already supports Markdown.
	// We keep this extension light by relying on default rendering.

	pi.registerCommand("interview", {
		description: "Clarify an ambiguous request and inject a refined intent.",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const original = (args || "").trim() || getUserTextFromSessionManager(ctx.sessionManager) || "";
			if (!original) {
				ctx.ui.notify("Interview: no request found to clarify", "warning");
				return;
			}

			const maxRounds = 3;
			const { refinedIntent, completionScore, answers, missingSlotsRemaining } = await runInterview(
				ctx,
				original,
				maxRounds,
			);

			const injectionText = buildInjectionText({
				originalIntent: original,
				refinedIntent,
				completionScore,
				answers,
				missingSlotsRemaining,
			});

			pi.sendMessage(
				{
					customType: INTERVIEW_CUSTOM_TYPE,
					content: injectionText,
					display: true,
					details: {
						original_intent: original,
						refined_intent: refinedIntent,
						completion_score: completionScore,
						answers,
						missing_slots: missingSlotsRemaining.map((s) => ({ key: s.key, question: s.question })),
					},
				},
				{ triggerTurn: true },
			);
		},
	} satisfies Omit<RegisteredCommand, "name">);

	pi.registerTool({
		name: "interview",
		label: "Interview Clarifier",
		description:
			"When a task request is ambiguous, interactively clarify goal/constraints/style/acceptance and return a refined intent.",
		parameters: interviewToolSchema,
		guidance:
			"Only use this tool for task-like requests that are missing critical details (goal/deliverable/constraints/style/acceptance). Do not use it for greetings/small talk/memory checks. If an interview_refined custom message is already present, do not repeat clarification.",
		async execute(_toolCallId, params: InterviewToolInput, _signal, _onUpdate, ctx: ExtensionContext) {
			const query = params.query;
			const maxRounds = typeof params.maxRounds === "number" ? Math.max(1, Math.min(5, params.maxRounds)) : 3;
			const answersFromModel = (params.answers ?? {}) as Record<string, string>;

			// Start from provided answers (if any) then allow extra clarifications.
			let answers = { ...answersFromModel };
			const capabilities = {
				hasUI: ctx.hasUI,
				mode: ctx.hasUI ? ("interactive" as const) : ("nonInteractive" as const),
				cwd: ctx.cwd,
				model: ctx.model
					? { provider: ctx.model.provider, id: ctx.model.id, name: (ctx.model as any).name }
					: undefined,
			};

			if (isLoopManagedPrompt(query)) {
				return {
					content: [{ type: "text", text: query }],
					details: {
						original_intent: query,
						refined_intent: query,
						completion_score: 1,
						answers,
						missing_slots: [],
					},
				};
			}

			// UI mode guard: prevent the model from triggering interactive interview for non-task prompts.
			if (ctx.hasUI && !isTaskLikePrompt(query)) {
				return {
					content: [{ type: "text", text: query }],
					details: {
						original_intent: query,
						refined_intent: query,
						completion_score: 1,
						answers,
						missing_slots: [],
					},
				};
			}

			// Non-UI / fallback: probe-only.
			if (!ctx.hasUI) {
				const probe = await runProbe(ctx, query, answers, capabilities);
				return {
					content: [{ type: "text", text: buildToolResultText(probe.refinedIntent) }],
					details: {
						original_intent: query,
						refined_intent: probe.refinedIntent,
						completion_score: probe.completionScore,
						answers,
						missing_slots: probe.missingSlots.map((s) => ({ key: s.key, question: s.question })),
					},
				};
			}

			// UI mode: ask sequentially, using already-provided answers as starting point.
			let finalProbe: ProbeOutput | undefined;
			for (let i = 1; i <= maxRounds; i++) {
				const probe = await runProbe(ctx, query, answers, capabilities);
				finalProbe = probe;
				if (probe.missingSlots.length === 0 || probe.completionScore >= 0.8) break;

				const slot = probe.missingSlots[0];
				ctx.ui.setWorkingMessage?.(`Interview: asking follow-up (${i})...`);
				const value = await askSlotWithUI(ctx, i, slot);
				ctx.ui.setWorkingMessage?.();
				if (!value) break;
				answers[slot.key] = value;
			}

			const ensureProbe = finalProbe ?? (await runProbe(ctx, query, answers, capabilities));
			const missingSlotsRemaining = ensureProbe.missingSlots.filter((s) => answers[s.key] === undefined);

			const injectionText = buildInjectionText({
				originalIntent: query,
				refinedIntent: ensureProbe.refinedIntent,
				completionScore: ensureProbe.completionScore,
				answers,
				missingSlotsRemaining,
			});

			return {
				content: [{ type: "text", text: injectionText }],
				details: {
					original_intent: query,
					refined_intent: ensureProbe.refinedIntent,
					completion_score: ensureProbe.completionScore,
					answers,
					missing_slots: missingSlotsRemaining.map((s) => ({ key: s.key, question: s.question })),
				},
			};
		},
	});

	pi.on("before_agent_start", async (event: BeforeAgentStartEvent, ctx: ExtensionContext): Promise<BeforeAgentStartEventResult | undefined> => {
		const original = event.prompt?.trim();
		if (!original) return undefined;

		// Check if interview should run based on prompt content and context
		if (!shouldRunInterview(original)) {
			return undefined;
		}

		const maxRounds = 3;
		const capabilities = {
			hasUI: ctx.hasUI,
			mode: ctx.hasUI ? ("interactive" as const) : ("nonInteractive" as const),
			cwd: ctx.cwd,
			model: ctx.model
				? { provider: ctx.model.provider, id: ctx.model.id, name: (ctx.model as any).name }
				: undefined,
		};

		// Visualization: notify start
		ctx.ui.notify?.("Interview: analyzing request...", "info");
		ctx.ui.setWorkingMessage?.("Interview: analyzing...");

		try {
			// Probe-first decision: only clarify when the probe signals missing critical info.
			const initialAnswers: Record<string, string> = {};
			const probe = await runProbe(ctx, original, initialAnswers, capabilities);
			const needsClarification = probe.completionScore < 0.8 && probe.missingSlots.length > 0;

			// Clear working message early; follow-up UI will re-set if needed.
			ctx.ui.setWorkingMessage?.();

			// If already clear enough, do not inject any extra messages (avoid surprise/noise).
			if (!needsClarification) {
				ctx.ui.notify?.("Interview: request looks clear enough; skipping clarification", "info");
				return undefined;
			}

			// UI mode: ask user whether to clarify now (avoid surprising interruptions).
			let userWantsClarification = false;
			if (ctx.hasUI) {
				userWantsClarification = await ctx.ui.confirm(
					"Interview clarification",
					"I need 1 quick clarification to proceed. Ask now?",
				);
			}

			const interviewResult = userWantsClarification
				? await runInterview(ctx, original, maxRounds)
				: {
						refinedIntent: probe.refinedIntent,
						completionScore: probe.completionScore,
						answers: {},
						missingSlotsRemaining: probe.missingSlots,
					};

			const { refinedIntent, completionScore, answers, missingSlotsRemaining } = interviewResult;

			const asked = Object.keys(answers).length > 0;
			const isClearEnough = missingSlotsRemaining.length === 0 && completionScore >= 0.8;

			// In non-UI modes we still inject refinedIntent so the main model has the best effort.
			if (!refinedIntent.trim()) return undefined;

			// Visualization: completion notification
			ctx.ui.notify?.(
				asked
					? "Interview: clarification complete"
					: isClearEnough
						? "Interview: refined intent generated"
						: "Interview: refined intent generated (some items still TBD)",
				"info",
			);

			const injectionText = buildInjectionText({
				originalIntent: original,
				refinedIntent,
				completionScore,
				answers,
				missingSlotsRemaining,
			});

			// System prompt addition: prevent the model from repeatedly calling interview.
			const systemPromptAddition = `
Note:
1) This turn already has an Interview refined spec (custom type: ${INTERVIEW_CUSTOM_TYPE}).
2) Plan and execute directly from refinedIntent.
3) If anything is still unknown, list it as "TBD" in the final plan. Do not call the interview tool again this turn.
`.trim();

			return {
				message: {
					customType: INTERVIEW_CUSTOM_TYPE,
					content: injectionText,
					display: true,
					details: {
						original_intent: original,
						refined_intent: refinedIntent,
						completion_score: completionScore,
						answers,
						missing_slots: missingSlotsRemaining.map((s) => ({ key: s.key, question: s.question })),
						skipped_interaction: ctx.hasUI ? !userWantsClarification : true,
					},
				},
				systemPrompt: systemPromptAddition,
			};
		} catch (err) {
			// Clear working message on error
			ctx.ui.setWorkingMessage?.();
			// Never break the main agent due to interview.
			ctx.ui.notify(`Interview: failed (${err instanceof Error ? err.message : String(err)})`, "warning");
			return undefined;
		}
	});
}

