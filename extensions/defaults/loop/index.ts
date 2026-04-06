/**
 * [WHO]: loopExtension
 * [FROM]: ./loop-parser.js, ./loop-controller.js, ./scheduler-parser.js, ./scheduler-controller.js
 * [TO]: Consumed by builtin-extensions.ts, auto-loaded default extension
 * [HERE]: extensions/defaults/loop/index.ts
 */

import type { AgentMessage } from "@pencil-agent/agent-core";
import type { ExtensionAPI, ExtensionCommandContext } from "../../../core/extensions/types.js";
import type { EventBus } from "../../../core/runtime/event-bus.js";
import { buildHelp, parseLoopCommand } from "./loop-parser.js";
import { LoopController } from "./loop-controller.js";
import type { LoopDecision, LoopTaskSnapshot, LoopTaskState } from "./loop-types.js";
import { buildSchedulerHelp, parseSchedulerCommand } from "./scheduler-parser.js";
import { SchedulerController } from "./scheduler-controller.js";
import type { ScheduledLoopTask } from "./scheduler-types.js";

const GRUB_CUSTOM_TYPE = "grub";
const LOOP_CUSTOM_TYPE = "loop";
const LOOP_STATE_START = "<loop-state>";
const LOOP_STATE_END = "</loop-state>";
const SCHEDULER_TICK_MS = 1000;

const LOOP_SYSTEM_PROMPT = `
You are executing inside NanoPencil autonomous grub mode.

Your job is to keep pushing the same goal forward until it is actually complete.
Do not stop just because one reply finished. If more work can be done autonomously, keep the task in progress.

At the end of your final assistant message for this run, append exactly one XML block with a single JSON object:
<loop-state>{"status":"continue|complete|blocked","summary":"short summary","nextStep":"next concrete step when status is continue"}</loop-state>

Rules:
- Use "continue" when the goal still needs more autonomous work.
- Use "complete" only when the requested goal is fully done as far as you can verify.
- Use "blocked" only when you cannot continue without external input, permissions, missing resources, or repeated hard failure.
- Keep "summary" concise and factual.
- Include "nextStep" whenever status is "continue".
- Do not wrap the JSON in markdown fences.
`.trim();

const controllersByBus = new WeakMap<EventBus, LoopController>();
const schedulerByBus = new WeakMap<EventBus, SchedulerController>();
const notifyByBus = new WeakMap<EventBus, (msg: string, type?: "info" | "warning" | "error") => void>();
const schedulerTimerByBus = new WeakMap<EventBus, ReturnType<typeof setInterval>>();

function getController(bus: EventBus): LoopController {
	let controller = controllersByBus.get(bus);
	if (!controller) {
		controller = new LoopController();
		controllersByBus.set(bus, controller);
	}
	return controller;
}

function getScheduler(bus: EventBus): SchedulerController {
	let scheduler = schedulerByBus.get(bus);
	if (!scheduler) {
		scheduler = new SchedulerController();
		schedulerByBus.set(bus, scheduler);
	}
	return scheduler;
}

function recordCustomEvent(pi: ExtensionAPI, customType: string, message: string): void {
	pi.appendEntry(customType, {
		message,
		timestamp: Date.now(),
	});
}

function notify(bus: EventBus, message: string, type: "info" | "warning" | "error" = "info"): void {
	notifyByBus.get(bus)?.(message, type);
}

function publishCustomUpdate(
	pi: ExtensionAPI,
	bus: EventBus,
	customType: string,
	message: string,
	type: "info" | "warning" | "error" = "info",
): void {
	recordCustomEvent(pi, customType, message);
	notify(bus, message, type);
	pi.sendMessage({
		customType,
		content: message,
		display: true,
		details: {
			message,
			level: type,
			timestamp: Date.now(),
		},
	});
}

function publishGrubUpdate(
	pi: ExtensionAPI,
	bus: EventBus,
	message: string,
	type: "info" | "warning" | "error" = "info",
): void {
	publishCustomUpdate(pi, bus, GRUB_CUSTOM_TYPE, message, type);
}

