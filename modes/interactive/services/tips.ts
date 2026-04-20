/**
 * [WHO]: Tip, getTipToShow, resetTipCooldown
 * [FROM]: No external dependencies
 * [TO]: Consumed by pencil-loader.ts
 * [HERE]: modes/interactive/services/tips.ts - spinner tips registry and scheduling
 */

interface Tip {
	id: string;
	content: string | (() => string);
	/** Minimum sessions between showing this tip */
	cooldownSessions?: number;
	/** Check if tip is relevant in current context */
	isRelevant?: () => boolean;
}

const TIPS: Tip[] = [
	{
		id: "btw-hint",
		content: "Use /btw <question> to ask quick questions without interrupting the current task",
		cooldownSessions: 5,
		isRelevant: () => true,
	},
	{
		id: "loop-hint",
		content: "Use /loop <interval> to schedule recurring reminders",
		cooldownSessions: 3,
		isRelevant: () => true,
	},
	{
		id: "plan-hint",
		content: "Use /plan to enter plan mode before making changes",
		cooldownSessions: 3,
		isRelevant: () => true,
	},
	{
		id: "branch-hint",
		content: "Use /branch to create a side branch and explore different approaches",
		cooldownSessions: 3,
		isRelevant: () => true,
	},
	{
		id: "compact-hint",
		content: "Context window getting full? The agent will compact automatically",
		cooldownSessions: 5,
		isRelevant: () => true,
	},
];

const TIP_MIN_DISPLAY_MS = 8000;

// Track last shown session index per tip (sessionId -> tipId -> sessionNum)
const tipHistoryBySession = new Map<string, Map<string, number>>();
// Keep the current active tip stable for a minimum duration to avoid flicker.
const activeTipBySession = new Map<
	string,
	{ tipId: string; content: string; shownAt: number; expiresAt: number }
>();
const sessionTipCount = new Map<string, number>();

/**
 * Get the next relevant tip to show on the spinner.
 * Returns null if no tip should be shown (cooldown not expired or no relevant tips).
 */
export function getTipToShow(sessionId: string): string | null {
	const now = Date.now();
	const sessionNum = sessionTipCount.get(sessionId) ?? 0;
	const active = activeTipBySession.get(sessionId);
	if (active && now < active.expiresAt) {
		return active.content;
	}

	let tipHistory = tipHistoryBySession.get(sessionId);
	if (!tipHistory) {
		tipHistory = new Map<string, number>();
		tipHistoryBySession.set(sessionId, tipHistory);
	}

	// Filter to relevant tips
	const relevantTips = TIPS.filter((tip) => {
		if (tip.isRelevant && !tip.isRelevant()) return false;

		// Check cooldown (using sessions as cooldown unit)
		const cooldown = tip.cooldownSessions ?? 3;
		const lastSessionNum = tipHistory.get(tip.id);
		if (
			lastSessionNum !== undefined &&
			sessionNum - lastSessionNum < cooldown
		) {
			return false;
		}
		return true;
	});

	if (relevantTips.length === 0) return null;

	// Simple round-robin: pick the tip that was shown longest ago
	let oldest: Tip | null = null;
	let oldestTime = Infinity;

	for (const tip of relevantTips) {
		const lastTime = tipHistory.get(tip.id) ?? -Infinity;
		if (lastTime < oldestTime) {
			oldestTime = lastTime;
			oldest = tip;
		}
	}

	if (!oldest) return null;

	// Record this tip as shown
	tipHistory.set(oldest.id, sessionNum);
	const content =
		typeof oldest.content === "function" ? oldest.content() : oldest.content;
	activeTipBySession.set(sessionId, {
		tipId: oldest.id,
		content,
		shownAt: now,
		expiresAt: now + TIP_MIN_DISPLAY_MS,
	});
	return content;
}

/**
 * Reset tip cooldown when session count increments.
 * Call this when starting a new session.
 */
export function onSessionIncrement(sessionId: string): void {
	const current = sessionTipCount.get(sessionId) ?? 0;
	sessionTipCount.set(sessionId, current + 1);
	activeTipBySession.delete(sessionId);
}

/**
 * Clear cooldown tracking for a session (e.g., on session reset).
 */
export function resetTipsForSession(sessionId: string): void {
	sessionTipCount.delete(sessionId);
	tipHistoryBySession.delete(sessionId);
	activeTipBySession.delete(sessionId);
}
