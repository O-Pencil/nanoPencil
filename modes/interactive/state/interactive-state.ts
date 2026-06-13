/**
 * [WHO]: Provides InteractiveState, CompactionQueuedMessage — the shared render/turn UI state container
 * [FROM]: Depends on @catui/ai (AssistantMessage), @catui/tui (Component/Spacer/Text),
 *         components (AssistantMessageComponent/CustomMessageComponent/ToolExecutionComponent) — types only
 * [TO]: Consumed by modes/interactive/interactive-mode.ts (holds one as `this.state`); will be read by the
 *       render-layer controller when handleEvent is sliced (UI04)
 * [HERE]: modes/interactive/state/interactive-state.ts — P5 state 合一 (UI02)
 *
 * Consolidates the ~20 scattered `this._` fields that describe the *current/streaming turn's render
 * state* (streaming message, tool components, loaders, run timers, status line, optimistic + compaction
 * queues). Plain field holder — no behavior; relocated verbatim from InteractiveMode so behavior is
 * identical. Concern-local state (bash, extension widgets, cancellation, skill, buddy) stays with its
 * own owner and is not consolidated here.
 */

import type { AssistantMessage } from "@catui/ai/types";
import type { Component, Spacer, Text } from "@catui/tui";
import type { AssistantMessageComponent } from "../components/assistant-message.js";
import type { CustomMessageComponent } from "../components/custom-message.js";
import type { PlanProgressPanelComponent } from "../components/plan-progress-panel.js";
import type { TaskStatusPanelComponent } from "../components/task-status-panel.js";
import type { ToolExecutionComponent } from "../components/tool-execution.js";

export type CompactionQueuedMessage = {
  text: string;
  mode: "steer" | "followUp";
};

/** Per-sub-agent state tracked for TUI display. */
export interface SubAgentState {
  id: string;
  agentType: string;
  description: string;
  isAsync: boolean;
  isResolved: boolean;
  isError: boolean;
  toolUseCount: number;
  lastToolName: string | null;
  startTime: number;
}

/** Per-phase state for plan execution progress display. */
export interface PlanPhaseState {
  label: string;
  status: "pending" | "in_progress" | "completed";
}

/** Overall plan progress state for TUI rendering. */
export interface PlanProgressState {
  phases: PlanPhaseState[];
  currentPhaseIndex: number;
  startTime: number;
  tokenCount?: number;
}

export class InteractiveState {
  // Working message / run timers
  loadingAnimation: Component | undefined = undefined;
  pendingWorkingMessage: string | undefined = undefined;
  workingMessageOverride: string | undefined = undefined;
  agentRunStartMs: number | undefined = undefined;
  agentRunTimer: ReturnType<typeof setInterval> | undefined = undefined;
  welcomeBannerTimer: ReturnType<typeof setInterval> | undefined = undefined;

  // Status line tracking (for mutating immediately-sequential status updates)
  lastStatusSpacer: Spacer | undefined = undefined;
  lastStatusText: Text | undefined = undefined;

  // Streaming message tracking
  streamingComponent: AssistantMessageComponent | undefined = undefined;
  streamingMessage: AssistantMessage | undefined = undefined;
  customStreamComponents = new Map<string, CustomMessageComponent>();

  // Tool execution tracking: toolCallId -> component
  pendingTools = new Map<string, ToolExecutionComponent>();

  // Sub-agent tracking: subAgentId -> state
  subAgentStates = new Map<string, SubAgentState>();
  subAgentPanelComponent: Component | undefined = undefined;

  // Plan execution progress tracking
  planProgress: PlanProgressState | undefined = undefined;
  planProgressPanel: PlanProgressPanelComponent | undefined = undefined;

  // Task status panel (persistent task display)
  taskStatusPanel: TaskStatusPanelComponent | undefined = undefined;

  // Tool output expansion state
  toolOutputExpanded = false;

  // Thinking block visibility state
  hideThinkingBlock = false;

  // Auto-compaction / auto-retry overlay state (loaders + escape handlers) is owned by
  // StreamRenderController (modes/interactive/controllers/stream-render-controller.ts) — it has zero
  // readers outside the render layer, so it lives there rather than in this shared holder (UI04).

  // Messages queued while compaction is running
  compactionQueuedMessages: CompactionQueuedMessage[] = [];
  // User messages rendered optimistically before Agent emits message_start
  optimisticUserMessages: Array<{ text: string }> = [];
}
