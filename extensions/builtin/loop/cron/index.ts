/**
 * [WHO]: cron module barrel
 * [FROM]: Re-exports ./cron-parser, ./cron-tasks, ./cron-scheduler, ./cron-tasks-lock
 * [TO]: Consumed by loop/index, loop/cron-tools
 * [HERE]: extensions/builtin/loop/cron/index.ts - cron module barrel export
 *
 * Cron module exports: types, parser, task storage, scheduler, lock
 *
 * 1:1 port of Claude Code cron module public API
 */

export type { CronFields } from "./cron-parser.js";
export {
	parseCronExpression,
	computeNextCronRun,
	cronToHuman,
	intervalToCron,
} from "./cron-parser.js";

export type { CronTask, CronJitterConfig } from "./cron-tasks.js";
export {
	DEFAULT_CRON_JITTER_CONFIG,
	getCronFilePath,
	readCronTasks,
	writeCronTasks,
	hasCronTasksSync,
	addCronTask,
	removeCronTasks,
	markCronTasksFired,
	listAllCronTasks,
	nextCronRunMs,
	jitteredNextCronRunMs,
	oneShotJitteredNextCronRunMs,
	findMissedTasks,
	addSessionCronTask,
	getSessionCronTasks,
	removeSessionCronTasks,
} from "./cron-tasks.js";

export { createCronScheduler, isRecurringTaskAged, buildMissedTaskNotification } from "./cron-scheduler.js";
export type { CronScheduler } from "./cron-scheduler.js";

export { tryAcquireSchedulerLock, releaseSchedulerLock } from "./cron-tasks-lock.js";
export type { SchedulerLockOptions } from "./cron-tasks-lock.js";
