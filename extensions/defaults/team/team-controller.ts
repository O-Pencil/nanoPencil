/**
 * [UPSTREAM]: 
 * [SURFACE]: 
 * [LOCUS]: extensions/defaults/team/team-controller.ts - 
 * [COVENANT]: Change → update this header
 */
import type { TeamCommandMode, TeamRunReport, TeamRunState, TeamRunStatus } from "./team-types.js";

function createId(): string {
	return Math.random().toString(16).slice(2, 10);
}

export class TeamController {
	private active?: TeamRunState;
	private last?: TeamRunReport;
	private abortControllers = new Set<AbortController>();

	start(goal: string, mode: TeamCommandMode): TeamRunState {
		if (this.active) {
			throw new Error(`A team run is already active (${this.active.id}). Stop it before starting another one.`);
		}

		const now = Date.now();
		this.active = {
			id: createId(),
			goal,
			mode,
			status: "running",
			startedAt: now,
			updatedAt: now,
			stage: "planning",
			results: [],
		};
		return this.active;
	}

	getActive(): TeamRunState | undefined {
		return this.active;
	}

	getLast(): TeamRunReport | undefined {
		return this.last;
	}

	hydrateActive(state: TeamRunState): void {
		this.active = { ...state };
	}

	hydrateLast(report: TeamRunReport): void {
		this.last = { ...report };
	}

	registerAbortController(controller: AbortController): void {
		this.abortControllers.add(controller);
	}

	unregisterAbortController(controller: AbortController): void {
		this.abortControllers.delete(controller);
	}

	update(patch: Partial<TeamRunState>): void {
		if (!this.active) return;
		this.active = {
			...this.active,
			...patch,
			updatedAt: Date.now(),
		};
	}

	appendResult(result: TeamRunState["results"][number]): void {
		if (!this.active) return;
		this.active.results = [...this.active.results, result];
		this.active.lastWorkerSummary = `${result.role}: ${result.summary}`;
		this.active.updatedAt = Date.now();
	}

	stop(reason = "Stopped by user request."): TeamRunReport | undefined {
		if (!this.active) return undefined;
		for (const controller of this.abortControllers) {
			controller.abort();
		}
		this.abortControllers.clear();
		return this.finish("stopped", reason);
	}

	finish(status: TeamRunStatus, finalSummary: string): TeamRunReport | undefined {
		if (!this.active) return undefined;
		const report: TeamRunReport = {
			id: this.active.id,
			goal: this.active.goal,
			mode: this.active.mode,
			status,
			startedAt: this.active.startedAt,
			finishedAt: Date.now(),
			plan: this.active.plan ?? {
				summary: "No plan captured.",
				executionMode: "research_only",
				researchWorkers: [],
			},
			results: [...this.active.results],
			finalSummary,
		};
		this.last = report;
		this.active = undefined;
		this.abortControllers.clear();
		return report;
	}
}
