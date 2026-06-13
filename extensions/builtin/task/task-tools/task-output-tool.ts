/**
 * [WHO]: TaskOutput tool - retrieves task details and current state
 * [FROM]: Claude Code TaskOutputTool (1:1 port)
 * [TO]: Consumed by task extension via registerTool()
 * [HERE]: extensions/builtin/task/task-tools/task-output-tool.ts
 *
 * Supports both CRUD tasks (state-managed) and background bash tasks.
 * Background tasks return their output from the temp file.
 * block=true polls until completion (up to timeout ms).
 */

import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import type { AgentToolResult } from "@catui/agent-core";
import type { ExtensionContext } from "../../../../core/extensions-host/types.js";
import { getTask } from "../task-store.js";
import { DEFAULT_TASK_LIST_ID } from "../task-types.js";
import { getBackgroundTask, readBackgroundTaskOutput } from "../../../../core/tools/bash.js";

const taskOutputSchema = Type.Object({
	task_id: Type.String({ description: "The task ID to get output from" }),
	block: Type.Optional(
		Type.Boolean({
			description: "Whether to wait for task completion (default: true)",
			default: true,
		}),
	),
	timeout: Type.Optional(
		Type.Number({
			description: "Max wait time in ms when blocking (default: 30000)",
			default: 30000,
			minimum: 0,
			maximum: 600000,
		}),
	),
});

export type TaskOutputInput = Static<typeof taskOutputSchema>;

export function createTaskOutputTool() {
	return {
		name: "TaskOutput",
		label: "Task Output",
		description:
			"Retrieve the current state and output of a task. Supports both state-managed tasks and background shell processes.",
		parameters: taskOutputSchema,

		guidance: `Retrieves output from a running or completed task (background shell, agent, or state-managed task).

- Takes a task_id parameter identifying the task
- Returns the task output along with status information
- Use block=true (default) to wait for task completion
- Use block=false for non-blocking check of current status
- Background shell task IDs are returned when using run_in_background=true in Bash
- State-managed task IDs are returned by TaskCreate/TaskList`,

		async execute(
			_toolCallId: string,
			params: TaskOutputInput,
			_signal: AbortSignal | undefined,
			_onUpdate: undefined,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<unknown>> {
			const shouldBlock = params.block !== false;
			const timeout = params.timeout ?? 30000;

			// 1. Try CRUD task store first
			const task = await getTask(ctx.agentDir, DEFAULT_TASK_LIST_ID, params.task_id);
			if (task) {
				const isComplete = task.status === "completed";
				return {
					content: [
						{
							type: "text",
							text: [
								`Task #${task.id}: ${task.subject}`,
								`Status: ${task.status}`,
								`Description: ${task.description}`,
								task.owner ? `Owner: ${task.owner}` : null,
								task.activeForm ? `Active form: ${task.activeForm}` : null,
							]
								.filter(Boolean)
								.join("\n"),
						},
					],
					details: {
						retrieval_status: isComplete ? "success" : task.status === "in_progress" ? "not_ready" : "success",
						task: {
							task_id: task.id,
							task_type: "task",
							status: task.status,
							description: task.description,
							output: task.description,
						},
					},
				};
			}

			// 2. Try background bash task
			const bgTask = getBackgroundTask(params.task_id);
			if (!bgTask) {
				return {
					content: [{ type: "text", text: `No task found with ID: ${params.task_id}` }],
					details: { retrieval_status: "not_ready", task: null },
				};
			}

			// 3. If blocking and still running, poll until completion
			if (shouldBlock && bgTask.status === "running") {
				const deadline = Date.now() + timeout;
				while (bgTask.status === "running" && Date.now() < deadline) {
					await new Promise((r) => setTimeout(r, 500));
				}
			}

			// 4. Return output
			const output = readBackgroundTaskOutput(params.task_id);
			const isComplete = bgTask.status !== "running";

			return {
				content: [
					{
						type: "text",
						text: [
							`Background task: ${params.task_id}`,
							`Status: ${bgTask.status}`,
							bgTask.exitCode !== null ? `Exit code: ${bgTask.exitCode}` : null,
							output ? `\nOutput:\n${output}` : "(no output yet)",
						]
							.filter(Boolean)
							.join("\n"),
					},
				],
				details: {
					retrieval_status: isComplete ? "success" : "not_ready",
					task: {
						task_id: params.task_id,
						task_type: "background_shell",
						status: bgTask.status,
						output: output ?? "",
						exit_code: bgTask.exitCode,
					},
				},
			};
		},
	};
}
