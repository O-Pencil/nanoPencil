/**
 * [WHO]: Provides TreeOverlayController + TreeOverlayContext — interactive session tree/fork/resume overlays
 * [FROM]: Depends on AgentSession/SessionManager for session lifecycle, TUI containers/components, PromptHost-like prompts
 * [TO]: Consumed by modes/interactive/interactive-mode.ts for /tree, /fork, /resume, keybindings, extension session switch
 * [HERE]: modes/interactive/controllers/tree-overlay-controller.ts — P5 tree-overlay slice (UI05, pure move + rename)
 *
 * Owns interactive session selection overlays only. It delegates reusable session lifecycle behavior to
 * AgentSession and SessionManager; it does not parse or mutate session files directly except the existing
 * rename-session callback through SessionManager.open().
 */

import type { Component, Container, TUI } from "@pencil-agent/tui";
import { Spacer } from "@pencil-agent/tui";
import type { AgentSession } from "../../../core/runtime/agent-session.js";
import { SessionManager } from "../../../core/session/session-manager.js";
import type { KeybindingsManager } from "../../../core/platform/keybindings.js";
import { SessionSelectorComponent } from "../components/session-selector.js";
import { TreeSelectorComponent } from "../components/tree-selector.js";
import { UserMessageSelectorComponent } from "../components/user-message-selector.js";
import { PencilLoader } from "../components/pencil-loader.js";
import { appKey } from "../components/keybinding-hints.js";
import { theme } from "../theme/theme.js";

export interface TreeOverlaySurface {
  showSelector(
    create: (done: () => void) => { component: Component; focus: Component },
  ): void;
  showStatus(message: string): void;
  showError(message: string): void;
  requestRender(): void;
  getUi(): TUI;
  getChatContainer(): Container;
  getStatusContainer(): Container;
  clearChat(): void;
  clearTransientSessionUi(): void;
  addSessionNavigationBanner(message: string): void;
  renderInitialMessages(): void;
  getEditorText(): string;
  setEditorText(text: string): void;
  getEscapeHandler(): (() => void) | undefined;
  setEscapeHandler(handler: (() => void) | undefined): void;
}

export interface TreeOverlayPromptHost {
  selector(title: string, options: string[]): Promise<string | undefined>;
  editor(title: string, prefill?: string): Promise<string | undefined>;
}

export interface TreeOverlayContext {
  session: AgentSession;
  getSessionManager(): SessionManager;
  surface: TreeOverlaySurface;
  promptHost: TreeOverlayPromptHost;
  keybindings: KeybindingsManager;
  shutdown(): Promise<void>;
}

export class TreeOverlayController {
  constructor(private readonly ctx: TreeOverlayContext) {}

  private get sessionManager(): SessionManager {
    return this.ctx.getSessionManager();
  }

  showForkSelector(): void {
    const userMessages = this.ctx.session.getUserMessagesForForking();

    if (userMessages.length === 0) {
      this.ctx.surface.showStatus("No messages to fork from");
      return;
    }

    this.ctx.surface.showSelector((done) => {
      const selector = new UserMessageSelectorComponent(
        userMessages.map((m) => ({ id: m.entryId, text: m.text })),
        async (entryId) => {
          const result = await this.ctx.session.fork(entryId);
          if (result.cancelled) {
            done();
            this.ctx.surface.requestRender();
            return;
          }

          this.ctx.surface.clearChat();
          this.ctx.surface.addSessionNavigationBanner("Branched session");
          this.ctx.surface.renderInitialMessages();
          this.ctx.surface.setEditorText(result.selectedText);
          done();
          this.ctx.surface.showStatus("Branched to new session");
        },
        () => {
          done();
          this.ctx.surface.requestRender();
        },
      );
      return { component: selector, focus: selector.getMessageList() };
    });
  }