function publishLoopUpdate(
	pi: ExtensionAPI,
	bus: EventBus,
	message: string,
	type: "info" | "warning" | "error" = "info",
): void {
	publishCustomUpdate(pi, bus, LOOP_CUSTOM_TYPE, message, type);
}

function formatDate(timestamp: number): string {
	return new Date(timestamp).toLocaleString();
}

function formatTaskState(task: LoopTaskState): string {
	const lines = [
		`[Grub] Active task ${task.id}`,
		`Status: ${task.status}`,
		`Goal: ${task.goal}`,
		`Started: ${formatDate(task.startedAt)}`,
		`Current iteration: ${task.currentIteration}`,
		`Awaiting result: ${task.awaitingTurn ? "yes" : "no"}`,
		`Consecutive failures: ${task.consecutiveFailures}/${task.maxConsecutiveFailures}`,
		`Max iterations: ${task.maxIterations}`,
	];

	if (task.lastDecision?.summary) {
		lines.push(`Last summary: ${task.lastDecision.summary}`);
	}
	if (task.lastDecision?.nextStep) {
		lines.push(`Last next step: ${task.lastDecision.nextStep}`);
	}
	if (task.lastError) {
		lines.push(`Last error: ${task.lastError}`);
	}

	return lines.join("\n");
}

function formatSnapshot(snapshot: LoopTaskSnapshot): string {
	const lines = [
		`[Grub] Last task ${snapshot.id}`,
		`Status: ${snapshot.status}`,
		`Goal: ${snapshot.goal}`,
		`Started: ${formatDate(snapshot.startedAt)}`,
		`Updated: ${formatDate(snapshot.updatedAt)}`,
		`Completed iterations: ${snapshot.completedIterations}`,
		`Consecutive failures: ${snapshot.consecutiveFailures}`,
	];

	if (snapshot.lastDecision?.summary) {
		lines.push(`Last summary: ${snapshot.lastDecision.summary}`);
	}
	if (snapshot.lastDecision?.nextStep) {
		lines.push(`Last next step: ${snapshot.lastDecision.nextStep}`);
	}
	if (snapshot.lastError) {
		lines.push(`Last error: ${snapshot.lastError}`);
	}

	return lines.join("\n");
}

function appendSystemPrompt(systemPrompt: string): string {
	return `${systemPrompt}\n\n${LOOP_SYSTEM_PROMPT}`;
}

function extractText(message: AgentMessage | undefined): string {
	if (!message || (message as { role?: string }).role !== "assistant") {
		return "";
	}

	const content = (message as { content?: unknown }).content;
	if (typeof content === "string") {
		return content;
	}
	if (!Array.isArray(content)) {
		return "";
	}

	return content
		.filter(
			(part): part is { type: "text"; text: string } =>
				typeof part === "object" &&
				part !== null &&
				"type" in part &&
				(part as { type?: unknown }).type === "text" &&
				typeof (part as { text?: unknown }).text === "string",
		)
		.map((part) => part.text)
		.join("\n");
}

function extractUserText(message: AgentMessage | undefined): string {
	if (!message || (message as { role?: string }).role !== "user") {
		return "";
	}

	const content = (message as { content?: unknown }).content;
	if (typeof content === "string") {
		return content;
	}
	if (!Array.isArray(content)) {
		return "";
	}

	return content
		.filter(
			(part): part is { type: "text"; text: string } =>
				typeof part === "object" &&
				part !== null &&
				"type" in part &&
				(part as { type?: unknown }).type === "text" &&
				typeof (part as { text?: unknown }).text === "string",
		)
		.map((part) => part.text)
		.join("\n");
}

function getLastAssistantMessage(messages: AgentMessage[]): AgentMessage | undefined {
	for (let i = messages.length - 1; i >= 0; i -= 1) {
		if ((messages[i] as { role?: string }).role === "assistant") {
			return messages[i];
		}
	}
	return undefined;
}

