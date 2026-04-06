/**
 * [WHO]: TeamCommandMode, TeamRunStatus, TeamWorkerMode, TeamWorkerSpec, TeamPlan
 * [FROM]: No external dependencies
 * [TO]: Consumed by extension entry point (./index.ts)
 * [HERE]: extensions/defaults/team/team-types.ts - team types
 */
export type TeamCommandMode = "auto" | "research" | "execute";

export type TeamRunStatus = "running" | "completed" | "failed" | "stopped";

export type TeamWorkerMode = "plan" | "research" | "implementation" | "review";

export interface TeamWorkerSpec {
	id: string;
	role: string;
	mode: TeamWorkerMode;
	task: string;
	writeAccess?: boolean;
}

export interface TeamPlan {
	summary: string;
	executionMode: "research_only" | "implement_and_review";
	researchWorkers: TeamWorkerSpec[];
	implementationTask?: string;
	reviewTask?: string;
}

export interface TeamWorkerResult {
	id: string;
	role: string;
	mode: TeamWorkerMode;
	status: "success" | "blocked" | "failed";
	summary: string;
	findings: string[];
	changedFiles: string[];
	handoff?: string;
	rawOutput: string;
	error?: string;
}

export interface TeamRunReport {
	id: string;
	goal: string;
	mode: TeamCommandMode;
	status: TeamRunStatus;
	startedAt: number;
	finishedAt: number;
	plan: TeamPlan;
	results: TeamWorkerResult[];
	finalSummary: string;
	artifactPath?: string;
}

export interface TeamRunState {
	id: string;
	goal: string;
	mode: TeamCommandMode;
	status: TeamRunStatus;
	startedAt: number;
	updatedAt: number;
	stage: string;
	plan?: TeamPlan;
	results: TeamWorkerResult[];
	lastError?: string;
	lastWorkerSummary?: string;
}
