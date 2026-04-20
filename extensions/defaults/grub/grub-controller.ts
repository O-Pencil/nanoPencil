/**
 * [WHO]: GrubController - drives autonomous iterative tasks with durable state and completion validation
 * [FROM]: Depends on node:crypto, node:path, ./grub-types, ./grub-persistence, ./grub-feature-list
 * [TO]: Consumed by extension entry point (./index.ts)
 * [HERE]: extensions/defaults/grub/grub-controller.ts - state machine for /grub iterations with cross-session persistence and feature-list-gated completion
 */

import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { allPassing, firstPending, readFeatureList } from "./grub-feature-list.js";
import { persistState, stateFilePathFor } from "./grub-persistence.js";
import type {
	GrubControllerState,
	GrubDecision,
	GrubTaskSnapshot,
	GrubTaskState,
} from "./grub-types.js";

const DEFAULT_MAX_ITERATIONS = 25;
const DEFAULT_MAX_CONSECUTIVE_FAILURES = 3;

export interface GrubStartOptions {
	maxIterations?: number;
	maxConsecutiveFailures?: number;
}

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

	start(goal: string, cwd: string, options: GrubStartOptions = {}): GrubTaskState {
		const trimmedGoal = goal.trim();
		if (!trimmedGoal) {
			throw new Error("Grub goal cannot be empty.");
		}
		if (this.activeTask) {
			throw new Error(`Grub ${this.activeTask.id} is already running. Stop it before starting a new one.`);
		}

		const now = Date.now();
		const id = this.generateTaskId();
		const harnessDirectory = join(cwd, ".grub", id);
		const task: GrubTaskState = {
			id,
			goal: trimmedGoal,
			status: "running",
			phase: "initializer",
			startedAt: now,
			updatedAt: now,
			currentIteration: 1,
			awaitingTurn: false,
			consecutiveFailures: 0,
			maxIterations: options.maxIterations ?? DEFAULT_MAX_ITERATIONS,
			maxConsecutiveFailures: options.maxConsecutiveFailures ?? DEFAULT_MAX_CONSECUTIVE_FAILURES,
			harnessDirectory,
			featureChecklistPath: join(harnessDirectory, "feature-checklist.md"),
			featureListPath: join(harnessDirectory, "feature-list.json"),
			stateFilePath: stateFilePathFor(harnessDirectory),
			progressLogPath: join(harnessDirectory, "progress-log.md"),
			initScriptPath: join(harnessDirectory, "init.sh"),
		};

		this.activeTask = task;
		this.safePersist(task);
		return task;
	}

	/**
	 * Adopt a previously persisted task, e.g. after process restart. Does not
	 * auto-dispatch the next iteration; the caller decides whether to continue.
	 */
	adoptResumedTask(task: GrubTaskState): GrubTaskState {
		if (this.activeTask && this.activeTask.id !== task.id) {
			throw new Error(`Cannot adopt task ${task.id}; ${this.activeTask.id} is already active.`);
		}
		const resumed: GrubTaskState = { ...task, awaitingTurn: false, updatedAt: Date.now() };
		this.activeTask = resumed;
		this.safePersist(resumed);
		return resumed;
	}

	stop(reason: string, status: GrubTaskSnapshot["status"] = "stopped"): GrubTaskSnapshot | undefined {
		if (!this.activeTask) {
			return this.lastTerminalTask;
		}

		const task = this.activeTask;
		const finalTask: GrubTaskState = { ...task, status, updatedAt: Date.now(), awaitingTurn: false };
		this.safePersist(finalTask);

		const snapshot: GrubTaskSnapshot = {
			id: finalTask.id,
			goal: finalTask.goal,
			status,
			phase: finalTask.phase,
			startedAt: finalTask.startedAt,
			updatedAt: finalTask.updatedAt,
			completedIterations: Math.max(0, finalTask.currentIteration - (task.awaitingTurn ? 1 : 0)),
			consecutiveFailures: finalTask.consecutiveFailures,
			harnessDirectory: finalTask.harnessDirectory,
			featureChecklistPath: finalTask.featureChecklistPath,
			featureListPath: finalTask.featureListPath,
			stateFilePath: finalTask.stateFilePath,
			progressLogPath: finalTask.progressLogPath,
			initScriptPath: finalTask.initScriptPath,
			lastDecision: finalTask.lastDecision,
			lastError: reason || finalTask.lastError,
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
			"You are inside a managed grub harness. Keep making concrete progress on the same goal.",
			"Use tools, edit files, run checks, and verify results as needed.",
			"",
			"Harness files (must stay up to date every iteration):",
			`- Feature list (JSON): ${task.featureListPath}`,
			`- Progress log: ${task.progressLogPath}`,
			`- Session init script: ${task.initScriptPath}`,
		];

		if (task.phase === "initializer") {
			sections.push(
				"",
				"Initializer phase requirements:",
				"1. Replace the placeholder feature-list.json with 15-40 concrete, testable slices. Every entry MUST keep the schema {id, category, description, steps[], passes:false}.",
				"2. Ensure init.sh contains reliable startup checks and make it executable.",
				"3. Append a clear initialization summary in progress-log.md.",
				"4. Do not attempt broad implementation yet; prepare a strong harness first.",
				"5. End this turn with loop-state status=continue unless the goal is already complete/blocked.",
			);
		} else {
			sections.push(
				"",
				"Execution phase requirements:",
				"1. Start by running the init script, then read feature-list.json and progress-log.md.",
				"2. Pick exactly one feature with passes:false and execute it end-to-end.",
				"3. Run relevant verification (tests, smoke checks, or runtime checks).",
				"4. Flip ONLY the passes/evidence fields for that feature; other fields are immutable.",
				"5. Append progress log and git-commit before finishing the turn.",
				"6. Keep each iteration incremental and production-safe.",
			);
		}

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
			"Do not stop just because one query finished. Only decide `complete` when every feature in feature-list.json has passes:true.",
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
		this.safePersist(this.activeTask);
		return this.activeTask;
	}

	/**
	 * Validate a completion decision against the feature-list. If the decision
	 * says `complete` but the persisted feature-list still has pending entries,
	 * the decision is downgraded to `continue` with a synthetic nextStep.
	 * Returns the (possibly rewritten) decision.
	 */
	validateCompletion(decision: GrubDecision): { decision: GrubDecision; downgraded: boolean; reason?: string } {
		if (decision.status !== "complete" || !this.activeTask) {
			return { decision, downgraded: false };
		}
		const list = readFeatureList(this.activeTask.featureListPath);
		if (!list) {
			const rewritten: GrubDecision = {
				status: "continue",
				summary: decision.summary,
				nextStep: "feature-list.json is missing or invalid; the initializer must produce it before claiming complete.",
			};
			return {
				decision: rewritten,
				downgraded: true,
				reason: "feature-list.json missing or invalid",
			};
		}
		if (allPassing(list)) {
			return { decision, downgraded: false };
		}
		const pending = firstPending(list);
		const rewritten: GrubDecision = {
			status: "continue",
			summary: decision.summary,
			nextStep: pending
				? `Complete pending feature: ${pending.id} (${pending.description})`
				: "Complete the remaining pending features before declaring done.",
		};
		return {
			decision: rewritten,
			downgraded: true,
			reason: `feature-list still has ${list.features.length - list.features.filter((f) => f.passes).length} pending entries`,
		};
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
		if (task.phase === "initializer") {
			task.phase = "execution";
		}

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
		this.safePersist(task);
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
		this.safePersist(task);
		return { action: "continue", task: { ...task } };
	}

	private getPromptPrefix(taskId: string): string {
		return `[GRUB:${taskId}:`;
	}

	private generateTaskId(): string {
		return randomBytes(4).toString("hex").slice(0, 8);
	}

	private safePersist(task: GrubTaskState): void {
		try {
			persistState(task);
		} catch (error) {
			// Persistence is best-effort; failure must not break the state machine.
			const message = error instanceof Error ? error.message : String(error);
			// Surface to console so operators can see disk issues.
			console.error(`[Grub] Failed to persist task ${task.id} state: ${message}`);
		}
	}
}
