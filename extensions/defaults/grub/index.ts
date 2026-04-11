/**
 * [WHO]: grubExtension default export - registers /grub command and grub renderer
 * [FROM]: Depends on @pencil-agent/agent-core, @pencil-agent/tui, core/extensions/types, core/runtime/event-bus, ./grub-controller, ./grub-parser, ./grub-types
 * [TO]: Auto-loaded by builtin-extensions.ts as a default extension
 * [HERE]: extensions/defaults/grub/index.ts - autonomous iterative task runner extracted from the legacy loop extension
 */

import type { AgentMessage } from "@pencil-agent/agent-core";
import { Box, Container, Spacer, Text } from "@pencil-agent/tui";
import type { ExtensionAPI, ExtensionCommandContext } from "../../../core/extensions/types.js";
import type { EventBus } from "../../../core/runtime/event-bus.js";
import { GrubController } from "./grub-controller.js";
import { buildGrubHelp, parseGrubCommand } from "./grub-parser.js";
import type { GrubDecision, GrubTaskSnapshot, GrubTaskState } from "./grub-types.js";

const GRUB_CUSTOM_TYPE = "grub";
const LOOP_STATE_START = "<loop-state>";
const LOOP_STATE_END = "</loop-state>";

const GRUB_SYSTEM_PROMPT = `
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

const controllersByBus = new WeakMap<EventBus, GrubController>();
const notifyByBus = new WeakMap<EventBus, (msg: string, type?: "info" | "warning" | "error") => void>();

function getController(bus: EventBus): GrubController {
	let controller = controllersByBus.get(bus);
	if (!controller) {
		controller = new GrubController();
		controllersByBus.set(bus, controller);
	}
	return controller;
}

function notify(bus: EventBus, message: string, type: "info" | "warning" | "error" = "info"): void {
	notifyByBus.get(bus)?.(message, type);
}

function publishGrubUpdate(
	api: ExtensionAPI,
	bus: EventBus,
	message: string,
	type: "info" | "warning" | "error" = "info",
): void {
	api.appendEntry(GRUB_CUSTOM_TYPE, { message, timestamp: Date.now() });
	notify(bus, message, type);
	api.sendMessage({
		customType: GRUB_CUSTOM_TYPE,
		content: message,
		display: true,
		details: { message, level: type, timestamp: Date.now() },
	});
}

function formatDate(timestamp: number): string {
	return new Date(timestamp).toLocaleString();
}

function formatTaskState(task: GrubTaskState): string {
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

	if (task.lastDecision?.summary) lines.push(`Last summary: ${task.lastDecision.summary}`);
	if (task.lastDecision?.nextStep) lines.push(`Last next step: ${task.lastDecision.nextStep}`);
	if (task.lastError) lines.push(`Last error: ${task.lastError}`);

	return lines.join("\n");
}

function formatSnapshot(snapshot: GrubTaskSnapshot): string {
	const lines = [
		`[Grub] Last task ${snapshot.id}`,
		`Status: ${snapshot.status}`,
		`Goal: ${snapshot.goal}`,
		`Started: ${formatDate(snapshot.startedAt)}`,
		`Updated: ${formatDate(snapshot.updatedAt)}`,
		`Completed iterations: ${snapshot.completedIterations}`,
		`Consecutive failures: ${snapshot.consecutiveFailures}`,
	];

	if (snapshot.lastDecision?.summary) lines.push(`Last summary: ${snapshot.lastDecision.summary}`);
	if (snapshot.lastDecision?.nextStep) lines.push(`Last next step: ${snapshot.lastDecision.nextStep}`);
	if (snapshot.lastError) lines.push(`Last error: ${snapshot.lastError}`);

	return lines.join("\n");
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

function extractUserText(message: AgentMessage | undefined): string {
	if (!message || (message as { role?: string }).role !== "user") return "";
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
		if ((messages[i] as { role?: string }).role === "assistant") {
			return messages[i];
		}
	}
	return undefined;
}

function extractGrubDecision(text: string): GrubDecision | undefined {
	const startIndex = text.lastIndexOf(LOOP_STATE_START);
	const endIndex = text.lastIndexOf(LOOP_STATE_END);
	if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) return undefined;

	const payload = text.slice(startIndex + LOOP_STATE_START.length, endIndex).trim();
	try {
		const parsed = JSON.parse(payload) as Partial<GrubDecision>;
		if (parsed.status !== "continue" && parsed.status !== "complete" && parsed.status !== "blocked") {
			return undefined;
		}

		const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
		const nextStep = typeof parsed.nextStep === "string" ? parsed.nextStep.trim() : undefined;
		if (!summary) return undefined;
		if (parsed.status === "continue" && !nextStep) return undefined;

		return { status: parsed.status, summary, nextStep };
	} catch {
		return undefined;
	}
}

function describeDecision(decision: GrubDecision): string {
	const lines = [`[Grub] Decision: ${decision.status}`, `Summary: ${decision.summary}`];
	if (decision.nextStep) lines.push(`Next step: ${decision.nextStep}`);
	return lines.join("\n");
}

function describeTerminalSnapshot(snapshot: GrubTaskSnapshot | undefined): string {
	if (!snapshot) return "[Grub] No grub task is active.";
	return formatSnapshot(snapshot);
}

function dispatchNextIteration(api: ExtensionAPI, bus: EventBus, controller: GrubController): void {
	const task = controller.getActiveTask();
	if (!task) return;

	const prompt = controller.buildPrompt();
	controller.markDispatched();
	publishGrubUpdate(api, bus, `[Grub] Starting iteration ${task.currentIteration} for ${task.id}.`, "info");
	api.sendUserMessage(prompt, { deliverAs: "followUp" });
}

export default async function grubExtension(api: ExtensionAPI) {
	const bus = api.events;
	const controller = getController(bus);

	api.registerMessageRenderer(GRUB_CUSTOM_TYPE, (message, _options, theme) => {
		const text =
			typeof message.content === "string"
				? message.content
				: message.content
						.filter((part): part is { type: "text"; text: string } => part.type === "text")
						.map((part) => part.text)
						.join("\n");

		const box = new Box(1, 1, (value) => theme.bg("customMessageBg", value));
		box.addChild(new Text(theme.fg("dim", text), 0, 0));

		const container = new Container();
		container.addChild(new Spacer(1));
		container.addChild(box);
		return container;
	});

	api.on("session_shutdown", () => {
		controller.stop("Session shutdown stopped the grub task.", "stopped");
		controllersByBus.delete(bus);
		notifyByBus.delete(bus);
	});

	api.on("before_agent_start", (event) => {
		if (!controller.isGrubPrompt(event.prompt)) return;
		return { appendSystemPrompt: GRUB_SYSTEM_PROMPT };
	});

	api.on("input", (event) => {
		if (event.source !== "extension" || !event.text.startsWith("[GRUB:")) return;
		if (!controller.isGrubPrompt(event.text)) return { action: "handled" };
		return { action: "continue" };
	});

	api.on("context", (event) => {
		const lastMessage = event.messages[event.messages.length - 1];
		const lastUserText = extractUserText(lastMessage);
		if (!lastUserText.startsWith("[GRUB:")) return;
		if (controller.isGrubPrompt(lastUserText)) return;
		return { messages: event.messages.slice(0, -1) };
	});

	api.on("agent_end", (event) => {
		const activeTask = controller.getActiveTask();
		if (!activeTask?.awaitingTurn) return;

		const assistantText = extractAssistantText(getLastAssistantMessage(event.messages));
		if (!assistantText) {
			const failure = controller.recordFailure("Grub run ended without an assistant message.");
			if (failure.action === "stop") {
				publishGrubUpdate(api, bus, describeTerminalSnapshot(failure.snapshot), "warning");
				return;
			}
			publishGrubUpdate(
				api,
				bus,
				`[Grub] Iteration failed. Retrying iteration ${failure.task?.currentIteration}.`,
				"warning",
			);
			dispatchNextIteration(api, bus, controller);
			return;
		}

		const decision = extractGrubDecision(assistantText);
		if (!decision) {
			const failure = controller.recordFailure("Assistant response did not include a valid <loop-state> block.");
			if (failure.action === "stop") {
				publishGrubUpdate(api, bus, describeTerminalSnapshot(failure.snapshot), "warning");
				return;
			}
			publishGrubUpdate(
				api,
				bus,
				`[Grub] Missing or invalid loop-state block. Retrying iteration ${failure.task?.currentIteration}.`,
				"warning",
			);
			dispatchNextIteration(api, bus, controller);
			return;
		}

		publishGrubUpdate(api, bus, describeDecision(decision), "info");
		const next = controller.finishTurn(decision);
		if (next.action === "stop") {
			publishGrubUpdate(
				api,
				bus,
				describeTerminalSnapshot(next.snapshot),
				decision.status === "complete" ? "info" : "warning",
			);
			return;
		}

		dispatchNextIteration(api, bus, controller);
	});

	const handleGrubCommand = async (args: string, ctx: ExtensionCommandContext) => {
		if (ctx.ui.notify) {
			notifyByBus.set(bus, ctx.ui.notify.bind(ctx.ui));
		}

		const parsed = parseGrubCommand(args);
		if (parsed.type === "help") {
			const reason = parsed.reason === "empty" ? "Missing grub goal." : undefined;
			publishGrubUpdate(api, bus, buildGrubHelp(reason), "warning");
			return;
		}

		if (parsed.type === "status") {
			const state = controller.getState();
			const message = state.active
				? formatTaskState(state.active)
				: state.lastTerminal
					? formatSnapshot(state.lastTerminal)
					: "[Grub] No grub task has been started in this session.";
			publishGrubUpdate(api, bus, message, "info");
			return;
		}

		if (parsed.type === "stop") {
			const activeTask = controller.getActiveTask();
			if (!activeTask) {
				publishGrubUpdate(api, bus, "[Grub] No active grub task is running.", "warning");
				return;
			}

			controller.stop("Stopped by user request.", "stopped");
			if (!ctx.isIdle()) {
				ctx.abort();
			}
			publishGrubUpdate(api, bus, `[Grub] Stopped grub task ${activeTask.id}.`, "info");
			return;
		}

		try {
			const task = controller.start(parsed.goal);
			publishGrubUpdate(
				api,
				bus,
				[
					`[Grub] Started autonomous grub task ${task.id}.`,
					`Goal: ${task.goal}`,
					`Safety limits: ${task.maxIterations} iterations, ${task.maxConsecutiveFailures} consecutive failures.`,
				].join("\n"),
				"info",
			);
			dispatchNextIteration(api, bus, controller);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			publishGrubUpdate(api, bus, `[Grub] ${message}`, "error");
		}
	};

	api.registerCommand("grub", {
		description: "Dig through one autonomous task until it is complete, blocked, stopped, or fails.",
		handler: handleGrubCommand,
	});
}
