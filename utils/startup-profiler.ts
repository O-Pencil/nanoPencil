/**
 * [WHO]: profileCheckpoint(), startupProfiler
 * [FROM]: Depends on node:process
 * [TO]: Consumed by main.ts, cli.ts, core/config/settings-manager.ts, core/runtime/sdk.ts
 * [HERE]: utils/startup-profiler.ts - startup timing instrumentation
 */

/** Startup timing checkpoint */
interface Checkpoint {
	name: string;
	time: number;
	delta?: number;
}

/** Whether profiling is enabled */
const enabled = process.env.NANOPENCIL_PROFILE_STARTUP === "1";

/** Stored checkpoints */
const checkpoints: Checkpoint[] = [];

/**
 * Record a startup checkpoint.
 * Outputs timing info if NANOPENCIL_PROFILE_STARTUP=1
 *
 * @example profileCheckpoint("config_loaded")
 * @example profileCheckpoint("settings_manager_ready", "after_config")
 */
export function profileCheckpoint(name: string, afterCheckpoint?: string): void {
	const now = performance.now();
	const entry: Checkpoint = { name, time: now };

	if (afterCheckpoint) {
		const parent = checkpoints.find((c) => c.name === afterCheckpoint);
		if (parent) {
			entry.delta = now - parent.time;
		}
	}

	checkpoints.push(entry);

	if (enabled) {
		const prev = checkpoints.length > 1 ? checkpoints[checkpoints.length - 2] : null;
		const delta = prev ? now - prev.time : 0;
		const parentDelta = entry.delta !== undefined ? ` (+${entry.delta.toFixed(1)}ms from ${afterCheckpoint})` : "";
		process.stderr.write(`[profile] ${name}: ${now.toFixed(1)}ms (${delta.toFixed(1)}ms since last${parentDelta})\n`);
	}
}

/**
 * Get all recorded checkpoints.
 * Useful for testing or programmatic access.
 */
export function getCheckpoints(): Checkpoint[] {
	return [...checkpoints];
}

/**
 * Clear all checkpoints.
 * Useful for testing.
 */
export function clearCheckpoints(): void {
	checkpoints.length = 0;
}
