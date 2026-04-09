/**
 * [WHO]: SchedulerController
 * [FROM]: Depends on node:crypto, ./scheduler-types
 * [TO]: Consumed by ./index.ts
 * [HERE]: extensions/defaults/loop/scheduler-controller.ts - in-memory recurring task store with pause/resume/run-now/max-runs
 */

import { randomBytes } from "node:crypto";
import type { LoopStartSpec, ScheduledLoopTask } from "./scheduler-types.js";

const MAX_SCHEDULED_TASKS = 50;

export class SchedulerController {
	private tasks = new Map<string, ScheduledLoopTask>();
	private pendingTaskId?: string;

	list(): ScheduledLoopTask[] {
		return [...this.tasks.values()].sort((a, b) => a.nextRunAt - b.nextRunAt);
	}

	getPendingTask(): ScheduledLoopTask | undefined {
		return this.pendingTaskId ? this.tasks.get(this.pendingTaskId) : undefined;
	}

	resolve(ref: string): ScheduledLoopTask | undefined {
		const trimmed = ref.trim();
		if (!trimmed) return undefined;
		if (this.tasks.has(trimmed)) return this.tasks.get(trimmed);
		const lower = trimmed.toLowerCase();
		for (const task of this.tasks.values()) {
			if (task.name && task.name.toLowerCase() === lower) return task;
		}
		return undefined;
	}

	create(spec: LoopStartSpec): ScheduledLoopTask {
		if (this.tasks.size >= MAX_SCHEDULED_TASKS) {
			throw new Error(`Loop already has ${MAX_SCHEDULED_TASKS} scheduled tasks. Clear one before adding another.`);
		}
		if (spec.name) {
			const existing = this.resolve(spec.name);
			if (existing) {
				throw new Error(`A loop named "${spec.name}" already exists (id ${existing.id}).`);
			}
		}

		const now = Date.now();
		const task: ScheduledLoopTask = {
			id: randomBytes(4).toString("hex").slice(0, 8),
			name: spec.name,
			input: spec.input.trim(),
			kind: spec.kind,
			intervalMs: spec.intervalMs,
			intervalLabel: spec.intervalLabel,
			createdAt: now,
			updatedAt: now,
			nextRunAt: now + spec.intervalMs,
			runCount: 0,
			maxRuns: spec.maxRuns,
			pending: false,
			paused: false,
			quiet: spec.quiet ?? false,
		};
		this.tasks.set(task.id, task);
		return { ...task };
	}

	cancel(ref: string): ScheduledLoopTask | undefined {
		const task = this.resolve(ref);
		if (!task) return undefined;
		this.tasks.delete(task.id);
		if (this.pendingTaskId === task.id) this.pendingTaskId = undefined;
		return { ...task };
	}

	clear(): number {
		const count = this.tasks.size;
		this.tasks.clear();
		this.pendingTaskId = undefined;
		return count;
	}

	pause(ref: string): ScheduledLoopTask | undefined {
		const task = this.resolve(ref);
		if (!task) return undefined;
		task.paused = true;
		task.updatedAt = Date.now();
		// If this task was pending dispatch, release the pending slot so other
		// loops can advance. The agent_end settle path will become a no-op.
		if (this.pendingTaskId === task.id) {
			task.pending = false;
			this.pendingTaskId = undefined;
		}
		return { ...task };
	}

	resume(ref: string): ScheduledLoopTask | undefined {
		const task = this.resolve(ref);
		if (!task) return undefined;
		task.paused = false;
		task.updatedAt = Date.now();
		// Re-prime the next run from now so a long-paused loop doesn't fire
		// immediately if its old nextRunAt is in the past.
		task.nextRunAt = Date.now() + task.intervalMs;
		return { ...task };
	}

	forceDue(ref: string): ScheduledLoopTask | undefined {
		const task = this.resolve(ref);
		if (!task) return undefined;
		task.nextRunAt = 0;
		task.paused = false;
		task.updatedAt = Date.now();
		return { ...task };
	}

	nextDue(now = Date.now()): ScheduledLoopTask | undefined {
		if (this.pendingTaskId) return undefined;
		return this.list().find((task) => !task.paused && task.nextRunAt <= now);
	}

	markDispatched(id: string, now = Date.now()): ScheduledLoopTask {
		const task = this.tasks.get(id);
		if (!task) throw new Error(`Unknown loop task: ${id}`);

		task.pending = true;
		task.lastRunAt = now;
		task.nextRunAt = now + task.intervalMs;
		task.updatedAt = now;
		task.runCount += 1;
		task.lastError = undefined;
		this.pendingTaskId = id;
		return { ...task };
	}

	markSettled(id: string, error?: string, outputSnippet?: string): ScheduledLoopTask | undefined {
		const task = this.tasks.get(id);
		if (!task) return undefined;
		task.pending = false;
		task.updatedAt = Date.now();
		task.lastError = error;
		if (outputSnippet) {
			task.lastOutputSnippet = outputSnippet.length > 120 ? `${outputSnippet.slice(0, 117)}...` : outputSnippet;
		}
		if (this.pendingTaskId === id) this.pendingTaskId = undefined;
		return { ...task };
	}

	/** Returns true if the task hit its maxRuns cap and should be auto-cancelled. */
	hasReachedMaxRuns(id: string): boolean {
		const task = this.tasks.get(id);
		if (!task || task.maxRuns === undefined) return false;
		return task.runCount >= task.maxRuns;
	}
}
