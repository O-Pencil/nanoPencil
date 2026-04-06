/**
 * [WHO]: ScheduledLoopTask, ParsedSchedulerCommand
 * [FROM]: No external dependencies
 * [TO]: Consumed by extension entry point (./index.ts)
 * [HERE]: extensions/defaults/loop/scheduler-types.ts - scheduled loop types
 */

export interface ScheduledLoopTask {
	id: string;
	input: string;
	intervalMs: number;
	intervalLabel: string;
	createdAt: number;
	updatedAt: number;
	nextRunAt: number;
	lastRunAt?: number;
	runCount: number;
	pending: boolean;
	lastError?: string;
}

export type ParsedSchedulerCommand =
	| { type: "help"; reason?: "empty" | "interval" | "input" | "cancel" }
	| { type: "list" }
	| { type: "clear" }
	| { type: "cancel"; id: string }
	| { type: "start"; input: string; intervalMs: number; intervalLabel: string };