  showTreeSelector(initialSelectedId?: string): void {
    const tree = this.sessionManager.getTree();
    const realLeafId = this.sessionManager.getLeafId();

    if (tree.length === 0) {
      this.ctx.surface.showStatus("No entries in session");
      return;
    }

    this.ctx.surface.showSelector((done) => {
      const selector = new TreeSelectorComponent(
        tree,
        realLeafId,
        this.ctx.surface.getUi().terminal.rows,
        async (entryId) => {
          if (entryId === realLeafId) {
            done();
            this.ctx.surface.showStatus("Already at this point");
            return;
          }

          done();

          let wantsSummary = false;
          let customInstructions: string | undefined;

          while (true) {
            const summaryChoice = await this.ctx.promptHost.selector(
              "Summarize branch?",
              ["No summary", "Summarize", "Summarize with custom prompt"],
            );

            if (summaryChoice === undefined) {
              this.showTreeSelector(entryId);
              return;
            }

            wantsSummary = summaryChoice !== "No summary";

            if (summaryChoice === "Summarize with custom prompt") {
              customInstructions = await this.ctx.promptHost.editor(
                "Custom summarization instructions",
              );
              if (customInstructions === undefined) {
                continue;
              }
            }

            break;
          }

          let summaryLoader: PencilLoader | undefined;
          const originalOnEscape = this.ctx.surface.getEscapeHandler();

          if (wantsSummary) {
            this.ctx.surface.setEscapeHandler(() => {
              this.ctx.session.abortBranchSummary();
            });
            this.ctx.surface.getChatContainer().addChild(new Spacer(1));
            summaryLoader = new PencilLoader(
              this.ctx.surface.getUi(),
              theme,
              `Summarizing branch... (${appKey(this.ctx.keybindings, "interrupt")} to cancel)`,
            );
            this.ctx.surface.getStatusContainer().addChild(summaryLoader);
            this.ctx.surface.requestRender();
          }

          try {
            const result = await this.ctx.session.navigateTree(entryId, {
              summarize: wantsSummary,
              customInstructions,
            });

            if (result.aborted) {
              this.ctx.surface.showStatus("Branch summarization cancelled");
              this.showTreeSelector(entryId);
              return;
            }
            if (result.cancelled) {
              this.ctx.surface.showStatus("Navigation cancelled");
              return;
            }

            this.ctx.surface.clearChat();
            this.ctx.surface.addSessionNavigationBanner("Navigated session tree");
            this.ctx.surface.renderInitialMessages();
            if (result.editorText && !this.ctx.surface.getEditorText().trim()) {
              this.ctx.surface.setEditorText(result.editorText);
            }
            this.ctx.surface.showStatus("Navigated to selected point");
          } catch (error) {
            this.ctx.surface.showError(
              error instanceof Error ? error.message : String(error),
            );
          } finally {
            if (summaryLoader) {
              summaryLoader.stop();
              this.ctx.surface.getStatusContainer().clear();
            }
            this.ctx.surface.setEscapeHandler(originalOnEscape);
          }
        },
        () => {
          done();
          this.ctx.surface.requestRender();
        },
        (entryId, label) => {
          this.sessionManager.appendLabelChange(entryId, label);
          this.ctx.surface.requestRender();
        },
        initialSelectedId,
      );
      return { component: selector, focus: selector };
    });
  }

  showSessionSelector(): void {
    this.ctx.surface.showSelector((done) => {
      const selector = new SessionSelectorComponent(
        (onProgress) =>
          SessionManager.list(
            this.sessionManager.getCwd(),
            this.sessionManager.getSessionDir(),
            onProgress,
          ),
        SessionManager.listAll,
        async (sessionPath) => {
          done();
          await this.resumeSession(sessionPath);
        },
        () => {
          done();
          this.ctx.surface.requestRender();
        },
        () => {
          void this.ctx.shutdown();
        },
        () => this.ctx.surface.requestRender(),
        {
          renameSession: async (
            sessionFilePath: string,
            nextName: string | undefined,
          ) => {
            const next = (nextName ?? "").trim();
            if (!next) return;
            const mgr = SessionManager.open(sessionFilePath);
            mgr.appendSessionInfo(next);
          },
          showRenameHint: true,
          keybindings: this.ctx.keybindings,
        },
        this.sessionManager.getSessionFile(),
      );
      return { component: selector, focus: selector };
    });
  }

  async resumeSession(sessionPath: string): Promise<void> {
    this.ctx.surface.clearTransientSessionUi();

    await this.ctx.session.switchSession(sessionPath);

    this.ctx.surface.clearChat();
    this.ctx.surface.addSessionNavigationBanner("Resumed session");
    this.ctx.surface.renderInitialMessages();
    this.ctx.surface.showStatus("Resumed session");
  }
}
