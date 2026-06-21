/**
 * [WHO]: Provides babysit/watch stop-condition decisions for dev-loop runs
 * [FROM]: Depends only on scripts/dev-loop/types for state contracts
 * [TO]: Consumed by watch CLI and tests to decide continue, complete, or blocked
 * [HERE]: scripts/dev-loop/watch-state.ts within repo-level development loop infrastructure
 */

import type { WatchDecision, WatchDecisionInput } from "./types.js";

const DEFAULT_MAX_ATTEMPTS_PER_ISSUE = 3;
const DEFAULT_NEXT_DELAY_MS = 10 * 60 * 1000;

export function decideWatchState(input: WatchDecisionInput): WatchDecision {
	const maxAttempts = input.maxAttemptsPerIssue ?? DEFAULT_MAX_ATTEMPTS_PER_ISSUE;
	const openIssues = input.issues.filter((issue) => issue.status !== "fixed");
	const overBudget = openIssues.find((issue) => issue.attemptCount >= maxAttempts);

	if (overBudget) {
		return {
			decision: "blocked",
			reason: `Issue ${overBudget.signature} reached attempt budget (${overBudget.attemptCount}/${maxAttempts})`,
			currentIssueSignature: overBudget.signature,
		};
	}

	if (input.localGreen && input.remoteGreen !== false && openIssues.length === 0) {
		return {
			decision: "complete",
			reason: input.remoteGreen === true ? "Local verification and remote checks are green" : "Local verification is green",
		};
	}

	return {
		decision: "continue",
		reason: openIssues[0] ? `Continue repairing ${openIssues[0].signature}` : "Verification still running or not yet green",
		nextDelayMs: DEFAULT_NEXT_DELAY_MS,
		currentIssueSignature: openIssues[0]?.signature,
	};
}
