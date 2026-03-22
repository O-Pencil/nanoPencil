export interface LoopTask {
	id: string;
	prompt: string;
	intervalMs: number;
	createdAt: number;
	expiresAt: number;
	lastExecutedAt: number | null;
	executionCount: number;
	jitterMs: number;
	timerId: ReturnType<typeof setTimeout> | null;
}

export interface LoopSchedulerConfig {
	maxTasks: number;
	maxLifetimeMs: number;
	defaultIntervalMs: number;
	minIntervalMs: number;
	maxJitterRatio: number;
	maxJitterMs: number;
}

export type ParsedLoopCommand =
	| { type: "list" }
	| { type: "clear" }
	| { type: "delete"; taskId: string }
	| { type: "create"; prompt: string; intervalMs: number }
	| { type: "help"; reason?: string };
