/**
 * [WHO]: synthesizeSmartRecap(), buildRecapContext(), SynthesizeResult
 * [FROM]: Depends on ./recap-budget, ./recap-types, core/extensions/types for ExtensionCommandContext + CompletionResult
 * [TO]: Consumed by extensions/defaults/recap/index.ts
 * [HERE]: extensions/defaults/recap/recap-synthesizer.ts - Smart Recap synthesis: builds prompt from session, runs completeSimpleWithUsage, enforces per-call budget
 */
import type { CompletionResult, ExtensionCommandContext } from "../../../core/extensions/types.js";
import { checkPerCallBudget } from "./recap-budget.js";
import type { RecapSettings, RecapTriggerReason } from "./recap-types.js";

const RECAP_SYSTEM_PROMPT = `You are producing a brief situational recap for the user mid-task.

Output exactly three short clauses in this order:
1. Current goal (what you understand the user wants — one sentence).
2. Key facts established so far (concrete artifacts: files touched, versions, decisions made — comma-separated).
3. Next decision needed from the user. Start with "Next:" in English replies or "下一步：" in Chinese replies. If no decision is pending, say "Next: continue" / "下一步：继续执行".

Constraints:
- Match the language of the user's most recent message (Chinese in → Chinese out).
- Wrap inline identifiers, file paths, and version strings in backticks.
- No greetings, no meta phrases like "Here is a recap", no markdown headers.
- 60 English words / 120 Chinese characters maximum across all three clauses combined.
- Do not contradict facts in the conversation transcript.`;

interface SessionMessageEntry {
	type: "message";
	message: {
		role: "user" | "assistant" | "system";
		content: string | Array<{ type: "text"; text: string }>;
	};
}

const ASSISTANT_TURN_CHAR_BUDGET = 500;
const RECENT_TURN_COUNT = 20;
const RECENT_TOOL_COUNT = 8;

function extractText(content: string | Array<{ type: "text"; text: string }>): string {
	if (typeof content === "string") return content;
	return content
		.filter((part): part is { type: "text"; text: string } => part.type === "text")
		.map((part) => part.text)
		.join("\n");
}

/**
 * Build the user-side payload fed to the synthesis model. Tight by design:
 * we walk the session backward and take only the most recent N message
 * turns + a tail of tool names. Tool *results* are intentionally excluded
 * because their bulk eats the per-call input budget without adding facts the
 * recap needs.
 */
export function buildRecapContext(ctx: ExtensionCommandContext): string {
	const entries = ctx.sessionManager.getEntries();
	const turns: string[] = [];
	const tools: string[] = [];

	for (const entry of entries) {
		const e = entry as { type: string; message?: SessionMessageEntry["message"]; toolName?: string };
		if (e.type === "message" && e.message) {
			if (e.message.role === "user") {
				const text = extractText(e.message.content);
				if (text.trim()) turns.push(`User: ${text}`);
			} else if (e.message.role === "assistant") {
				const text = extractText(e.message.content);
				if (text.trim()) turns.push(`Assistant: ${text.slice(0, ASSISTANT_TURN_CHAR_BUDGET)}`);
			}
		} else if (e.type === "toolCall" && e.toolName) {
			tools.push(e.toolName);
		}
	}

	const recentTurns = turns.slice(-RECENT_TURN_COUNT).join("\n\n");
	const recentTools = tools.slice(-RECENT_TOOL_COUNT).join(", ");

	const pieces: string[] = [];
	if (recentTurns) pieces.push(`Recent conversation turns:\n${recentTurns}`);
	if (recentTools) pieces.push(`Recent tool calls (names only): ${recentTools}`);
	if (pieces.length === 0) return "(no recorded activity in this session yet — describe the situation as 'session just started')";
	return pieces.join("\n\n");
}

export type SynthesizeResult =
	| { kind: "ok"; completion: CompletionResult }
	| { kind: "budget_blocked"; reason: string; estimatedInputTokens: number }
	| { kind: "no_model" }
	| { kind: "no_response" };

/**
 * Run the Smart recap. M1 enforces the per-call input cap before calling the
 * model and surfaces the real `usage` from the provider on success.
 */
export async function synthesizeSmartRecap(
	ctx: ExtensionCommandContext,
	settings: RecapSettings,
	_trigger: RecapTriggerReason,
): Promise<SynthesizeResult> {
	const userMessage = buildRecapContext(ctx);
	const verdict = checkPerCallBudget(RECAP_SYSTEM_PROMPT, userMessage, settings);
	if (!verdict.allowed) {
		return { kind: "budget_blocked", reason: verdict.reason, estimatedInputTokens: verdict.estimatedInputTokens };
	}

	const completion = await ctx.completeSimpleWithUsage(RECAP_SYSTEM_PROMPT, userMessage);
	if (!completion) {
		// completeSimpleWithUsage returns undefined when there is no current model or no API key.
		return ctx.model ? { kind: "no_response" } : { kind: "no_model" };
	}
	if (!completion.text.trim()) {
		return { kind: "no_response" };
	}
	return { kind: "ok", completion };
}
