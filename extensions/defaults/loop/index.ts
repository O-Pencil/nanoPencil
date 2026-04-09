/**
 * [WHO]: loopExtension default export - registers /loop scheduler command + loop renderer
 * [FROM]: Depends on @pencil-agent/agent-core, @pencil-agent/tui, core/extensions/types, core/runtime/event-bus, ./scheduler-controller, ./scheduler-parser, ./scheduler-types
 * [TO]: Auto-loaded by builtin-extensions.ts as a default extension
 * [HERE]: extensions/defaults/loop/index.ts - session-scoped recurring prompt/command scheduler with pause/resume/run-now/max-runs/quiet
 */

import type { AgentMessage } from "@pencil-agent/agent-core";
import { Box, Container, Spacer, Text } from "@pencil-agent/tui";
import type { ExtensionAPI, ExtensionCommandContext } from "../../../core/extensions/types.js";
import type { EventBus } from "../../../core/runtime/event-bus.js";
import { SchedulerController } from "./scheduler-controller.js";
import { buildSchedulerHelp, parseSchedulerCommand } from "./scheduler-parser.js";
import type { ScheduledLoopTask } from "./scheduler-types.js";

const LOOP_CUSTOM_TYPE = "loop";
const SCHEDULER_TICK_MS = 1000;

const schedulerByBus = new WeakMap<EventBus, SchedulerController>();
const notifyByBus = new WeakMap<EventBus, (msg: string, type?: "info" | "warning" | "error") => void>();
const schedulerTimerByBus = new WeakMap<EventBus, ReturnType<typeof setInterval>>();

function getScheduler(bus: EventBus): SchedulerController {
	let scheduler = schedulerByBus.get(bus);
	if (!scheduler) {
		scheduler = new SchedulerController();
		schedulerByBus.set(bus, scheduler);
	}
	return scheduler;
}

function notify(bus: EventBus, message: string, type: "info" | "warning" | "error" = "info"): void {
	notifyByBus.get(bus)?.(message, type);
}

function publishLoopUpdate(
	pi: ExtensionAPI,
	bus: EventBus,
	message: string,
	type: "info" | "warning" | "error" = "info",
	options: { quiet?: boolean } = {},
): void {
	pi.appendEntry(LOOP_CUSTOM_TYPE, { message, level: type, timestamp: Date.now() });
	// Quiet loops still record errors and terminal events to the UI; routine
	// info ticks are recorded only via appendEntry above.
	if (options.quiet && type === "info") return;
	notify(bus, message, type);
	pi.sendMessage({
		customType: LOOP_CUSTOM_TYPE,
		content: message,
		display: true,
		details: { message, level: type, timestamp: Date.now() },
	});
}

function formatRelative(ms: number): string {
	if (ms <= 0) return "now";
	const sec = Math.round(ms / 1000);
	if (sec < 60) return `${sec}s`;
	const min = Math.floor(sec / 60);
	const remSec = sec % 60;
	if (min < 60) return remSec ? `${min}m ${remSec}s` : `${min}m`;
	const hr = Math.floor(min / 60);
	const remMin = min % 60;
	if (hr < 24) return remMin ? `${hr}h ${remMin}m` : `${hr}h`;
	const day = Math.floor(hr / 24);
	const remHr = hr % 24;
	return remHr ? `${day}d ${remHr}h` : `${day}d`;
}

function formatLoopDate(timestamp: number | undefined): string {
	return timestamp ? new Date(timestamp).toLocaleString() : "never";
}

function summarizeLoopInput(input: string, maxLength = 72): string {
	const trimmed = input.trim();
	return trimmed.length <= maxLength ? trimmed : `${trimmed.slice(0, maxLength - 3)}...`;
}

function refLabel(task: ScheduledLoopTask): string {
	return task.name ? `${task.name} (${task.id})` : task.id;
}

