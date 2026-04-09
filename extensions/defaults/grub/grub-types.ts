/**
 * [WHO]: GrubStatus, GrubDecisionStatus, GrubDecision, GrubTaskState, GrubTaskSnapshot, GrubControllerState, ParsedGrubCommand
 * [FROM]: No external dependencies
 * [TO]: Consumed by ./grub-controller.ts, ./grub-parser.ts, ./index.ts
 * [HERE]: extensions/defaults/grub/grub-types.ts - grub task type definitions
 */
export type GrubStatus = "running" | "complete" | "blocked" | "stopped" | "failed";

export type GrubDecisionStatus = "continue" | "complete" | "blocked";

export interface GrubDecision {
	status: GrubDecisionStatus;
	summary: string;
	nextStep?: string;
}

export interface GrubTaskState {
	id: string;
	goal: string;
	status: GrubStatus;
	startedAt: number;
	updatedAt: number;
	currentIteration: number;
	awaitingTurn: boolean;
	consecutiveFailures: number;
	maxIterations: number;
	maxConsecutiveFailures: number;
	lastDecision?: GrubDecision;
	lastError?: string;
}

export interface GrubTaskSnapshot {
	id: string;
	goal: string;
	status: GrubStatus;
	startedAt: number;
	updatedAt: number;
	completedIterations: number;
	consecutiveFailures: number;
	lastDecision?: GrubDecision;
	lastError?: string;
}

export interface GrubControllerState {
	active?: GrubTaskState;
	lastTerminal?: GrubTaskSnapshot;
}

export type ParsedGrubCommand =
	| { type: "start"; goal: string }
	| { type: "status" }
	| { type: "stop" }
	| { type: "help"; reason?: string };
