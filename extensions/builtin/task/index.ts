/**
 * [WHO]: taskExtension - registers TaskCreate, TaskGet, TaskUpdate, TaskList, TaskStop, TaskOutput, ToolSearch
 * [FROM]: Depends on core/extensions-host/types, ./task-store, ./task-tools
 * [TO]: Auto-loaded by builtin-extensions.ts as a default extension
 * [HERE]: extensions/builtin/task/index.ts - task management and tool discovery extension
 *
 * Task list isolation: resolves taskListId per CC semantics (env > team > session ID).
 * Starts fs.watch on the tasks directory for cross-terminal live updates.
 */

import type { ExtensionAPI } from "../../../core/extensions-host/types.js";
import { createTaskCreateTool } from "./task-tools/task-create-tool.js";
import { createTaskGetTool } from "./task-tools/task-get-tool.js";
import { createTaskUpdateTool } from "./task-tools/task-update-tool.js";
import { createTaskListTool } from "./task-tools/task-list-tool.js";
import { createTaskStopTool } from "./task-tools/task-stop-tool.js";
import { createTaskOutputTool } from "./task-tools/task-output-tool.js";
import { createToolSearchTool } from "./task-tools/tool-search-tool.js";
import { getTaskListId, getTasksDir, startTaskFileWatcher, stopAllTaskFileWatchers } from "./task-store.js";

/**
 * Resolve the task list ID for a given context.
 * Called at tool execution time with access to sessionManager.
 */
function resolveTaskListId(ctx: { sessionManager?: { getSessionId?: () => string | undefined } }): string {
	const sessionId = ctx.sessionManager?.getSessionId?.();
	return getTaskListId(sessionId);
}

export default async function taskExtension(api: ExtensionAPI) {
	// Start watching the default tasks directory for cross-terminal live updates.
	// The actual taskListId is resolved per-session at tool execution time,
	// but we start a watcher for the default dir as a baseline.
	const defaultTasksDir = getTasksDir(api.agentDir);
	startTaskFileWatcher(defaultTasksDir);

	// Stop watchers on session shutdown
	api.on("session_shutdown", () => {
		stopAllTaskFileWatchers();
	});

	// Register all 7 tools (taskListId is resolved lazily at execution time)
	api.registerTool(createTaskCreateTool(resolveTaskListId));
	api.registerTool(createTaskGetTool(resolveTaskListId));
	api.registerTool(createTaskUpdateTool(resolveTaskListId));
	api.registerTool(createTaskListTool(resolveTaskListId));
	api.registerTool(createTaskStopTool(resolveTaskListId));
	api.registerTool(createTaskOutputTool(resolveTaskListId));
	api.registerTool(createToolSearchTool(() => api.getAllTools(), resolveTaskListId));
}