function formatScheduledTask(task: ScheduledLoopTask): string {
	const now = Date.now();
	const status = task.paused
		? "paused"
		: task.pending
			? "pending"
			: task.nextRunAt <= now
				? "due"
				: "scheduled";
	const lines = [
		`[Loop] ${refLabel(task)} — ${status}`,
		`Every: ${task.intervalLabel}`,
		`Kind: ${task.kind}${task.quiet ? " (quiet)" : ""}`,
		`Next run: ${formatLoopDate(task.nextRunAt)} (in ${formatRelative(task.nextRunAt - now)})`,
		`Last run: ${formatLoopDate(task.lastRunAt)}`,
		`Run count: ${task.runCount}${task.maxRuns ? `/${task.maxRuns}` : ""}`,
		`Input: ${task.input}`,
	];
	if (task.lastOutputSnippet) lines.push(`Last output: ${task.lastOutputSnippet}`);
	if (task.lastError) lines.push(`Last error: ${task.lastError}`);
	return lines.join("\n");
}

function formatScheduledList(tasks: ScheduledLoopTask[]): string {
	if (tasks.length === 0) return "[Loop] No scheduled tasks are active.";
	const now = Date.now();
	return [
		`[Loop] ${tasks.length} scheduled task${tasks.length === 1 ? "" : "s"}:`,
		...tasks.map((task) => {
			const flags: string[] = [];
			if (task.paused) flags.push("paused");
			if (task.quiet) flags.push("quiet");
			if (task.maxRuns) flags.push(`max ${task.runCount}/${task.maxRuns}`);
			const flagStr = flags.length ? ` [${flags.join(", ")}]` : "";
			const next = task.paused ? "paused" : `next in ${formatRelative(task.nextRunAt - now)}`;
			return `- ${refLabel(task)}  every ${task.intervalLabel}  ${next}${flagStr}  ${summarizeLoopInput(task.input)}`;
		}),
	].join("\n");
}

function extractAssistantText(message: AgentMessage | undefined): string {
	if (!message || (message as { role?: string }).role !== "assistant") return "";
	const content = (message as { content?: unknown }).content;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
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
		if ((messages[i] as { role?: string }).role === "assistant") return messages[i];
	}
	return undefined;
}

function maybeDispatchScheduledTask(pi: ExtensionAPI, bus: EventBus): void {
	const scheduler = getScheduler(bus);
	if (!pi.isIdle()) return;

	const dueTask = scheduler.nextDue();
	if (!dueTask) return;

	const task = scheduler.markDispatched(dueTask.id);
	const scheduledInput = task.input.trim();
	publishLoopUpdate(
		pi,
		bus,
		`[Loop] Triggering ${refLabel(task)} (${task.intervalLabel}): ${summarizeLoopInput(scheduledInput)}`,
		"info",
		{ quiet: task.quiet },
	);

	if (task.kind === "command") {
		void pi.executeCommand(scheduledInput).then((handled) => {
			if (!handled) {
				scheduler.markSettled(task.id, "Unknown slash command.");
				publishLoopUpdate(pi, bus, `[Loop] Failed to run ${refLabel(task)}: unknown slash command.`, "error");
				return;
			}

			if (pi.isIdle()) {
				scheduler.markSettled(task.id);
				maybeAutoCancel(pi, bus, task.id);
			}
		});
		return;
	}

	pi.sendUserMessage(scheduledInput, { deliverAs: "followUp" });
}

function maybeAutoCancel(pi: ExtensionAPI, bus: EventBus, id: string): void {
	const scheduler = getScheduler(bus);
	if (!scheduler.hasReachedMaxRuns(id)) return;
	const task = scheduler.cancel(id);
	if (!task) return;
	publishLoopUpdate(
		pi,
		bus,
		`[Loop] ${refLabel(task)} hit its max runs (${task.maxRuns}); auto-cancelled.`,
		"info",
	);
}

function ensureSchedulerTicker(pi: ExtensionAPI, bus: EventBus): void {
	if (schedulerTimerByBus.has(bus)) return;
	const timer = setInterval(() => {
		maybeDispatchScheduledTask(pi, bus);
	}, SCHEDULER_TICK_MS);
	schedulerTimerByBus.set(bus, timer);
}

