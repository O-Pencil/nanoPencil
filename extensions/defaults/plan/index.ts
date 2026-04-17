/**
 * [WHO]: planExtension - registers /plan command, EnterPlanMode/ExitPlanMode tools, plan mode state management, permission gating, and workflow prompt injection
 * [FROM]: Depends on core/extensions/types, ./types, ./plan-file-manager, ./plan-permissions, ./plan-workflow-prompt, ./enter-plan-mode-tool, ./exit-plan-mode-tool, ./plan-agents
 * [TO]: Auto-loaded by builtin-extensions.ts as a default extension
 * [HERE]: extensions/defaults/plan/index.ts - main plan mode extension entry point
 */

import type { ExtensionAPI, ExtensionCommandContext, ToolCallEvent, ToolCallEventResult } from "../../../core/extensions/types.js";
import {
	getPlanSessionState,
	getPlanFilePath,
	getPlan,
	writePlan,
	getPlansDirectory,
} from "./plan-file-manager.js";
import {
	handlePlanModeTransition,
	handlePlanModeExit,
	shouldAllowToolCall,
} from "./plan-permissions.js";
import {
	getPlanModeInstructions,
	getPlanModeExitInstructions,
	getPlanModeReentryInstructions,
} from "./plan-workflow-prompt.js";
import { createEnterPlanModeTool } from "./enter-plan-mode-tool.js";
import { createExitPlanModeTool } from "./exit-plan-mode-tool.js";
import type { PlanSessionState } from "./types.js";

// ============================================================================
// Constants
// ============================================================================

const PLAN_ATTACHMENT_CONFIG = {
	TURNS_BETWEEN_ATTACHMENTS: 3,
	FULL_REMINDER_EVERY_N: 3,
};

// ============================================================================
// State helpers
// ============================================================================

function getSessionState(api: ExtensionAPI): PlanSessionState {
	return getPlanSessionState(api.events);
}

// ============================================================================
// Plan mode entry helper
// ============================================================================

async function enterPlanMode(
	api: ExtensionAPI,
	ctx: ExtensionCommandContext,
	shouldQuery: boolean,
): Promise<void> {
	const sessionState = getSessionState(api);
	const previousMode = sessionState.state.mode;

	handlePlanModeTransition(sessionState);
	sessionState.state.prePlanMode = previousMode;
	sessionState.state.mode = "plan";

	// Set plan mode status in the TUI footer (like Claude Code)
	ctx.ui.setStatus("plan", "📋 Plan mode");

	// Show a visible banner (Claude Code style)
	ctx.ui.notify([
		"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
		"📋 PLAN MODE ENABLED",
		"",
		"You are now in Plan Mode.",
		"• Only read-only tools are available",
		"• Edit only the plan file (shown in workflow prompt)",
		"• Call ExitPlanMode when done planning",
		"• Type /plan:validate to check plan structure",
		"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
	].join("\n"), "info");

	if (shouldQuery) {
		// Send a follow-up message to trigger the agent to start planning
		api.sendUserMessage("I've entered plan mode. Please start exploring and designing an approach.", { deliverAs: "followUp" });
	}
}

// ============================================================================
// Tool gating helper
// ============================================================================

function hasTool(api: ExtensionAPI, name: string): boolean {
	const activeTools = api.getActiveTools();
	return activeTools.includes(name);
}

// ============================================================================
// Plan display helper
// ============================================================================

function displayPlan(api: ExtensionAPI, ctx: ExtensionCommandContext): void {
	const planFilePath = getPlanFilePath(api.events);
	const planContent = getPlan(api.events);

	if (!planContent) {
		ctx.ui.notify("Already in plan mode. No plan written yet.", "warning");
		return;
	}

	const output = [
		"Current Plan",
		`Path: ${planFilePath}`,
		"",
		planContent,
	];

	ctx.ui.notify(output.join("\n"), "info");
}

// ============================================================================
// Extension entry point
// ============================================================================

