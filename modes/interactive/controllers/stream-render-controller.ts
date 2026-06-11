/**
 * [WHO]: Provides StreamRenderController + StreamRenderContext (state/layout/loaders/toolTrace/runtime/
 *        escape/surface ports) — the interactive streaming render layer (handleEvent)
 * [FROM]: Depends on interactive-state (shared render fields), tui (Container/Text/Spacer/TUI/MarkdownTheme),
 *         components (Assistant/Tool/PencilLoader), theme, agent-session (AgentSessionEvent), ai (Message),
 *         agent-core (AgentMessage), extensions-host (ToolDefinition), buddy pet-sprites (BuddyState)
 * [TO]: Consumed by modes/interactive/interactive-mode.ts (held as `this.streamRender`; subscribeToAgent's
 *       handleEvent forwards here)
 * [HERE]: modes/interactive/controllers/stream-render-controller.ts — P5 UI04 render-layer slice (scope A)
 *
 * Owns the AgentSession event → TUI render orchestration: run lifecycle/loader, assistant streaming,
 * user/custom echo, tool-execution display, and the auto-compaction / auto-retry overlays. It is a render
 * layer: it reads session events and writes components, and NEVER submits any message to AgentSession
 * (token-neutral). Shared render state stays in the consolidated `interactive-state` holder (accessed via
 * the `state` port — that holder's stated purpose); the auto-compaction / auto-retry loader+escape state
 * (zero external readers) is owned privately here. The escape override during compaction/retry goes through
 * the `escape` port — the single controlled channel onto `defaultEditor.onEscape` shared with
 * InterruptController (whose dispatchEscape closure is what gets saved and restored).
 * See ../../../.dev-docs/architecture-review/interactive-ui-review/handle-event-analysis.md
 */

import type { AgentMessage } from "@pencil-agent/agent-core";
import type { Message } from "@pencil-agent/ai/types";
import {
  type CachedContainer,
  type Component,
  type Container,
  type MarkdownTheme,
  Spacer,
  Text,
  type TUI,
} from "@pencil-agent/tui";
import type { ToolDefinition } from "../../../core/extensions-host/types.js";
import type { AgentSessionEvent } from "../../../core/runtime/agent-session.js";
import { AssistantMessageComponent } from "../components/assistant-message.js";
import type { BuddyState } from "../components/buddy/pet-sprites.js";
import { PencilLoader } from "../components/pencil-loader.js";
import { ToolExecutionComponent } from "../components/tool-execution.js";
import type { InteractiveState } from "../state/interactive-state.js";
import { theme } from "../theme/theme.js";

export interface StreamRenderStatePort {
  get(): InteractiveState;
}

export interface StreamRenderLayoutPort {
  getUi(): TUI;
  getChatContainer(): CachedContainer;
  getStatusContainer(): Container;
  addMessageToChat(message: AgentMessage): void;
  updatePendingMessagesDisplay(): void;
  rebuildChatFromMessages(): void;
  requestRender(): void;
  invalidateFooter(): void;
}

export interface StreamRenderLoadersPort {
  getSessionId(): string;
  getDefaultWorkingMessage(): string;
  /** Localized "<key> to cancel" hint key for the interrupt action. */
  getInterruptKeyHint(): string;
  setBuddyPetState(
    state: BuddyState,
    speechBubble?: string,
    options?: { resetTo?: BuddyState; afterMs?: number },
  ): void;
  startAgentRunTimer(): void;
  stopAgentRunTimer(): void;
  updateWorkingMessage(options?: { resetStallTimer?: boolean }): void;
  formatElapsedSeconds(ms: number): string;
}

export interface StreamRenderToolTracePort {
  shouldRenderToolTrace(toolName: string): boolean;
  getRegisteredToolDefinition(toolName: string): ToolDefinition | undefined;
  getShowImages(): boolean;
}

export interface StreamRenderRuntimePort {
  getRetryAttempt(): number;
  abortCompaction(): void;
  abortRetry(): void;
  flushCompactionQueue(options: { willRetry: boolean }): void;
  checkShutdownRequested(): Promise<void>;
  clearAttachments(): void;
}

/** The single controlled channel onto defaultEditor.onEscape, shared with InterruptController. */
export interface StreamRenderEscapePort {
  getHandler(): (() => void) | undefined;
  setHandler(handler: (() => void) | undefined): void;
}

