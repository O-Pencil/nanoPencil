/**
 * [WHO]: Provides emitAgentSelected, emitAgentCompleted, emitAgentAutoModeDecision, emitAgentMemoryLoaded —
 *         structured telemetry events for the Agent tool (CC §XVI: tengu_agent_tool_selected / _completed / _auto_mode_decision / _memory_loaded)
 * [FROM]: Depends on core/runtime/logger (structured logging), core/platform/telemetry types (future insforge sink)
 * [TO]: Consumed by ./agent-tool.ts (execute paths) and ./agent-handoff-safety.ts (auto mode decision)
 * [HERE]: core/sub-agent/agent-telemetry.ts — telemetry emission module, mirrors CC's `d()` analytics function
 */

 import { createLogger } from "../platform/utils/logger.js";

 const logger = createLogger({ component: "agent-telemetry", level: "debug" });

// ============================================================================
// Event Payload Types (CC §XVI)
// ============================================================================

/** CC: d("tengu_agent_tool_selected", {...}) */
export interface AgentSelectedEvent {
  agent_type: string;
  model: string;
  source: string;         // "built-in" | "plugin" | "flagSettings"
  color?: string;
  is_built_in_agent: boolean;
  is_resume: boolean;
  is_async: boolean;
  is_fork: boolean;
}

/** CC: d("tengu_agent_tool_completed", {...}) */
export interface AgentCompletedEvent {
  agent_type: string;
  model: string;
  prompt_char_count: number;
  response_char_count: number;
  assistant_message_count: number;
  total_tool_use_count: number;
  duration_ms: number;
  total_tokens: number;
  is_built_in_agent: boolean;
  is_async: boolean;
}

/** CC: d("tengu_auto_mode_decision", {...}) */
export interface AgentAutoModeDecisionEvent {
  decision: "blocked" | "allowed";
  toolName: string;
  subagentType: string;
  toolUseCount: number;
  isHandoff: boolean;
}

/** CC: d("tengu_agent_memory_loaded", {...}) */
export interface AgentMemoryLoadedEvent {
  scope: string;  // e.g. "project" | "global" | undefined
  source: string; // "subagent"
}

// ============================================================================
// Emitter Functions
// ============================================================================

/**
 * Emit telemetry for agent tool selection (CC §XVI: tengu_agent_tool_selected).
 * Called at the start of executeSync / executeAsync, after agent definition is resolved.
 */
export function emitAgentSelected(event: AgentSelectedEvent): void {
  logger.debug(
    `[agent-telemetry] tengu_agent_tool_selected: type=${event.agent_type} model=${event.model} ` +
    `source=${event.source} async=${event.is_async} fork=${event.is_fork} built_in=${event.is_built_in_agent}`,
  );
  _emitToEventBus("agent:tool_selected", event);
}

/**
 * Emit telemetry for agent tool completion (CC §XVI: tengu_agent_tool_completed).
 * Called after executeSync / executeAsync produces a result.
 */
export function emitAgentCompleted(event: AgentCompletedEvent): void {
  logger.debug(
    `[agent-telemetry] tengu_agent_tool_completed: type=${event.agent_type} model=${event.model} ` +
    `duration=${event.duration_ms}ms tokens=${event.total_tokens} tools=${event.total_tool_use_count} ` +
    `prompt_chars=${event.prompt_char_count} response_chars=${event.response_char_count} async=${event.is_async}`,
  );
  _emitToEventBus("agent:tool_completed", event);
}

/**
 * Emit telemetry for auto-mode handoff decision (CC §XVI: tengu_auto_mode_decision).
 * Called when checkHandoffSafety makes a decision in auto mode.
 */
export function emitAgentAutoModeDecision(event: AgentAutoModeDecisionEvent): void {
  logger.debug(
    `[agent-telemetry] tengu_auto_mode_decision: decision=${event.decision} ` +
    `subagentType=${event.subagentType} toolUseCount=${event.toolUseCount} isHandoff=${event.isHandoff}`,
  );
  _emitToEventBus("agent:auto_mode_decision", event);
}

/**
 * Emit telemetry for agent memory loading (CC §XVI: tengu_agent_memory_loaded).
 * Called when agent definition memory is resolved.
 */
export function emitAgentMemoryLoaded(event: AgentMemoryLoadedEvent): void {
  logger.debug(
    `[agent-telemetry] tengu_agent_memory_loaded: scope=${event.scope} source=${event.source}`,
  );
  _emitToEventBus("agent:memory_loaded", event);
}

// ============================================================================
// Internal: EventBus bridge (lazy singleton)
// ============================================================================

let _eventBus: { emit(channel: string, data: unknown): void } | null = null;

/**
 * Inject an EventBus for telemetry forwarding. Called during runtime init
 * when the EventBus is available. Without injection, telemetry is logger-only.
 */
export function setAgentTelemetryEventBus(bus: { emit(channel: string, data: unknown): void }): void {
  _eventBus = bus;
}

function _emitToEventBus(channel: string, data: unknown): void {
  try {
    _eventBus?.emit(channel, data);
  } catch {
    // Never let telemetry errors propagate
  }
}
