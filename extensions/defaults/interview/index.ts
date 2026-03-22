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
你是 Interview 探测引擎（需求澄清器）。

目标：
1) 评估用户原始需求的“信息熵”（信息是否足够以直接开始实现）。
2) 输出一个 completionScore（0 到 1，越高表示越清晰）。
3) 若仍缺关键约束/目标/风格/验收标准：输出 missingSlots（按优先级从高到低）。
4) 同时基于当前已知 answers 生成 refinedIntent：把用户需求重构成可执行的“清晰规格”，即使仍有待确认，也用占位符标记（例如：{待确认: xxx}）。

硬性要求：
- 你必须只输出“单个合法 JSON 对象”，不得输出任何额外文本、markdown 代码块或解释。
- JSON 字段：
  - completionScore: number（0..1）
  - refinedIntent: string（始终输出）
  - missingSlots: Array<{
      key: string,
      question: string,
      options?: string[],
      allowCustom?: boolean
    }>
- 规则：
  - 若缺失信息已足够直接开始实现，missingSlots 必须为空数组，并且 completionScore >= 0.8。
	  - 若原始需求属于问候/闲聊/记忆确认/纯情绪表达（例如：晚上好、你还记得我吗、随便讲讲），则视为“信息已足够无需澄清”：missingSlots 必须为空数组，并且 completionScore 必须 >= 0.8；refinedIntent 只需对用户需求做简短复述或回应即可。
  - missingSlots 最多返回 3 个（与 rounds 相匹配），优先返回最关键的一个。
  - question 必须用中文且一句话问清楚（避免长段落）。
  - options（若提供）必须是用户可直接选的短选项；allowCustom 表示允许输入自定义答案。
`.trim();

function clamp01(n: number): number {
	return Math.max(0, Math.min(1, n));
}

function tryExtractJsonObject(text: string): unknown | undefined {
	const trimmed = text.trim();
	const firstBrace = trimmed.indexOf("{");
	const lastBrace = trimmed.lastIndexOf("}");
	if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return undefined;
	const jsonStr = trimmed.slice(firstBrace, lastBrace + 1);
	try {
		return JSON.parse(jsonStr);
	} catch {
		return undefined;
	}
}

function truncateForPrompt(str: string, maxChars: number): string {
	if (str.length <= maxChars) return str;
	return str.slice(0, maxChars);
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

async function runProbe(
	ctx: ExtensionContext,
	originalIntent: string,
	answers: Record<string, string>,
	referenceSystemPrompt: string,
): Promise<ProbeOutput> {
	const reference = truncateForPrompt(referenceSystemPrompt, 5000);
	const userMessage = `
【原始需求】
${originalIntent}

【当前已知回答（answers）】
${JSON.stringify(answers)}

