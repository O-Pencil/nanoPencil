/**
 * [WHO]: checkHandoffSafety — handoff classifier for auto mode sub-agent security review (CC §XII.1)
 * [FROM]: Depends on @catui/agent-core for AgentMessage, ./agent-definition for AgentPermissionMode
 * [TO]: Consumed by ./agent-tool (sync execution path, step 15)
 * [HERE]: core/sub-agent/agent-handoff-safety.ts - Security review per CC §XII.1 (ES8)
 * [COVENANT]: Change classifier → update agent-tool handler
 */

import type { AgentMessage } from "@catui/agent-core";
import type { AgentTool } from "@catui/agent-core";
import type { AgentPermissionMode } from "./agent-definition.js";
import { emitAgentAutoModeDecision } from "./agent-telemetry.js";

/**
 * Check whether a sub-agent's output is safe to hand back to the parent.
 * Matches CC's ES8 function (handoff classifier) exactly.
 *
 * Per CC §XII.1:
 * - Only runs in "auto" permission mode
 * - Uses a classifier model to review sub-agent operations
 * - If flagged → returns a SECURITY WARNING prefix
 * - If classifier unavailable → returns warning but doesn't block
 *
 * @param agentMessages The sub-agent's message history
 * @param tools The tools available to the sub-agent
 * @param permissionMode The permission mode of the parent agent
 * @param abortSignal Optional abort signal for the classifier call
 * @param subagentType The type of sub-agent that was spawned
 * @param totalToolUseCount Total tool calls made by the sub-agent
 * @returns Security warning string if flagged, null if safe
 */
export async function checkHandoffSafety(
  agentMessages: AgentMessage[],
  tools: AgentTool[],
  permissionMode: AgentPermissionMode,
  abortSignal?: AbortSignal,
  subagentType?: string,
  totalToolUseCount?: number,
): Promise<string | null> {
  // Only run in auto mode (CC §XII.1: "if mode !== 'auto' return null")
  if (permissionMode !== "auto") {
    return null;
  }

  // Build review prompt (CC §XII.1: ES8 builds review prompt)
  const reviewPrompt = "Sub-agent has finished and is handing back control to the main agent. " +
    "Review the sub-agent's work based on the block rules and let the main agent know " +
    "if any file is dangerous (the main agent will see the reason).";

  try {
    // Call the handoff classifier (CC §XII.1: TS8 function)
    const result = await runHandoffClassifier(
      [...agentMessages, { role: "user", content: [{ type: "text", text: reviewPrompt }], timestamp: Date.now() } as AgentMessage],
      tools,
      permissionMode,
      abortSignal,
    );

    // Record decision (CC §XII.1: d("tengu_auto_mode_decision", ...))
    // In Catui, we log this via the logger rather than telemetry
    logHandoffDecision({
      decision: result.shouldBlock ? "blocked" : "allowed",
      toolName: "Agent",
      subagentType,
      toolUseCount: totalToolUseCount,
      isHandoff: true,
    });

    if (result.shouldBlock) {
      if (result.unavailable) {
        // Classifier unavailable: return warning but don't block (CC §XII.1: "if unavailable, return warning")
        return "Note: The safety classifier was unavailable when reviewing this sub-agent's work. " +
          "Please carefully verify the sub-agent's actions and output before acting on them.";
      }
      // Flagged: return security warning (CC §XII.1: "SECURITY WARNING prefix")
      return `SECURITY WARNING: Sub-agent performed actions that may violate security policy. Reason: ${result.reason}. Review the sub-agent's actions carefully before acting on its output.`;
    }

    // Safe: no warning
    return null;
  } catch (error) {
    // Classifier call failed: treat as unavailable (CC §XII.1: graceful degradation)
    return "Note: The safety classifier was unavailable when reviewing this sub-agent's work. " +
      "Please carefully verify the sub-agent's actions and output before acting on them.";
  }
}

// ============================================================================
// Handoff Classifier Result
// ============================================================================