export interface StreamRenderSurfacePort {
  ensureInitialized(): Promise<void>;
  restoreEditorFocusIfPossible(): void;
  getUserMessageText(message: Message): string;
  getMarkdownThemeWithSettings(): MarkdownTheme;
  showStatus(message: string): void;
  showError(message: string): void;
}

export interface StreamRenderContext {
  state: StreamRenderStatePort;
  layout: StreamRenderLayoutPort;
  loaders: StreamRenderLoadersPort;
  toolTrace: StreamRenderToolTracePort;
  runtime: StreamRenderRuntimePort;
  escape: StreamRenderEscapePort;
  surface: StreamRenderSurfacePort;
}

export class StreamRenderController {
  // Auto-compaction / auto-retry overlay state — zero external readers, owned here.
  private autoCompactionLoader: Component | undefined = undefined;
  private autoCompactionEscapeHandler: (() => void) | undefined = undefined;
  private retryLoader: Component | undefined = undefined;
  private retryEscapeHandler: (() => void) | undefined = undefined;

  constructor(private readonly ctx: StreamRenderContext) {}

  async handle(event: AgentSessionEvent): Promise<void> {
    await this.ctx.surface.ensureInitialized();

    this.ctx.layout.invalidateFooter();

    const state = this.ctx.state.get();
    const ui = this.ctx.layout.getUi();
    const chatContainer = this.ctx.layout.getChatContainer();
    const statusContainer = this.ctx.layout.getStatusContainer();

    switch (event.type) {
      case "agent_start":
        // Restore main escape handler if retry handler is still active
        // (retry success event fires later, but we need main handler now)
        if (this.retryEscapeHandler) {
          this.ctx.escape.setHandler(this.retryEscapeHandler);
          this.retryEscapeHandler = undefined;
        }
        if (this.retryLoader) {
          (this.retryLoader as PencilLoader).stop();
          this.retryLoader = undefined;
        }
        if (state.loadingAnimation) {
          (state.loadingAnimation as PencilLoader).stop();
        }
        statusContainer.clear();
        state.loadingAnimation = new PencilLoader(
          ui,
          theme,
          this.ctx.loaders.getDefaultWorkingMessage(),
          this.ctx.loaders.getSessionId(),
        );
        statusContainer.addChild(state.loadingAnimation);
        this.ctx.loaders.setBuddyPetState("working", "Working...");
        // Apply any pending working message queued before loader existed
        if (state.pendingWorkingMessage !== undefined) {
          state.workingMessageOverride = state.pendingWorkingMessage || undefined;
          state.pendingWorkingMessage = undefined;
        }
        this.ctx.loaders.startAgentRunTimer();
        this.ctx.loaders.updateWorkingMessage({ resetStallTimer: false });
        this.ctx.surface.restoreEditorFocusIfPossible();
        this.ctx.layout.requestRender();
        break;

      case "message_start":
        if (event.message.role === "custom") {
          this.ctx.layout.addMessageToChat(event.message);
          this.ctx.layout.requestRender();
        } else if (event.message.role === "user") {
          const textContent = this.ctx.surface.getUserMessageText(event.message);
          if (
            state.optimisticUserMessages.length > 0 &&
            state.optimisticUserMessages[0]?.text === textContent
          ) {
            state.optimisticUserMessages.shift();
            this.ctx.layout.updatePendingMessagesDisplay();
            this.ctx.layout.requestRender();
            break;
          }
          this.ctx.layout.addMessageToChat(event.message);
          this.ctx.layout.updatePendingMessagesDisplay();
          this.ctx.layout.requestRender();
        } else if (event.message.role === "assistant") {
          state.streamingComponent = new AssistantMessageComponent(
            undefined,
            state.hideThinkingBlock,
            this.ctx.surface.getMarkdownThemeWithSettings(),
          );
          state.streamingMessage = event.message;
          chatContainer.addChild(state.streamingComponent);
          state.streamingComponent.updateContent(state.streamingMessage);
          this.ctx.layout.requestRender();
        }
        break;

      case "message_update":
        if (state.streamingComponent && event.message.role === "assistant") {
          // Reset stall timer on new output - spinner should not show as stuck
          if (state.loadingAnimation) {
            (state.loadingAnimation as PencilLoader).resetStallTimer();
          }
          state.streamingMessage = event.message;
          state.streamingComponent.updateContent(state.streamingMessage);
          chatContainer.markDirty(state.streamingComponent);

          for (const content of state.streamingMessage.content) {
            if (content.type === "toolCall") {
              if (!this.ctx.toolTrace.shouldRenderToolTrace(content.name)) {
                continue;
              }
              if (!state.pendingTools.has(content.id)) {
                chatContainer.addChild(new Text("", 0, 0));
                const component = new ToolExecutionComponent(
                  content.name,
                  content.arguments,
                  {
                    showImages: this.ctx.toolTrace.getShowImages(),
                  },
                  this.ctx.toolTrace.getRegisteredToolDefinition(content.name),
                  ui,
                );
                component.setExpanded(state.toolOutputExpanded);
                chatContainer.addChild(component);
                state.pendingTools.set(content.id, component);
              } else {
                const component = state.pendingTools.get(content.id);
                if (component) {
                  component.updateArgs(content.arguments);
                  chatContainer.markDirty(component);
                }
              }
            }
          }
          this.ctx.layout.requestRender();
        }
        break;

      case "message_end":
        if (event.message.role === "user") break;
        if (state.streamingComponent && event.message.role === "assistant") {
          state.streamingMessage = event.message;
          let errorMessage: string | undefined;
          if (state.streamingMessage.stopReason === "aborted") {
            const retryAttempt = this.ctx.runtime.getRetryAttempt();
            errorMessage =
              retryAttempt > 0
                ? `Aborted after ${retryAttempt} retry attempt${retryAttempt > 1 ? "s" : ""}`
                : "Operation aborted";
            state.streamingMessage.errorMessage = errorMessage;
          }
          state.streamingComponent.updateContent(state.streamingMessage);
          chatContainer.markDirty(state.streamingComponent);

          if (
            state.streamingMessage.stopReason === "aborted" ||
            state.streamingMessage.stopReason === "error"
          ) {
            if (!errorMessage) {
              errorMessage = state.streamingMessage.errorMessage || "Error";
            }
            for (const [, component] of state.pendingTools.entries()) {
              component.updateResult({
                content: [{ type: "text", text: errorMessage }],
                isError: true,
              });
              chatContainer.markDirty(component);
            }
            state.pendingTools.clear();
          } else {
            // Args are now complete - trigger diff computation for edit tools
            for (const [, component] of state.pendingTools.entries()) {
              component.setArgsComplete();
              chatContainer.markDirty(component);
            }
          }
          state.streamingComponent = undefined;
          state.streamingMessage = undefined;
          this.ctx.layout.invalidateFooter();
        }
        this.ctx.layout.requestRender();
        break;

      case "tool_execution_start": {
        if (!this.ctx.toolTrace.shouldRenderToolTrace(event.toolName)) {
          break;
        }
        if (!state.pendingTools.has(event.toolCallId)) {
          const component = new ToolExecutionComponent(
            event.toolName,
            event.args,
            {
              showImages: this.ctx.toolTrace.getShowImages(),
            },
            this.ctx.toolTrace.getRegisteredToolDefinition(event.toolName),
            ui,
          );
          component.setExpanded(state.toolOutputExpanded);
          chatContainer.addChild(component);
          state.pendingTools.set(event.toolCallId, component);
          this.ctx.layout.requestRender();
        }
        break;
      }

      case "tool_execution_update": {
        const component = state.pendingTools.get(event.toolCallId);
        if (component) {
          component.updateResult(
            { ...event.partialResult, isError: false },
            true,
          );
          chatContainer.markDirty(component);
          this.ctx.layout.requestRender();
        }
        break;
      }

      case "tool_execution_end": {
        const component = state.pendingTools.get(event.toolCallId);
        if (component) {
          component.updateResult({ ...event.result, isError: event.isError });
          chatContainer.markDirty(component);
          state.pendingTools.delete(event.toolCallId);
          this.ctx.layout.requestRender();
        }
        break;
      }

      case "agent_end": {
        const finalElapsed =
          state.agentRunStartMs !== undefined
            ? this.ctx.loaders.formatElapsedSeconds(Date.now() - state.agentRunStartMs)
            : undefined;
        this.ctx.loaders.stopAgentRunTimer();
        state.agentRunStartMs = undefined;
        state.workingMessageOverride = undefined;
        if (state.loadingAnimation) {
          (state.loadingAnimation as PencilLoader).stop();
          state.loadingAnimation = undefined;
          statusContainer.clear();
        }
        if (state.streamingComponent) {
          chatContainer.removeChild(state.streamingComponent);
          state.streamingComponent = undefined;
          state.streamingMessage = undefined;
        }
        state.pendingTools.clear();
        // Clear any leftover attachments when the turn ends so the bar doesn't
        // accumulate across conversations (sent attachments are already cleared
        // at submit; this also covers images consumed via on-disk file reads).
        this.ctx.runtime.clearAttachments();
        this.ctx.loaders.setBuddyPetState("happy", "Done!", {
          resetTo: "idle",
          afterMs: 1800,
        });
        if (finalElapsed) {
          this.ctx.surface.showStatus(`Completed in ${finalElapsed}`);
        }

        await this.ctx.runtime.checkShutdownRequested();

        this.ctx.surface.restoreEditorFocusIfPossible();
        this.ctx.layout.requestRender();
        break;
      }

      case "auto_compaction_start": {
        // Keep editor active; submissions are queued during compaction.
        // Set up escape to abort auto-compaction
        this.autoCompactionEscapeHandler = this.ctx.escape.getHandler();
        this.ctx.escape.setHandler(() => {
          this.ctx.runtime.abortCompaction();
        });
        // Show compacting indicator with reason
        statusContainer.clear();
        const reasonText =
          event.reason === "overflow" ? "Context overflow detected, " : "";
        this.autoCompactionLoader = new PencilLoader(
          ui,
          theme,
          `${reasonText}Auto-compacting... (${this.ctx.loaders.getInterruptKeyHint()} to cancel)`,
        );
        statusContainer.addChild(this.autoCompactionLoader);
        this.ctx.layout.requestRender();
        break;
      }

      case "auto_compaction_end": {
        // Restore escape handler
        if (this.autoCompactionEscapeHandler) {
          this.ctx.escape.setHandler(this.autoCompactionEscapeHandler);
          this.autoCompactionEscapeHandler = undefined;
        }
        // Stop loader
        if (this.autoCompactionLoader) {
          (this.autoCompactionLoader as PencilLoader).stop();
          this.autoCompactionLoader = undefined;
          statusContainer.clear();
        }
        // Handle result
        if (event.aborted) {
          this.ctx.surface.showStatus("Auto-compaction cancelled");
        } else if (event.result) {
          // Rebuild chat to show compacted state
          chatContainer.clear();
          this.ctx.layout.rebuildChatFromMessages();
          // Add compaction component at bottom so user sees it without scrolling
          this.ctx.layout.addMessageToChat({
            role: "compactionSummary",
            tokensBefore: event.result.tokensBefore,
            summary: event.result.summary,
            timestamp: Date.now(),
          });
          this.ctx.layout.invalidateFooter();
        } else if (event.errorMessage) {
          // Compaction failed (e.g., quota exceeded, API error)
          chatContainer.addChild(new Spacer(1));
          chatContainer.addChild(
            new Text(theme.fg("error", event.errorMessage), 1, 0),
          );
        }
        this.ctx.runtime.flushCompactionQueue({ willRetry: event.willRetry });
        this.ctx.layout.requestRender();
        break;
      }

      case "auto_retry_start": {
        // Set up escape to abort retry
        this.retryEscapeHandler = this.ctx.escape.getHandler();
        this.ctx.escape.setHandler(() => {
          this.ctx.runtime.abortRetry();
        });
        // Show retry indicator
        statusContainer.clear();
        const delaySeconds = Math.round(event.delayMs / 1000);
        this.retryLoader = new PencilLoader(
          ui,
          theme,
          `Retrying (${event.attempt}/${event.maxAttempts}) in ${delaySeconds}s... (${this.ctx.loaders.getInterruptKeyHint()} to cancel)`,
        );
        statusContainer.addChild(this.retryLoader);
        this.ctx.layout.requestRender();
        break;
      }

      case "auto_retry_end": {
        // Restore escape handler
        if (this.retryEscapeHandler) {
          this.ctx.escape.setHandler(this.retryEscapeHandler);
          this.retryEscapeHandler = undefined;
        }
        // Stop loader
        if (this.retryLoader) {
          (this.retryLoader as PencilLoader).stop();
          this.retryLoader = undefined;
          statusContainer.clear();
        }
        // Show error only on final failure (success shows normal response)
        if (!event.success) {
          this.ctx.surface.showError(
            `Retry failed after ${event.attempt} attempts: ${event.finalError || "Unknown error"}`,
          );
        }
        this.ctx.layout.requestRender();
        break;
      }
    }
  }
}