function extractLoopDecision(text: string): LoopDecision | undefined {
	const startIndex = text.lastIndexOf(LOOP_STATE_START);
	const endIndex = text.lastIndexOf(LOOP_STATE_END);
	if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
		return undefined;
	}

	const payload = text.slice(startIndex + LOOP_STATE_START.length, endIndex).trim();
	try {
		const parsed = JSON.parse(payload) as Partial<LoopDecision>;
		if (parsed.status !== "continue" && parsed.status !== "complete" && parsed.status !== "blocked") {
			return undefined;
		}

		const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
		const nextStep = typeof parsed.nextStep === "string" ? parsed.nextStep.trim() : undefined;
		if (!summary) {
			return undefined;
		}
		if (parsed.status === "continue" && !nextStep) {
			return undefined;
		}

		return {
			status: parsed.status,
			summary,
			nextStep,
		};
	} catch {
		return undefined;
	}
}

function describeDecision(decision: LoopDecision): string {
	const lines = [`[Grub] Decision: ${decision.status}`, `Summary: ${decision.summary}`];
	if (decision.nextStep) {
		lines.push(`Next step: ${decision.nextStep}`);
	}
	return lines.join("\n");
}

function describeTerminalSnapshot(snapshot: LoopTaskSnapshot | undefined): string {
	if (!snapshot) {
		return "[Grub] No grub task is active.";
	}
	return formatSnapshot(snapshot);
}

function dispatchNextIteration(pi: ExtensionAPI, bus: EventBus, controller: LoopController): void {
	const task = controller.getActiveTask();
	if (!task) {
		return;
	}

	const prompt = controller.buildPrompt();
	controller.markDispatched();
	publishGrubUpdate(pi, bus, `[Grub] Starting iteration ${task.currentIteration} for ${task.id}.`, "info");
	pi.sendUserMessage(prompt, { deliverAs: "followUp" });
}

function formatLoopDate(timestamp: number | undefined): string {
	return timestamp ? new Date(timestamp).toLocaleString() : "never";
}

function summarizeLoopInput(input: string, maxLength = 72): string {
	const trimmed = input.trim();
	return trimmed.length <= maxLength ? trimmed : `${trimmed.slice(0, maxLength - 3)}...`;
}

function formatScheduledTask(task: ScheduledLoopTask): string {
	const lines = [
		`[Loop] Scheduled task ${task.id}`,
		`Every: ${task.intervalLabel}`,
		`Next run: ${formatLoopDate(task.nextRunAt)}`,
		`Last run: ${formatLoopDate(task.lastRunAt)}`,
		`Run count: ${task.runCount}`,
		`Pending dispatch: ${task.pending ? "yes" : "no"}`,
		`Input: ${task.input}`,
	];
	if (task.lastError) {
		lines.push(`Last error: ${task.lastError}`);
	}
	return lines.join("\n");
}

function formatScheduledList(tasks: ScheduledLoopTask[]): string {
	if (tasks.length === 0) {
		return "[Loop] No scheduled tasks are active.";
	}

	return [
		`[Loop] ${tasks.length} scheduled task${tasks.length === 1 ? "" : "s"}:`,
		...tasks.map((task) => `- ${task.id}  every ${task.intervalLabel}  next ${formatLoopDate(task.nextRunAt)}  ${summarizeLoopInput(task.input)}`),
	].join("\n");
}

function maybeDispatchScheduledTask(pi: ExtensionAPI, bus: EventBus): void {
	const scheduler = getScheduler(bus);
	if (!pi.isIdle()) {
		return;
	}

	const dueTask = scheduler.nextDue();
	if (!dueTask) {
		return;
	}

	const task = scheduler.markDispatched(dueTask.id);
	const scheduledInput = task.input.trim();
	publishLoopUpdate(
		pi,
		bus,
		`[Loop] Triggering ${task.id} (${task.intervalLabel}): ${summarizeLoopInput(scheduledInput)}`,
		"info",
	);

	if (scheduledInput.startsWith("/")) {
		void pi.executeCommand(scheduledInput).then((handled) => {
			if (!handled) {
				scheduler.markSettled(task.id, "Unknown slash command.");
				publishLoopUpdate(pi, bus, `[Loop] Failed to run ${task.id}: unknown slash command.`, "error");
				return;
			}

			if (pi.isIdle()) {
				scheduler.markSettled(task.id);
			}
		});
		return;
	}

	pi.sendUserMessage(scheduledInput, { deliverAs: "followUp" });
}

