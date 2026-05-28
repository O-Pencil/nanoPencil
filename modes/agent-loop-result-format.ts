/**
 * [WHO]: Provides formatLoopPolicySummary()
 * [FROM]: Depends on @pencil-agent/agent-core AgentRunPolicy
 * [TO]: Consumed by interactive and ACP status formatters
 * [HERE]: modes/agent-loop-result-format.ts - shared run-result display helpers
 */
import type { AgentRunPolicy } from "@pencil-agent/agent-core";

function formatPercent(value: number): string {
	const percent = value * 100;
	return Number.isInteger(percent) ? `${percent}%` : `${percent.toFixed(1)}%`;
}

export function formatLoopPolicySummary(policy: AgentRunPolicy | undefined): string | undefined {
	if (!policy) return undefined;
	const parts: string[] = [];
	if (policy.maxTurnsPerPrompt !== undefined) parts.push(`turns=${policy.maxTurnsPerPrompt}`);
	if (policy.maxToolCallsPerPrompt !== undefined) parts.push(`tools=${policy.maxToolCallsPerPrompt}`);
	if (policy.maxToolConcurrency !== undefined) parts.push(`concurrency=${policy.maxToolConcurrency}`);
	if (policy.maxToolResultBatchSizeChars !== undefined) {
		parts.push(`toolResultChars=${policy.maxToolResultBatchSizeChars}`);
	}
	if (policy.maxModelErrorRecoveryAttempts !== undefined) {
		parts.push(`modelRecoveries=${policy.maxModelErrorRecoveryAttempts}`);
	}
	if (policy.maxOutputTokenRecoveryAttempts !== undefined) {
		parts.push(`outputRecoveries=${policy.maxOutputTokenRecoveryAttempts}`);
	}
	if (policy.outputTokenBudget !== undefined) {
		const budget = policy.outputTokenBudget;
		let value = `outputBudget=${budget.targetTokens}`;
		if (budget.thresholdPct !== undefined) value += `@${formatPercent(budget.thresholdPct)}`;
		if (budget.maxContinuations !== undefined) value += `/${budget.maxContinuations}`;
		parts.push(value);
	}
	if (policy.maxStopHookContinuations !== undefined) {
		parts.push(`stopHooks=${policy.maxStopHookContinuations}`);
	}
	return parts.length > 0 ? parts.join(", ") : undefined;
}