【用于帮助你判断的当前 systemPrompt（包含 memory / soul 等注入）】
${reference}
`.trim();

	const raw = await ctx.completeSimple(INTERVIEW_PROBE_SYSTEM_PROMPT, userMessage);
	const fallback: ProbeOutput = {
		completionScore: 0.25,
		refinedIntent: `用户原始需求：${originalIntent}\n\n建议澄清：目标/交付物、约束/技术栈、风格与验收标准（均为待确认）。`,
		missingSlots: [
			{ key: "deliverable", question: "这次你期望的最终交付物/输出是什么？（例如：代码、文档、PRD、测试、脚本）", allowCustom: true },
			{ key: "constraints", question: "有哪些硬性约束？（例如：语言/框架、运行环境、必须用的库、不能做的事）", allowCustom: true },
			{ key: "acceptance", question: "你希望如何验收？（例如：测试通过/性能指标/格式要求/示例输入输出）", allowCustom: true },
		],
	};

	if (!raw) return fallback;

	const parsed = tryExtractJsonObject(raw) as Partial<ProbeOutput> | undefined;
	if (!parsed || typeof parsed !== "object") return fallback;

	const completionScore = clamp01(typeof parsed.completionScore === "number" ? parsed.completionScore : fallback.completionScore);
	const refinedIntent =
		typeof parsed.refinedIntent === "string" && parsed.refinedIntent.trim()
			? parsed.refinedIntent.trim()
			: fallback.refinedIntent;
	const missingSlotsRaw = Array.isArray(parsed.missingSlots) ? parsed.missingSlots : fallback.missingSlots;
	const missingSlots: MissingSlot[] = missingSlotsRaw
		.filter((s) => s && typeof (s as any).key === "string" && typeof (s as any).question === "string")
		.slice(0, 3)
		.map((s) => ({
			key: String((s as any).key),
			question: String((s as any).question),
			options: Array.isArray((s as any).options) ? (s as any).options.map(String) : undefined,
			allowCustom: typeof (s as any).allowCustom === "boolean" ? (s as any).allowCustom : undefined,
		}));

	return { completionScore, refinedIntent, missingSlots };
}

async function askSlotWithUI(ctx: ExtensionContext, round: number, slot: MissingSlot): Promise<string | undefined> {
	const title = `Interview 澄清（${round}）：${slot.question}`;
	if (slot.options && slot.options.length > 0 && ctx.hasUI) {
		const options = [...slot.options];
		const allowCustom = slot.allowCustom === true;
		const customIndex = allowCustom ? options.length : -1;
		if (allowCustom) options.push("自定义/其他");

		const choice = await ctx.ui.select(title, options);
		if (!choice) return undefined;
		if (customIndex !== -1 && choice === "自定义/其他") {
			const v = await ctx.ui.input(`请输入自定义答案：${slot.key}`, slot.question);
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
	referenceSystemPrompt: string,
): Promise<{
	refinedIntent: string;
	completionScore: number;
	answers: Record<string, string>;
	missingSlotsRemaining: MissingSlot[];
}> {
	const answers: Record<string, string> = {};

	// Non-UI mode: probe only once (best-effort).
	if (!ctx.hasUI) {
		const probe = await runProbe(ctx, originalIntent, answers, referenceSystemPrompt);
		return {
			refinedIntent: probe.refinedIntent,
			completionScore: probe.completionScore,
			answers,
			missingSlotsRemaining: probe.missingSlots,
		};
	}

	let finalProbe: ProbeOutput | undefined;
	for (let i = 1; i <= maxRounds; i++) {
		const probe = await runProbe(ctx, originalIntent, answers, referenceSystemPrompt);
		finalProbe = probe;

		if (probe.missingSlots.length === 0 || probe.completionScore >= 0.8) break;

		const slot = probe.missingSlots[0];
		ctx.ui.setWorkingMessage?.(`Interview：追问第 ${i} 轮...`);
		const value = await askSlotWithUI(ctx, i, slot);
		ctx.ui.setWorkingMessage?.();

		if (!value) break; // user cancelled
		answers[slot.key] = value;
	}

	// If we broke early or still missing, run one last probe for best refinedIntent.
	const ensureProbe = finalProbe ?? (await runProbe(ctx, originalIntent, answers, referenceSystemPrompt));
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
		"【Interview Refined Intent】",
		`completionScore: ${input.completionScore.toFixed(2)}`,
		"",
		"【原始需求】",
		input.originalIntent,
		"",
		"【澄清后意图 refinedIntent】",
		input.refinedIntent,
		"",
		"【已补全信息】",
		answersLines,
		"",
		"【仍待确认】",
		remainingLines,
		"",
		"请把上述 refinedIntent 当作本轮唯一的执行规格来源，直接开始规划与实现。",
	].join("\n");
}

function buildToolResultText(refinedIntent: string): string {
	return refinedIntent;
}

const interviewToolSchema = Type.Object({
	query: Type.String({ description: "用户原始需求/意图" }),
	maxRounds: Type.Optional(Type.Number({ description: "最多追问轮数（默认 3）" })),
	answers: Type.Optional(Type.Record(Type.String(), Type.String())),
});

type InterviewToolInput = Static<typeof interviewToolSchema>;

export default async function interviewExtension(pi: ExtensionAPI) {
	// Minimal custom message renderer is optional - default renderer already supports Markdown.
	// We keep this extension light by relying on default rendering.

	pi.registerCommand("interview", {
		description: "澄清模糊需求并注入 refinedIntent（类似 Cursor/Claude Interview）",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const original = (args || "").trim() || getUserTextFromSessionManager(ctx.sessionManager) || "";
			if (!original) {
				ctx.ui.notify("Interview: 找不到要澄清的原始需求", "warning");
				return;
			}

			const maxRounds = 3;
			const referenceSystemPrompt = ctx.getSystemPrompt();
			const { refinedIntent, completionScore, answers, missingSlotsRemaining } = await runInterview(
				ctx,
				original,
				maxRounds,
				referenceSystemPrompt,
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
			"当用户需求模糊时，调用此工具与用户交互式澄清关键目标/约束/风格/验收标准；返回 refinedIntent 供模型直接执行。",
		parameters: interviewToolSchema,
		guidance:
			"只有在用户提出的是“要落地的任务/需求”（非问候/闲聊/记忆确认），且在你评估后仍缺关键目标/约束/风格/验收标准，导致难以直接规划与实现时，才调用本工具；若已得到 custom 消息类型 interview_refined 注入，则不要重复澄清。闲聊/问候/记忆询问请勿调用。",
		async execute(_toolCallId, params: InterviewToolInput, _signal, _onUpdate, ctx: ExtensionContext) {
			const query = params.query;
			const maxRounds = typeof params.maxRounds === "number" ? Math.max(1, Math.min(5, params.maxRounds)) : 3;
			const answersFromModel = (params.answers ?? {}) as Record<string, string>;

			// Start from provided answers (if any) then allow extra clarifications.
			const referenceSystemPrompt = ctx.getSystemPrompt();
			let answers = { ...answersFromModel };

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
				const probe = await runProbe(ctx, query, answers, referenceSystemPrompt);
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
				const probe = await runProbe(ctx, query, answers, referenceSystemPrompt);
				finalProbe = probe;
				if (probe.missingSlots.length === 0 || probe.completionScore >= 0.8) break;

				const slot = probe.missingSlots[0];
				ctx.ui.setWorkingMessage?.(`Interview tool：追问第 ${i} 轮...`);
				const value = await askSlotWithUI(ctx, i, slot);
				ctx.ui.setWorkingMessage?.();
				if (!value) break;
				answers[slot.key] = value;
			}

			const ensureProbe = finalProbe ?? (await runProbe(ctx, query, answers, referenceSystemPrompt));
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
		const referenceSystemPrompt = event.systemPrompt;

		// Visualization: notify start
		ctx.ui.notify?.("Interview: 正在分析需求...", "info");
		ctx.ui.setWorkingMessage?.("Interview: 分析中...");

		try {
			const { refinedIntent, completionScore, answers, missingSlotsRemaining } = await runInterview(
				ctx,
				original,
				maxRounds,
				referenceSystemPrompt,
			);

			const asked = Object.keys(answers).length > 0;
			const isClearEnough = missingSlotsRemaining.length === 0 && completionScore >= 0.8;

			// Clear working message
			ctx.ui.setWorkingMessage?.();

			// If we didn't ask anything and the request is already clear, avoid injecting extra noise.
			if (ctx.hasUI && !asked && isClearEnough) {
				ctx.ui.notify?.("Interview: 需求已足够清晰，跳过澄清", "info");
				return undefined;
			}

			// In non-UI modes we still inject refinedIntent so the main model has the best effort.
			if (!refinedIntent.trim()) return undefined;

			// Visualization: completion notification
			ctx.ui.notify?.("Interview: 需求澄清完成", "info");

			const injectionText = buildInjectionText({
				originalIntent: original,
				refinedIntent,
				completionScore,
				answers,
				missingSlotsRemaining,
			});

			// System prompt addition: prevent the model from repeatedly calling interview.
			const systemPromptAddition = `
请注意：
1) 你在本轮已经通过 Interview 得到了澄清后的执行规格（custom 消息类型：${INTERVIEW_CUSTOM_TYPE}）。
2) 请直接基于 refinedIntent 进行规划与实现。
3) 若你认为仍缺少关键信息：请在最终执行计划中列出"待确认点"，但不要再次调用 interview 工具进行重复澄清。
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
					},
				},
				systemPrompt: systemPromptAddition,
			};
		} catch (err) {
			// Clear working message on error
			ctx.ui.setWorkingMessage?.();
			// Never break the main agent due to interview.
			ctx.ui.notify(`Interview: 澄清失败（${err instanceof Error ? err.message : String(err)}）`, "warning");
			return undefined;
		}
	});
}