export default async function planExtension(api: ExtensionAPI) {
	// =========================================================================
	// Register tools
	// =========================================================================

	const enterPlanModeTool = createEnterPlanModeTool(
		api,
		() => getSessionState(api),
		() => false, // channels not implemented in nanoPencil
	);

	const exitPlanModeTool = createExitPlanModeTool(
		api,
		() => getSessionState(api),
		() => hasTool(api, "Agent") || hasTool(api, "Task"),
	);

	api.registerTool(enterPlanModeTool);
	api.registerTool(exitPlanModeTool);

	// =========================================================================
	// /plan command handler
	// =========================================================================

	const handlePlanCommand = async (args: string, ctx: ExtensionCommandContext) => {
		const sessionState = getSessionState(api);
		const currentMode = sessionState.state.mode;

		// Not in plan mode: enter plan mode
		if (currentMode !== "plan") {
			const trimmed = args.trim();
			const shouldQuery = trimmed.length > 0 && trimmed !== "open";
			await enterPlanMode(api, ctx, shouldQuery);
			ctx.ui.notify("Enabled plan mode", "info");
			return;
		}

		// Already in plan mode
		const trimmed = args.trim();

		if (trimmed === "open") {
			// Open plan file in inline editor
			const planFilePath = getPlanFilePath(api.events);
			const existingPlan = getPlan(api.events) || "";

			const editedContent = await ctx.ui.editor("Edit Plan", existingPlan);

			if (editedContent !== undefined) {
				// User saved the plan
				writePlan(api.events, editedContent);
				ctx.ui.notify(`Plan saved to: ${planFilePath}`, "info");
			} else {
				ctx.ui.notify("Plan editing cancelled.", "info");
			}
			return;
		}

		// Display plan content
		displayPlan(api, ctx);
	};

	api.registerCommand("plan", {
		description: "Enable plan mode or view the current session plan",
		handler: handlePlanCommand,
	});

	// =========================================================================
	// /plan:validate command - validate current plan structure
	// =========================================================================

	const handlePlanValidateCommand = async (args: string, ctx: ExtensionCommandContext) => {
		const { validatePlan, formatValidationMessage } = await import("./plan-validation.js");

		const planFilePath = getPlanFilePath(api.events);
		const planContent = getPlan(api.events);

		if (!planContent) {
			ctx.ui.notify("No plan found. Write a plan first using the write tool.", "warning");
			return;
		}

		const result = validatePlan(planContent);
		const message = formatValidationMessage(result);

		if (result.valid) {
			ctx.ui.notify(`Plan validation passed:\n${message}`, "info");
		} else {
			ctx.ui.notify(`Plan validation failed:\n${message}`, "warning");
		}
	};

	api.registerCommand("plan:validate", {
		description: "Validate the current plan structure",
		handler: handlePlanValidateCommand,
	});

	// =========================================================================
	// /plan:approve command - approve a teammate's plan (for team leaders)
	// =========================================================================

	const handlePlanApproveCommand = async (args: string, ctx: ExtensionCommandContext) => {
		const fs = await import("node:fs");
		const os = await import("node:os");
		const path = await import("node:path");

		const mailDir = path.join(os.homedir(), ".nanopencil", "agent", "team-mail");
		const requestId = args.trim();

		if (!requestId) {
			// List pending approval requests
			if (!fs.existsSync(mailDir)) {
				ctx.ui.notify("No pending plan approval requests.", "info");
				return;
			}

			const files = fs.readdirSync(mailDir).filter((f) => f.startsWith("plan_approval-") && f.endsWith(".json"));
			if (files.length === 0) {
				ctx.ui.notify("No pending plan approval requests.", "info");
				return;
			}

			const requests = files.map((file) => {
				const content = fs.readFileSync(path.join(mailDir, file), "utf-8");
				const request = JSON.parse(content);
				return `- Request ID: ${request.requestId}\n  From: ${request.from}\n  Time: ${new Date(request.timestamp).toLocaleString()}`;
			});

			ctx.ui.notify(
				"Pending plan approval requests:\n\n" + requests.join("\n\n") + "\n\nUse `/plan:approve <request-id>` to approve.",
				"info",
			);
			return;
		}

		// Find the request
		const requestFile = path.join(mailDir, `${requestId}.json`);
		if (!fs.existsSync(requestFile)) {
			ctx.ui.notify(`Request not found: ${requestId}`, "error");
			return;
		}

		// Read and display the request
		const requestContent = fs.readFileSync(requestFile, "utf-8");
		const request = JSON.parse(requestContent);

		// Create response
		const response = {
			type: "plan_approval_response",
			requestId,
			approved: true,
			approvedBy: "leader",
			timestamp: new Date().toISOString(),
		};

		// Write response file
		const responseFile = path.join(mailDir, `response-${requestId}.json`);
		fs.writeFileSync(responseFile, JSON.stringify(response, null, 2), "utf-8");

		// Show the plan content
		ctx.ui.notify(
			`Plan approved for ${request.from}.\n\nPlan content:\n\`\`\`\n${request.planContent.slice(0, 500)}${request.planContent.length > 500 ? "\n...(truncated)" : ""}\n\`\`\`\n\nThe teammate can now proceed with implementation.`,
			"info",
		);
	};

	api.registerCommand("plan:approve", {
		description: "Approve a teammate's plan (for team leaders)",
		handler: handlePlanApproveCommand,
	});

	// =========================================================================
	// Permission gating: block write tools in plan mode
	// =========================================================================

	api.on("tool_call", (event: ToolCallEvent): ToolCallEventResult | void => {
		const sessionState = getSessionState(api);
		if (sessionState.state.mode !== "plan") return;

		const toolCall = {
			toolName: event.toolName,
			toolCallId: event.toolCallId,
			input: event.input,
		};

		const planFilePath = getPlanFilePath(api.events);
		const result = shouldAllowToolCall(toolCall, planFilePath);

		if (!result.allowed) {
			return { block: true, reason: result.reason };
		}
	});

	// =========================================================================
	// System prompt injection: plan mode workflow
	// =========================================================================

	api.on("before_agent_start", async (_event, ctx) => {
		const sessionState = getSessionState(api);
		const { mode, needsPlanModeExitAttachment, hasExitedPlanModeInSession, planAttachmentCount } = sessionState.state;

		// Exit attachment: injected once after plan mode exit
		if (mode !== "plan" && needsPlanModeExitAttachment) {
			sessionState.state.needsPlanModeExitAttachment = false;
			const planFilePath = getPlanFilePath(api.events);
			const planExists = getPlan(api.events) !== null;
			return {
				appendSystemPrompt: getPlanModeExitInstructions(planFilePath, planExists),
			};
		}

		// Plan mode: inject workflow prompt
		if (mode === "plan") {
			const planFilePath = getPlanFilePath(api.events);
			const existingPlan = getPlan(api.events);

			// Reentry detection
			if (hasExitedPlanModeInSession && existingPlan !== null) {
				sessionState.state.hasExitedPlanModeInSession = false;
				// Prepend reentry instructions
				const reentry = getPlanModeReentryInstructions(planFilePath);
				const workflow = getPlanModeInstructions(sessionState, planFilePath, existingPlan, "full");
				return {
					appendSystemPrompt: reentry + "\n\n" + workflow,
				};
			}

			// Throttle: sparse reminder if we've sent recently
			const shouldFullReminder = planAttachmentCount % PLAN_ATTACHMENT_CONFIG.FULL_REMINDER_EVERY_N === 0;
			const reminderType = shouldFullReminder ? "full" : "sparse";

			sessionState.state.planAttachmentCount += 1;

			const prompt = getPlanModeInstructions(sessionState, planFilePath, existingPlan, reminderType);
			return {
				appendSystemPrompt: prompt,
			};
		}
	});

	// =========================================================================
	// Session lifecycle
	// =========================================================================

	api.on("session_start", (_event, ctx) => {
		// Initialize plan directory
		getPlansDirectory();

		// Restore plan mode status if we're in plan mode (session restored while in plan mode)
		const sessionState = getSessionState(api);
		if (sessionState.state.mode === "plan") {
			ctx.ui.setStatus("plan", "📋 Plan mode");
		}
	});

	api.on("session_shutdown", () => {
		// Cleanup: nothing needed for plan mode
	});
}