interface HandoffClassifierResult {
  shouldBlock: boolean;
  reason?: string;
  unavailable?: boolean;
}

interface HandoffDecisionLog {
  decision: "blocked" | "allowed";
  toolName: string;
  subagentType?: string;
  toolUseCount?: number;
  isHandoff: boolean;
}

// ============================================================================
// Handoff Classifier (CC §XII.1: TS8)
// ============================================================================

/**
 * Run the handoff classifier model.
 *
 * Per CC §XII.1:
 * - Uses a small/cheap model (haiku) for the review
 * - Input: the sub-agent's messages + review prompt
 * - Output: shouldBlock + reason
 * - If the classifier is unavailable (no API key, network error), sets unavailable flag
 *
 * ⚠️ For Catui, the classifier currently uses a heuristic-based approach
 * since we don't have a separate model call infrastructure for this.
 * A full implementation would use a lightweight LLM call (haiku-tier).
 */
async function runHandoffClassifier(
  messages: AgentMessage[],
  tools: AgentTool[],
  permissionMode: AgentPermissionMode,
  abortSignal?: AbortSignal,
): Promise<HandoffClassifierResult> {
  // Heuristic-based classifier (Phase 1: no LLM call)
  // Check for common dangerous patterns in the sub-agent's tool calls:
  const dangerousPatterns = [
    // Writing to sensitive paths
    /\/etc\/passwd/i,
    /\/\.ssh\//i,
    /\/\.env$/i,
    // Executing suspicious commands
    /curl\s+.*\|\s*sh/i,
    /wget\s+.*\|\s*sh/i,
    /rm\s+-rf\s+\//i,
    // Network exfiltration
    /nc\s+/i,
    /netcat/i,
  ];

  // Scan assistant messages for tool calls that match dangerous patterns
  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    const content = (msg as any).content;
    if (!Array.isArray(content)) continue;

    for (const part of content) {
      if (part.type === "toolCall") {
        const args = typeof part.args === "string" ? part.args : JSON.stringify(part.args ?? {});
        for (const pattern of dangerousPatterns) {
          if (pattern.test(args)) {
            return {
              shouldBlock: true,
              reason: `Sub-agent tool call matched a dangerous pattern: ${pattern.source}`,
            };
          }
        }
      }
    }
  }

  // No dangerous patterns detected — safe
  return { shouldBlock: false };
}

/** Log handoff decision via telemetry (CC §XVI: tengu_auto_mode_decision). */
function logHandoffDecision(log: HandoffDecisionLog): void {
  emitAgentAutoModeDecision({
    decision: log.decision,
    toolName: log.toolName,
    subagentType: log.subagentType ?? "unknown",
    toolUseCount: log.toolUseCount ?? 0,
    isHandoff: log.isHandoff,
  });
}

// ============================================================================
// Recursion Limits (CC §XII.3)
// ============================================================================

/**
 * Check if a fork can be spawned from the current context.
 * Per CC §XII.3:
 * - Fork workers cannot spawn forks (isForkWorker check)
 * - Team teammates cannot spawn other teammates (isTeamContext + name check)
 * - In-process teammates cannot spawn background agents (isInProcessTeam check)
 *
 * @returns Error message if blocked, null if allowed
 */
export function checkRecursionLimits(
  isForkWorker: boolean,
  isTeamContext: boolean,
  isInProcessTeam: boolean,
  hasName: boolean,
  wantsBackground: boolean,
): string | null {
  // CC §XII.3: "Fork is not available inside a forked worker"
  if (isForkWorker) {
    return "Fork is not available inside a forked worker. Complete your task directly using your tools.";
  }

  // CC §XII.3: "Teammates cannot spawn other teammates — the team roster is flat"
  if (isTeamContext && hasName) {
    return "Teammates cannot spawn other teammates — the team roster is flat.";
  }

  // CC §XII.3: "In-process teammates cannot spawn background agents"
  if (isInProcessTeam && wantsBackground) {
    return "In-process teammates cannot spawn background agents.";
  }

  return null;
}
