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

// Track last shown tip per session (sessionId -> tipId)
const lastShownTip = new Map<string, { tipId: string; shownAt: number; sessionNum: number }>();
const sessionTipCount = new Map<string, number>();

/**
 * Get the next relevant tip to show on the spinner.
 * Returns null if no tip should be shown (cooldown not expired or no relevant tips).
 */
export function getTipToShow(sessionId: string): string | null {
	const now = Date.now();
	const sessionNum = sessionTipCount.get(sessionId) ?? 0;

	// Filter to relevant tips
	const relevantTips = TIPS.filter((tip) => {
		if (tip.isRelevant && !tip.isRelevant()) return false;
		const last = lastShownTip.get(sessionId);
		if (!last) return true;

		// Check cooldown (using sessions as cooldown unit)
		const cooldown = tip.cooldownSessions ?? 3;
		if (last.tipId === tip.id && sessionNum - last.sessionNum < cooldown) {
			return false;
		}
		return true;
	});

	if (relevantTips.length === 0) return null;

	// Simple round-robin: pick the tip that was shown longest ago
	let oldest: Tip | null = null;
	let oldestTime = Infinity;

	for (const tip of relevantTips) {
		const last = lastShownTip.get(sessionId);
		const lastTime = last?.tipId === tip.id ? last.shownAt : 0;
		if (lastTime < oldestTime) {
			oldestTime = lastTime;
			oldest = tip;
		}
	}

	if (!oldest) return null;

	// Record this tip as shown
	lastShownTip.set(sessionId, { tipId: oldest.id, shownAt: now, sessionNum });
	return typeof oldest.content === "function" ? oldest.content() : oldest.content;
}

/**
 * Reset tip cooldown when session count increments.
 * Call this when starting a new session.
 */
export function onSessionIncrement(sessionId: string): void {
	const current = sessionTipCount.get(sessionId) ?? 0;
	sessionTipCount.set(sessionId, current + 1);
}

/**
 * Clear cooldown tracking for a session (e.g., on session reset).
 */
export function resetTipsForSession(sessionId: string): void {
	sessionTipCount.delete(sessionId);
	lastShownTip.delete(sessionId);
}