export default async function loopExtension(pi: ExtensionAPI) {
	const bus = pi.events;
	getScheduler(bus);

	pi.registerMessageRenderer(LOOP_CUSTOM_TYPE, (message, _options, theme) => {
		const text =
			typeof message.content === "string"
				? message.content
				: message.content
						.filter((part): part is { type: "text"; text: string } => part.type === "text")
						.map((part) => part.text)
						.join("\n");

		const level =
			typeof message.details === "object" && message.details !== null && "level" in message.details
				? ((message.details as { level?: string }).level ?? "info")
				: "info";
		const colorKey = level === "error" ? "error" : level === "warning" ? "warning" : "dim";

		const box = new Box(1, 1, (value) => theme.bg("customMessageBg", value));
		box.addChild(new Text(theme.fg(colorKey, text), 0, 0));

		const container = new Container();
		container.addChild(new Spacer(1));
		container.addChild(box);
		return container;
	});

	pi.on("session_start", () => {
		ensureSchedulerTicker(pi, bus);
	});

	pi.on("session_shutdown", () => {
		const timer = schedulerTimerByBus.get(bus);
		if (timer) clearInterval(timer);
		schedulerByBus.delete(bus);
		schedulerTimerByBus.delete(bus);
		notifyByBus.delete(bus);
	});

	pi.on("agent_end", (event) => {
		const scheduler = getScheduler(bus);
		const pendingLoopTask = scheduler.getPendingTask();
		if (!pendingLoopTask) return;

		const assistantText = extractAssistantText(getLastAssistantMessage(event.messages));
		const snippet = assistantText.replace(/\s+/g, " ").trim() || undefined;
		scheduler.markSettled(pendingLoopTask.id, undefined, snippet);
		maybeAutoCancel(pi, bus, pendingLoopTask.id);
		maybeDispatchScheduledTask(pi, bus);
	});

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

		if (parsed.type === "status") {
			const task = scheduler.resolve(parsed.ref);
			if (!task) {
				publishLoopUpdate(pi, bus, `[Loop] No scheduled task matches "${parsed.ref}".`, "warning");
				return;
			}
			publishLoopUpdate(pi, bus, formatScheduledTask(task), "info");
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
			const removed = scheduler.cancel(parsed.ref);
			publishLoopUpdate(
				pi,
				bus,
				removed ? `[Loop] Cancelled ${refLabel(removed)}.` : `[Loop] No scheduled task matches "${parsed.ref}".`,
				removed ? "info" : "warning",
			);
			return;
		}

		if (parsed.type === "pause") {
			const paused = scheduler.pause(parsed.ref);
			publishLoopUpdate(
				pi,
				bus,
				paused ? `[Loop] Paused ${refLabel(paused)}.` : `[Loop] No scheduled task matches "${parsed.ref}".`,
				paused ? "info" : "warning",
			);
			return;
		}

		if (parsed.type === "resume") {
			const resumed = scheduler.resume(parsed.ref);
			publishLoopUpdate(
				pi,
				bus,
				resumed ? `[Loop] Resumed ${refLabel(resumed)}; next run in ${formatRelative(resumed.intervalMs)}.` : `[Loop] No scheduled task matches "${parsed.ref}".`,
				resumed ? "info" : "warning",
			);
			return;
		}

		if (parsed.type === "run") {
			const triggered = scheduler.forceDue(parsed.ref);
			if (!triggered) {
				publishLoopUpdate(pi, bus, `[Loop] No scheduled task matches "${parsed.ref}".`, "warning");
				return;
			}
			publishLoopUpdate(pi, bus, `[Loop] Forcing ${refLabel(triggered)} to run now.`, "info");
			maybeDispatchScheduledTask(pi, bus);
			return;
		}

		try {
			const task = scheduler.create({
				input: parsed.input,
				kind: parsed.kind,
				intervalMs: parsed.intervalMs,
				intervalLabel: parsed.intervalLabel,
				name: parsed.name,
				maxRuns: parsed.maxRuns,
				quiet: parsed.quiet,
			});
			publishLoopUpdate(pi, bus, formatScheduledTask(task), "info");
			maybeDispatchScheduledTask(pi, bus);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			publishLoopUpdate(pi, bus, `[Loop] ${message}`, "error");
		}
	};

	pi.registerCommand("loop", {
		description: "Schedule a recurring prompt or slash command for this session.",
		handler: handleLoopCommand,
	});
}
