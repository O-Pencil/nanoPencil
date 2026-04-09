/**
 * [WHO]: GrubController - drives autonomous iterative tasks
 * [FROM]: Depends on node:crypto, ./grub-types
 * [TO]: Consumed by extension entry point (./index.ts)
 * [HERE]: extensions/defaults/grub/grub-controller.ts - state machine for /grub iterations
 */

import { randomBytes } from "node:crypto";
import type {
	GrubControllerState,
	GrubDecision,
	GrubTaskSnapshot,
	GrubTaskState,
} from "./grub-types.js";

const DEFAULT_MAX_ITERATIONS = 25;
const DEFAULT_MAX_CONSECUTIVE_FAILURES = 3;

export class GrubController {
	private activeTask?: GrubTaskState;
	private lastTerminalTask?: GrubTaskSnapshot;

	getState(): GrubControllerState {
		return {
			active: this.activeTask ? { ...this.activeTask } : undefined,
			lastTerminal: this.lastTerminalTask ? { ...this.lastTerminalTask } : undefined,
		};
	}

	hasActiveTask(): boolean {
		return this.activeTask !== undefined;
	}

	getActiveTask(): GrubTaskState | undefined {
		return this.activeTask;
	}

	start(goal: string): GrubTaskState {
		const trimmedGoal = goal.trim();
		if (!trimmedGoal) {
			throw new Error("Grub goal cannot be empty.");
		}
		if (this.activeTask) {
			throw new Error(`Grub ${this.activeTask.id} is already running. Stop it before starting a new one.`);
		}

		const now = Date.now();
		const task: GrubTaskState = {
			id: this.generateTaskId(),
			goal: trimmedGoal,
			status: "running",
			startedAt: now,
			updatedAt: now,
			currentIteration: 1,
			awaitingTurn: false,
			consecutiveFailures: 0,
			maxIterations: DEFAULT_MAX_ITERATIONS,
			maxConsecutiveFailures: DEFAULT_MAX_CONSECUTIVE_FAILURES,
		};

		this.activeTask = task;
		return task;
	}

	stop(reason: string, status: GrubTaskSnapshot["status"] = "stopped"): GrubTaskSnapshot | undefined {
		if (!this.activeTask) {
			return this.lastTerminalTask;
		}

		const task = this.activeTask;
		const snapshot: GrubTaskSnapshot = {
			id: task.id,
			goal: task.goal,
			status,
			startedAt: task.startedAt,
			updatedAt: Date.now(),
			completedIterations: Math.max(0, task.currentIteration - (task.awaitingTurn ? 1 : 0)),
			consecutiveFailures: task.consecutiveFailures,
			lastDecision: task.lastDecision,
			lastError: reason || task.lastError,
		};

		this.activeTask = undefined;
		this.lastTerminalTask = snapshot;
		return snapshot;
	}

	isGrubPrompt(prompt: string): boolean {
		return this.activeTask !== undefined && prompt.startsWith(this.getPromptPrefix(this.activeTask.id));
	}

	buildPrompt(): string {
		if (!this.activeTask) {
			throw new Error("No active grub task.");
		}

		const task = this.activeTask;
		const sections = [
			`${this.getPromptPrefix(task.id)}${task.currentIteration}]`,
			"",
			"Autonomous grub goal:",
			task.goal,
			"",
			"You are inside a managed grub loop. Continue making concrete progress on this same goal.",
			"Use tools, edit files, run checks, and verify results as needed.",
		];

		if (task.lastDecision?.summary) {
			sections.push("", "Previous summary:", task.lastDecision.summary);
		}

		if (task.lastDecision?.nextStep) {
			sections.push("", "Previous planned next step:", task.lastDecision.nextStep);
		}

		if (task.lastError) {
			sections.push("", "Recovery note:", task.lastError);
		}

		sections.push(
			"",
			"Do not stop just because one query finished. Only decide `complete` when the goal is actually done.",
			"If you need another autonomous pass, end with a valid <loop-state> block so the system can continue automatically.",
		);

		return sections.join("\n");
	}

	markDispatched(): GrubTaskState {
		if (!this.activeTask) {
			throw new Error("No active grub task.");
		}
		this.activeTask.awaitingTurn = true;
		this.activeTask.updatedAt = Date.now();
		return this.activeTask;
	}

	finishTurn(decision: GrubDecision): { action: "continue" | "stop"; task?: GrubTaskState; snapshot?: GrubTaskSnapshot } {
		if (!this.activeTask) {
			return { action: "stop", snapshot: this.lastTerminalTask };
		}

		const task = this.activeTask;
		task.awaitingTurn = false;
		task.consecutiveFailures = 0;
		task.lastError = undefined;
		task.lastDecision = decision;
		task.updatedAt = Date.now();

		if (decision.status === "complete") {
			return { action: "stop", snapshot: this.stop("Grub goal completed.", "complete") };
		}
		if (decision.status === "blocked") {
			return { action: "stop", snapshot: this.stop("Grub reported it is blocked.", "blocked") };
		}

		if (task.currentIteration >= task.maxIterations) {
			return {
				action: "stop",
				snapshot: this.stop(`Grub hit the iteration limit (${task.maxIterations}).`, "failed"),
			};
		}

		task.currentIteration += 1;
		return { action: "continue", task: { ...task } };
	}

	recordFailure(message: string): { action: "continue" | "stop"; task?: GrubTaskState; snapshot?: GrubTaskSnapshot } {
		if (!this.activeTask) {
			return { action: "stop", snapshot: this.lastTerminalTask };
		}

		const task = this.activeTask;
		task.awaitingTurn = false;
		task.consecutiveFailures += 1;
		task.lastError = message;
		task.updatedAt = Date.now();

		if (task.consecutiveFailures >= task.maxConsecutiveFailures) {
			return {
				action: "stop",
				snapshot: this.stop(
					`Grub stopped after ${task.consecutiveFailures} consecutive failures. Last error: ${message}`,
					"failed",
				),
			};
		}

		if (task.currentIteration >= task.maxIterations) {
			return {
				action: "stop",
				snapshot: this.stop(`Grub hit the iteration limit (${task.maxIterations}).`, "failed"),
			};
		}

		task.currentIteration += 1;
		return { action: "continue", task: { ...task } };
	}

	private getPromptPrefix(taskId: string): string {
		return `[GRUB:${taskId}:`;
	}

	private generateTaskId(): string {
		return randomBytes(4).toString("hex").slice(0, 8);
	}
}
