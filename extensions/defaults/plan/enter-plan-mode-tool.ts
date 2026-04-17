/**
 * [WHO]: createEnterPlanModeTool()
 * [FROM]: Depends on @sinclair/typebox, core/extensions/types, ./types, ./plan-permissions, ./plan-workflow-prompt
 * [TO]: Consumed by plan extension index.ts
 * [HERE]: extensions/defaults/plan/enter-plan-mode-tool.ts - EnterPlanMode tool for model-initiated plan mode entry
 */

import { Type, type Static } from "@sinclair/typebox";
import type { ExtensionAPI, ToolDefinition } from "../../../core/extensions/types.js";
import type { PlanSessionState } from "./types.js";
import { handlePlanModeTransition } from "./plan-permissions.js";
import { getEnterPlanModeToolResult } from "./plan-workflow-prompt.js";

// ============================================================================
// Schema
// ============================================================================

const EnterPlanModeInputSchema = Type.Object({});

type EnterPlanModeInput = Static<typeof EnterPlanModeInputSchema>;

// ============================================================================
// Tool creation
// ============================================================================

export function createEnterPlanModeTool(
	api: ExtensionAPI,
	getSessionState: () => PlanSessionState,
	isChannelsEnabled: () => boolean,
): ToolDefinition {
	return {
		name: "EnterPlanMode",
		label: "Enter Plan Mode",
		description: "Switch to plan mode to design an approach before coding. Use this when the task is complex and requires planning before implementation.",
		parameters: EnterPlanModeInputSchema,

		execute: async (
			_toolCallId: string,
			_input: EnterPlanModeInput,
			_signal: AbortSignal | undefined,
			_onUpdate: undefined,
			ctx,
		) => {
			const sessionState = getSessionState();

			// Block in agent contexts (agents shouldn't enter plan mode themselves)
			// In nanoPencil, we check if we're in a subagent context via the event bus
			// For simplicity, we trust the caller - the extension won't expose this tool to subagents

			// Block in channels (user may not be at TUI to approve exit)
			if (isChannelsEnabled()) {
				return {
					content: [{
						type: "text",
						text: "EnterPlanMode is not available in channels mode. The user may not be present to approve the plan.",
					}],
				};
			}

			// Get current mode before transition
			const previousMode = sessionState.state.mode;

			// Perform transition
			handlePlanModeTransition(sessionState);
			sessionState.state.prePlanMode = previousMode;
			sessionState.state.mode = "plan";

			return {
				content: [{
					type: "text",
					text: getEnterPlanModeToolResult(),
				}],
			};
		},
	};
}
