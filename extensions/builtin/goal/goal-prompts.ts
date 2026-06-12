/**
 * [WHO]: Pure prompt-template renderers for the goal extension: buildContinuationPrompt, buildBudgetLimitPrompt, buildObjectiveUpdatedPrompt
 * [FROM]: Depends on ./goal-types
 * [TO]: Consumed by ./goal-controller (idle continuation injection) and ./index (budget-limit steering)
 * [HERE]: extensions/builtin/goal/goal-prompts.ts - string templates that turn a ThreadGoal + usage into LLM-facing steering text
 */

import type { ThreadGoal } from "./goal-types.js";
import { formatTokens } from "./goal-format.js";

/** Mirrors codex-rs prompts/templates/goals/continuation.md. */
export function buildContinuationPrompt(goal: ThreadGoal): string {
	const tokensUsed = formatTokens(goal.tokens_used);
	const tokensBudget = goal.token_budget === null ? "unbounded" : formatTokens(goal.token_budget);
	const remaining = goal.token_budget === null ? "unbounded" : formatTokens(Math.max(0, goal.token_budget - goal.tokens_used));
	return [
		"Continue working toward the active thread goal.",
		"",
		"<objective>",
		goal.objective,
		"</objective>",
		"",
		`Budget: ${tokensUsed} used / ${tokensBudget} total (${remaining} remaining)`,
		"",
		"BEFORE doing new work: check if the objective is already satisfied.",
		"- Derive requirements from the objective. Inspect current state (files, tests, output).",
		"- If ALL requirements are met → call update_goal with status \"complete\" and stop.",
		"- If something is missing → continue working on it below.",
		"",
		"This goal persists across turns — make real progress toward the full objective each turn.",
		"When the objective is achieved, call update_goal with status \"complete\" immediately.",
		"Only call update_goal with status \"blocked\" after the same blocker repeats for 3+ consecutive turns.",
	].join("\n");
}

/** Short, focused completion audit injected every Nth continuation turn. */
export function buildCompletionAuditPrompt(goal: ThreadGoal): string {
	return [
		"STOP — completion audit required before any new work.",
		"",
		"<objective>",
		goal.objective,
		"</objective>",
		"",
		"Assess the current state against the objective above:",
		"1. What concrete requirements does the objective imply?",
		"2. Inspect the actual state (files, tests, output, behavior). Is each requirement satisfied?",
		"3. If ALL requirements are met → call update_goal with status \"complete\" immediately. Do not start new work.",
		"4. If something is missing → describe what remains, then continue working on it.",
	].join("\n");
}

/** Mirrors codex-rs prompts/templates/goals/budget_limit.md. */
export function buildBudgetLimitPrompt(goal: ThreadGoal): string {
	const tokensUsed = formatTokens(goal.tokens_used);
	const tokensBudget = goal.token_budget === null ? "unbounded" : formatTokens(goal.token_budget);
	const timeUsed = goal.time_used_seconds;
	return [
		"The active thread goal has reached its token budget.",
		"",
		"<objective>",
		goal.objective,
		"</objective>",
		"",
		"Budget:",
		`- Time spent: ${timeUsed} seconds`,
		`- Tokens used: ${tokensUsed}`,
		`- Token budget: ${tokensBudget}`,
		"",
		"The system has marked the goal as budget_limited, so do not start new substantive work for this goal. Wrap up this turn soon: summarize useful progress, identify remaining work or blockers, and leave the user with a clear next step.",
		"",
		"Do not call update_goal unless the goal is actually complete.",
	].join("\n");
}

/** Mirrors codex-rs prompts/templates/goals/objective_updated.md. */
export function buildObjectiveUpdatedPrompt(goal: ThreadGoal): string {
	return [
		"The thread goal objective has been updated.",
		"",
		"<objective>",
		goal.objective,
		"</objective>",
		"",
		"Treat the updated objective as the new source of truth. Re-derive requirements, verify the current state against each one, and keep working until the requested end state is true and verified.",
	].join("\n");
}
