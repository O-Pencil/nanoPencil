/**
 * Loop extension: autonomous goal execution until the task is complete.
 */
/**
 * [UPSTREAM]: Depends on ./loop-parser.js, ./loop-controller.js
 * [SURFACE]: Extension interface
 * [LOCUS]: extensions/defaults/loop/index.ts - 
 * [COVENANT]: Change → update this header
 */


import type { AgentMessage } from "@pencil-agent/agent-core";
import type { ExtensionAPI, ExtensionCommandContext } from "../../../core/extensions/types.js";
import type { EventBus } from "../../../core/runtime/event-bus.js";
import { buildHelp, parseLoopCommand } from "./loop-parser.js";
import { LoopController } from "./loop-controller.js";
import type { LoopDecision, LoopTaskSnapshot, LoopTaskState } from "./loop-types.js";

const LOOP_CUSTOM_TYPE = "loop";
const LOOP_STATE_START = "<loop-state>";
const LOOP_STATE_END = "</loop-state>";

const LOOP_SYSTEM_PROMPT = `
You are executing inside NanoPencil autonomous loop mode.

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
const notifyByBus = new WeakMap<EventBus, (msg: string, type?: "info" | "warning" | "error") => void>();

function getController(bus: EventBus): LoopController {
	let controller = controllersByBus.get(bus);
	if (!controller) {
		controller = new LoopController();
		controllersByBus.set(bus, controller);
	}
	return controller;
}

function recordLoopEvent(pi: ExtensionAPI, message: string): void {
	pi.appendEntry(LOOP_CUSTOM_TYPE, {
		message,
		timestamp: Date.now(),
	});
}

function publishLoopUpdate(
	pi: ExtensionAPI,
	bus: EventBus,
	message: string,
	type: "info" | "warning" | "error" = "info",
): void {
	recordLoopEvent(pi, message);
	notify(bus, message, type);
	pi.sendMessage({
		customType: LOOP_CUSTOM_TYPE,
		content: message,
		display: true,
		details: {
			message,
			level: type,
			timestamp: Date.now(),
		},
	});
}

function notify(bus: EventBus, message: string, type: "info" | "warning" | "error" = "info"): void {
	notifyByBus.get(bus)?.(message, type);
}

function formatDate(timestamp: number): string {
	return new Date(timestamp).toLocaleString();
}

function summarizeGoal(goal: string, maxLength = 80): string {
	const trimmed = goal.trim();
	if (trimmed.length <= maxLength) {
		return trimmed;
	}
	return `${trimmed.slice(0, maxLength - 3)}...`;
}

function formatTaskState(task: LoopTaskState): string {
	const lines = [
		`[Loop] Active loop ${task.id}`,
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
		`[Loop] Last loop ${snapshot.id}`,
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
		if (
			parsed.status !== "continue" &&
			parsed.status !== "complete" &&
			parsed.status !== "blocked"
		) {
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
		const lines = payload
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter(Boolean);
		if (lines.length === 0) {
			return undefined;
		}

		const getValue = (...prefixes: string[]): string | undefined => {
			const line = lines.find((entry) =>
				prefixes.some((prefix) => entry.toLowerCase().startsWith(prefix.toLowerCase())),
			);
			if (!line) {
				return undefined;
			}
			const separatorIndex = line.indexOf(":");
			if (separatorIndex === -1) {
				return undefined;
			}
			return line.slice(separatorIndex + 1).trim();
		};

		const rawStatus = getValue("status:", "状态:");
		const normalizedStatus =
			rawStatus === "complete" || rawStatus === "完成"
				? "complete"
				: rawStatus === "continue" || rawStatus === "继续" || rawStatus === "in_progress"
					? "continue"
					: rawStatus === "blocked" || rawStatus === "阻塞"
						? "blocked"
						: undefined;
		if (!normalizedStatus) {
			return undefined;
		}

		const summary =
			getValue("summary:", "摘要:", "已完成工作:", "completed work:") ??
			lines.filter((line) => !line.startsWith("-")).slice(1).join(" ").trim();
		if (!summary) {
			return undefined;
		}

		const nextStep = getValue("next step:", "下一步:");
		if (normalizedStatus === "continue" && !nextStep) {
			return undefined;
		}

		return {
			status: normalizedStatus,
			summary,
			nextStep,
		};
	}
}

function describeDecision(decision: LoopDecision): string {
	const lines = [
		`[Loop] Decision: ${decision.status}`,
		`Summary: ${decision.summary}`,
	];
	if (decision.nextStep) {
		lines.push(`Next step: ${decision.nextStep}`);
	}
	return lines.join("\n");
}

function describeTerminalSnapshot(snapshot: LoopTaskSnapshot | undefined): string {
	if (!snapshot) {
		return "[Loop] No loop task is active.";
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
	publishLoopUpdate(
		pi,
		bus,
		`[Loop] Starting iteration ${task.currentIteration} for ${task.id}.`,
		"info",
	);
	pi.sendUserMessage(prompt, { deliverAs: "followUp" });
}

export default async function loopExtension(pi: ExtensionAPI) {
	const bus = pi.events;
	const controller = getController(bus);

	pi.on("session_shutdown", () => {
		controller.stop("Session shutdown stopped the loop.", "stopped");
		controllersByBus.delete(bus);
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
			return;
		}

		const assistantText = extractText(getLastAssistantMessage(event.messages));
		if (!assistantText) {
			const failure = controller.recordFailure("Loop run ended without an assistant message.");
			if (failure.action === "stop") {
				const message = describeTerminalSnapshot(failure.snapshot);
				publishLoopUpdate(pi, bus, message, "warning");
				return;
			}
			publishLoopUpdate(
				pi,
				bus,
				`[Loop] Iteration failed. Retrying iteration ${failure.task?.currentIteration}.`,
				"warning",
			);
			dispatchNextIteration(pi, bus, controller);
			return;
		}

		const decision = extractLoopDecision(assistantText);
		if (!decision) {
			const failure = controller.recordFailure(
				"Assistant response did not include a valid <loop-state> block.",
			);
			if (failure.action === "stop") {
				const message = describeTerminalSnapshot(failure.snapshot);
				publishLoopUpdate(pi, bus, message, "warning");
				return;
			}
			publishLoopUpdate(
				pi,
				bus,
				`[Loop] Missing or invalid loop-state block. Retrying iteration ${failure.task?.currentIteration}.`,
				"warning",
			);
			dispatchNextIteration(pi, bus, controller);
			return;
		}

		publishLoopUpdate(pi, bus, describeDecision(decision), "info");
		const next = controller.finishTurn(decision);
		if (next.action === "stop") {
			const message = describeTerminalSnapshot(next.snapshot);
			publishLoopUpdate(pi, bus, message, decision.status === "complete" ? "info" : "warning");
			return;
		}

		dispatchNextIteration(pi, bus, controller);
	});

	pi.registerCommand("loop", {
		description: "Run one autonomous task until it is complete, blocked, stopped, or fails.",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			if (ctx.ui.notify) {
				notifyByBus.set(bus, ctx.ui.notify.bind(ctx.ui));
			}

			const parsed = parseLoopCommand(args);
			if (parsed.type === "help") {
				const reason = parsed.reason === "empty" ? "Missing loop goal." : undefined;
				const help = buildHelp(reason);
				publishLoopUpdate(pi, bus, help, "warning");
				return;
			}

			if (parsed.type === "status") {
				const state = controller.getState();
				const message = state.active
					? formatTaskState(state.active)
					: state.lastTerminal
						? formatSnapshot(state.lastTerminal)
						: "[Loop] No loop task has been started in this session.";
				publishLoopUpdate(pi, bus, message, "info");
				return;
			}

			if (parsed.type === "stop") {
				const activeTask = controller.getActiveTask();
				if (!activeTask) {
					const message = "[Loop] No active loop is running.";
					publishLoopUpdate(pi, bus, message, "warning");
					return;
				}

				controller.stop("Stopped by user request.", "stopped");
				if (!ctx.isIdle()) {
					ctx.abort();
				}
				const message = `[Loop] Stopped loop ${activeTask.id}.`;
				publishLoopUpdate(pi, bus, message, "info");
				return;
			}

			try {
				const task = controller.start(parsed.goal);
				const message = [
					`[Loop] Started autonomous loop ${task.id}.`,
					`Goal: ${task.goal}`,
					`Safety limits: ${task.maxIterations} iterations, ${task.maxConsecutiveFailures} consecutive failures.`,
				].join("\n");
				publishLoopUpdate(pi, bus, message, "info");
				dispatchNextIteration(pi, bus, controller);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				const output = `[Loop] ${message}`;
				publishLoopUpdate(pi, bus, output, "error");
			}
		},
	});
}
