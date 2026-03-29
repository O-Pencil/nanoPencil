export type LoopStatus = "running" | "complete" | "blocked" | "stopped" | "failed";

export type LoopDecisionStatus = "continue" | "complete" | "blocked";

export interface LoopDecision {
	status: LoopDecisionStatus;
	summary: string;
	nextStep?: string;
}

export interface LoopTaskState {
	id: string;
	goal: string;
	status: LoopStatus;
	startedAt: number;
	updatedAt: number;
	currentIteration: number;
	awaitingTurn: boolean;
	consecutiveFailures: number;
	maxIterations: number;
	maxConsecutiveFailures: number;
	lastDecision?: LoopDecision;
	lastError?: string;
}

export interface LoopTaskSnapshot {
	id: string;
	goal: string;
	status: LoopStatus;
	startedAt: number;
	updatedAt: number;
	completedIterations: number;
	consecutiveFailures: number;
	lastDecision?: LoopDecision;
	lastError?: string;
}

export interface LoopControllerState {
	active?: LoopTaskState;
	lastTerminal?: LoopTaskSnapshot;
}

export type ParsedLoopCommand =
	| { type: "start"; goal: string }
	| { type: "status" }
	| { type: "stop" }
	| { type: "help"; reason?: string };
