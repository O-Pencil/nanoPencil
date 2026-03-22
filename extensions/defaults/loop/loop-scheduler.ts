/**
 * [INPUT]: LoopSchedulerConfig + executeCallback + 可选 onExpired。
 * [OUTPUT]: 定时触发 executeCallback；到期/dispose 时清理定时器。
 * [POS]: extensions/defaults/loop — setTimeout 链式调度，避免堆积。
 */

import type { LoopSchedulerConfig, LoopTask } from "./loop-types.js";
import { randomBytes } from "node:crypto";

const DEFAULT_CONFIG: LoopSchedulerConfig = {
	maxTasks: 50,
	maxLifetimeMs: 3 * 24 * 60 * 60 * 1000,
	defaultIntervalMs: 10 * 60 * 1000,
	minIntervalMs: 60 * 1000,
	maxJitterRatio: 0.1,
	maxJitterMs: 15 * 60 * 1000,
};

export interface LoopSchedulerHooks {
	onExpired?: (task: LoopTask) => void;
}

export class LoopScheduler {
	private readonly tasks: Map<string, LoopTask> = new Map();
	private readonly config: LoopSchedulerConfig;
	private readonly executeCallback: (task: LoopTask) => Promise<void>;
	private readonly hooks: LoopSchedulerHooks;
	private disposed = false;

	constructor(
		config: Partial<LoopSchedulerConfig>,
		executeCallback: (task: LoopTask) => Promise<void>,
		hooks: LoopSchedulerHooks = {},
	) {
		this.config = { ...DEFAULT_CONFIG, ...config };
		this.executeCallback = executeCallback;
		this.hooks = hooks;
	}

	create(prompt: string, intervalMs?: number): LoopTask {
		if (this.disposed) throw new Error("LoopScheduler is disposed");
		const trimmedPrompt = prompt.trim();
		if (!trimmedPrompt) {
			throw new Error("提示词不能为空");
		}
		if (this.tasks.size >= this.config.maxTasks) {
			throw new Error(`任务数已达上限 (${this.config.maxTasks})`);
		}
		let ms = intervalMs ?? this.config.defaultIntervalMs;
		if (ms < this.config.minIntervalMs) ms = this.config.minIntervalMs;

		const id = this.generateTaskId();
		const now = Date.now();
		const jitterMs = this.calculateJitter(id, ms);
		const task: LoopTask = {
			id,
			prompt: trimmedPrompt,
			intervalMs: ms,
			createdAt: now,
			expiresAt: now + this.config.maxLifetimeMs,
			lastExecutedAt: null,
			executionCount: 0,
			jitterMs,
			timerId: null,
		};
		this.tasks.set(id, task);
		this.scheduleNext(task);
		return task;
	}

	delete(taskId: string): boolean {
		const task = this.tasks.get(taskId);
		if (!task) return false;
		this.clearTimer(task);
		this.tasks.delete(taskId);
		return true;
	}

	clear(): void {
		for (const task of this.tasks.values()) {
			this.clearTimer(task);
		}
		this.tasks.clear();
	}

	list(): LoopTask[] {
		return [...this.tasks.values()];
	}

	dispose(): void {
		this.disposed = true;
		this.clear();
	}

	private clearTimer(task: LoopTask): void {
		if (task.timerId !== null) {
			clearTimeout(task.timerId);
			task.timerId = null;
		}
	}

	private scheduleNext(task: LoopTask): void {
		if (this.disposed || !this.tasks.has(task.id)) return;

		this.clearTimer(task);
		// 首次触发带 jitter 打散多任务；之后按固定间隔，避免周期被反复拉长
		const delay = task.executionCount === 0 ? task.intervalMs + task.jitterMs : task.intervalMs;
		task.timerId = setTimeout(() => {
			void this.executeTick(task);
		}, delay);
	}

	private async executeTick(task: LoopTask): Promise<void> {
		if (this.disposed || !this.tasks.has(task.id)) return;

		task.timerId = null;

		try {
			await this.executeCallback(task);
		} catch {
			// 不因回调失败停止调度；费用/日志由上层处理
		}

		task.lastExecutedAt = Date.now();
		task.executionCount += 1;

		if (Date.now() >= task.expiresAt) {
			this.tasks.delete(task.id);
			this.hooks.onExpired?.(task);
			return;
		}

		this.scheduleNext(task);
	}

	private calculateJitter(taskId: string, intervalMs: number): number {
		let h = 0;
		for (let i = 0; i < taskId.length; i++) {
			h = (h * 31 + taskId.charCodeAt(i)) >>> 0;
		}
		const cap = Math.min(intervalMs * this.config.maxJitterRatio, this.config.maxJitterMs);
		if (cap <= 0) return 0;
		const max = Math.floor(cap);
		return h % (max + 1);
	}

	private generateTaskId(): string {
		for (let i = 0; i < 20; i++) {
			const id = randomBytes(4).toString("hex").slice(0, 8);
			if (!this.tasks.has(id)) return id;
		}
		return randomBytes(8).toString("hex").slice(0, 8);
	}
}
