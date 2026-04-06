/**
 * [WHO]: SchedulerController
 * [FROM]: Depends on node:crypto, ./scheduler-types.js
 * [TO]: Consumed by extension entry point (./index.ts)
 * [HERE]: extensions/defaults/loop/scheduler-controller.ts - scheduled loop controller
 */

import { randomBytes } from "node:crypto";
import type { ScheduledLoopTask } from "./scheduler-types.js";

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

	create(input: string, intervalMs: number, intervalLabel: string): ScheduledLoopTask {
		if (this.tasks.size >= MAX_SCHEDULED_TASKS) {
			throw new Error(`Loop already has ${MAX_SCHEDULED_TASKS} scheduled tasks. Clear one before adding another.`);
		}

		const now = Date.now();
		const task: ScheduledLoopTask = {
			id: randomBytes(4).toString("hex").slice(0, 8),
			input: input.trim(),
			intervalMs,
			intervalLabel,
			createdAt: now,
			updatedAt: now,
			nextRunAt: now + intervalMs,
			runCount: 0,
			pending: false,
		};
		this.tasks.set(task.id, task);
		return { ...task };
	}

	cancel(id: string): ScheduledLoopTask | undefined {
		const task = this.tasks.get(id);
		if (!task) return undefined;
		this.tasks.delete(id);
		if (this.pendingTaskId === id) {
			this.pendingTaskId = undefined;
		}
		return { ...task };
	}

	clear(): number {
		const count = this.tasks.size;
		this.tasks.clear();
		this.pendingTaskId = undefined;
		return count;
	}

	nextDue(now = Date.now()): ScheduledLoopTask | undefined {
		if (this.pendingTaskId) return undefined;
		return this.list().find((task) => task.nextRunAt <= now);
	}

	markDispatched(id: string, now = Date.now()): ScheduledLoopTask {
		const task = this.tasks.get(id);
		if (!task) {
			throw new Error(`Unknown loop task: ${id}`);
		}

		task.pending = true;
		task.lastRunAt = now;
		task.nextRunAt = now + task.intervalMs;
		task.updatedAt = now;
		task.runCount += 1;
		task.lastError = undefined;
		this.pendingTaskId = id;
		return { ...task };
	}

	markSettled(id: string, error?: string): ScheduledLoopTask | undefined {
		const task = this.tasks.get(id);
		if (!task) return undefined;
		task.pending = false;
		task.updatedAt = Date.now();
		task.lastError = error;
		if (this.pendingTaskId === id) {
			this.pendingTaskId = undefined;
		}
		return { ...task };
	}
}