function ensureSchedulerTicker(pi: ExtensionAPI, bus: EventBus): void {
	if (schedulerTimerByBus.has(bus)) {
		return;
	}

	const timer = setInterval(() => {
		maybeDispatchScheduledTask(pi, bus);
	}, SCHEDULER_TICK_MS);
	schedulerTimerByBus.set(bus, timer);
}

export default async function loopExtension(pi: ExtensionAPI) {
	const bus = pi.events;
	const controller = getController(bus);
	getScheduler(bus);
	// Defer scheduler ticker until session starts (runtime must be initialized)
	// ensureSchedulerTicker is called on session_start below

	pi.on("session_start", () => {
		ensureSchedulerTicker(pi, bus);
	});

	pi.on("session_shutdown", () => {
		controller.stop("Session shutdown stopped the grub task.", "stopped");
		const timer = schedulerTimerByBus.get(bus);
		if (timer) {
			clearInterval(timer);
		}
		controllersByBus.delete(bus);
		schedulerByBus.delete(bus);
		schedulerTimerByBus.delete(bus);
		notifyByBus.delete(bus);
	});

	pi.on("before_agent_start", (event) => {
		if (!controller.isLoopPrompt(event.prompt)) {
			return;
		}

		return {
			systemPrompt: appendSystemPrompt(event.systemPrompt),
		};
	});

	pi.on("input", (event) => {
		if (event.source !== "extension" || !event.text.startsWith("[LOOP:")) {
			return;
		}

		if (!controller.isLoopPrompt(event.text)) {
			return { action: "handled" };
		}

		return { action: "continue" };
	});

	pi.on("context", (event) => {
		const lastMessage = event.messages[event.messages.length - 1];
		const lastUserText = extractUserText(lastMessage);
		if (!lastUserText.startsWith("[LOOP:")) {
			return;
		}

		if (controller.isLoopPrompt(lastUserText)) {
			return;
		}

		return {
			messages: event.messages.slice(0, -1),
		};
	});

	pi.on("agent_end", (event) => {
		const activeTask = controller.getActiveTask();
		if (!activeTask?.awaitingTurn) {
			const pendingLoopTask = getScheduler(bus).getPendingTask();
			if (pendingLoopTask) {
				getScheduler(bus).markSettled(pendingLoopTask.id);
				maybeDispatchScheduledTask(pi, bus);
			}
			return;
		}

		const assistantText = extractText(getLastAssistantMessage(event.messages));
		if (!assistantText) {
			const failure = controller.recordFailure("Grub run ended without an assistant message.");
			if (failure.action === "stop") {
				publishGrubUpdate(pi, bus, describeTerminalSnapshot(failure.snapshot), "warning");
				return;
			}
			publishGrubUpdate(
				pi,
				bus,
				`[Grub] Iteration failed. Retrying iteration ${failure.task?.currentIteration}.`,
				"warning",
			);
			dispatchNextIteration(pi, bus, controller);
			return;
		}

		const decision = extractLoopDecision(assistantText);
		if (!decision) {
			const failure = controller.recordFailure("Assistant response did not include a valid <loop-state> block.");
			if (failure.action === "stop") {
				publishGrubUpdate(pi, bus, describeTerminalSnapshot(failure.snapshot), "warning");
				return;
			}
			publishGrubUpdate(
				pi,
				bus,
				`[Grub] Missing or invalid loop-state block. Retrying iteration ${failure.task?.currentIteration}.`,
				"warning",
			);
			dispatchNextIteration(pi, bus, controller);
			return;
		}

		publishGrubUpdate(pi, bus, describeDecision(decision), "info");
		const next = controller.finishTurn(decision);
		if (next.action === "stop") {
			publishGrubUpdate(
				pi,
				bus,
				describeTerminalSnapshot(next.snapshot),
				decision.status === "complete" ? "info" : "warning",
			);
			return;
		}

		dispatchNextIteration(pi, bus, controller);
	});

	const handleGrubCommand = async (args: string, ctx: ExtensionCommandContext) => {
		if (ctx.ui.notify) {
			notifyByBus.set(bus, ctx.ui.notify.bind(ctx.ui));
		}

		const parsed = parseLoopCommand(args);
		if (parsed.type === "help") {
			const reason = parsed.reason === "empty" ? "Missing grub goal." : undefined;
			publishGrubUpdate(pi, bus, buildHelp(reason), "warning");
			return;
		}

		if (parsed.type === "status") {
			const state = controller.getState();
			const message = state.active
				? formatTaskState(state.active)
				: state.lastTerminal
					? formatSnapshot(state.lastTerminal)
					: "[Grub] No grub task has been started in this session.";
			publishGrubUpdate(pi, bus, message, "info");
			return;
		}

		if (parsed.type === "stop") {
			const activeTask = controller.getActiveTask();
			if (!activeTask) {
				publishGrubUpdate(pi, bus, "[Grub] No active grub task is running.", "warning");
				return;
			}

			controller.stop("Stopped by user request.", "stopped");
			if (!ctx.isIdle()) {
				ctx.abort();
			}
			publishGrubUpdate(pi, bus, `[Grub] Stopped grub task ${activeTask.id}.`, "info");
			return;
		}

		try {
			const task = controller.start(parsed.goal);
			publishGrubUpdate(
				pi,
				bus,
				[
					`[Grub] Started autonomous grub task ${task.id}.`,
					`Goal: ${task.goal}`,
					`Safety limits: ${task.maxIterations} iterations, ${task.maxConsecutiveFailures} consecutive failures.`,
				].join("\n"),
				"info",
			);
			dispatchNextIteration(pi, bus, controller);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			publishGrubUpdate(pi, bus, `[Grub] ${message}`, "error");
		}
	};

	const handleLoopCommand = async (args: string, ctx: ExtensionCommandContext) => {
		if (ctx.ui.notify) {
			notifyByBus.set(bus, ctx.ui.notify.bind(ctx.ui));
		}

		const scheduler = getScheduler(bus);
		const parsed = parseSchedulerCommand(args);

		if (parsed.type === "help") {
			publishLoopUpdate(pi, bus, buildSchedulerHelp(parsed.reason), "warning");
			return;
		}

		if (parsed.type === "list") {
			publishLoopUpdate(pi, bus, formatScheduledList(scheduler.list()), "info");
			return;
		}

		if (parsed.type === "clear") {
			const cleared = scheduler.clear();
			publishLoopUpdate(
				pi,
				bus,
				cleared === 0 ? "[Loop] No scheduled tasks were active." : `[Loop] Cleared ${cleared} scheduled task${cleared === 1 ? "" : "s"}.`,
				"info",
			);
			return;
		}

		if (parsed.type === "cancel") {
			const removed = scheduler.cancel(parsed.id);
			publishLoopUpdate(
				pi,
				bus,
				removed ? `[Loop] Cancelled scheduled task ${removed.id}.` : `[Loop] Scheduled task ${parsed.id} was not found.`,
				removed ? "info" : "warning",
			);
			return;
		}

		try {
			const task = scheduler.create(parsed.input, parsed.intervalMs, parsed.intervalLabel);
			publishLoopUpdate(pi, bus, formatScheduledTask(task), "info");
			maybeDispatchScheduledTask(pi, bus);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			publishLoopUpdate(pi, bus, `[Loop] ${message}`, "error");
		}
	};

	pi.registerCommand("grub", {
		description: "Dig through one autonomous task until it is complete, blocked, stopped, or fails.",
		handler: handleGrubCommand,
	});

	pi.registerCommand("loop", {
		description: "Schedule a recurring prompt or slash command for this session.",
		handler: handleLoopCommand,
	});
}
