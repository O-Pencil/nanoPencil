/**
 * [WHO]: Provides InterruptController + InterruptContext (queue/runtime/bash/editor/tree/lifecycle ports)
 *        — interactive escape + Ctrl-C/D/Z interrupt classification
 * [FROM]: Depends only on injected capability closures (no core/ai imports); reads no TUI types directly
 * [TO]: Consumed by modes/interactive/interactive-mode.ts (held as `this.interrupt`; onEscape + Ctrl key
 *       actions delegate here)
 * [HERE]: modes/interactive/controllers/interrupt-controller.ts — P5 cancellation slice (scope B: interactive
 *         interrupt-controller only; shutdown/signal registration stay in mount; `modes/_shell` deferred)
 *
 * Owns interrupt *classification* only: the single-key/multi-target escape priority, the two independent
 * double-tap timers (esc→tree/fork, Ctrl-C→shutdown), and Ctrl-D/Ctrl-Z dispatch. It does NOT own the
 * graceful-shutdown sequence, process-signal registration, queue/bash/tree mechanics, or TUI suspend
 * mechanics — those are delegated through ports. onEscape stays mount-wired (gates: mount 接线, 分支委托
 * owner); mount forwards to dispatchEscape() and the escape swap sites (compaction/retry) save/restore that
 * forwarding closure unchanged. See ../../../.dev-docs/architecture-review/interactive-ui-review/cancellation-analysis.md
 */

/** Streaming/loader queue state + restore-on-abort. */
export interface InterruptQueuePort {
  isLoadingAnimationActive(): boolean;
  restoreQueuedMessagesWithAbort(): void;
}

/** Runtime cancellation capability. */
export interface InterruptRuntimePort {
  isStreaming(): boolean;
  isBashRunning(): boolean;
  abortAgent(): void;
  abortBash(): void;
}

/** Bash-mode editor state (mount-owned until a bash controller exists). */
export interface InterruptBashPort {
  isBashMode(): boolean;
  /** Clear bash-mode text, reset the flag, and restore the editor border color. */
  exitBashMode(): void;
}

export interface InterruptEditorPort {
  getText(): string;
  clearEditor(): void;
}

/** Empty-editor double-escape navigation. */
export interface InterruptTreePort {
  getDoubleEscapeAction(): string;
  showTreeSelector(): void;
  showForkSelector(): void;
}

/** Process lifecycle — graceful shutdown + TUI suspend stay mount-owned. */
export interface InterruptLifecyclePort {
  requestShutdown(): void;
  suspend(): void;
}

export interface InterruptContext {
  queue: InterruptQueuePort;
  runtime: InterruptRuntimePort;
  bash: InterruptBashPort;
  editor: InterruptEditorPort;
  tree: InterruptTreePort;
  lifecycle: InterruptLifecyclePort;
}

const DOUBLE_TAP_WINDOW_MS = 500;

export class InterruptController {
  private lastEscapeTime = 0;
  private lastSigintTime = 0;

  constructor(private readonly ctx: InterruptContext) {}

  /**
   * Single-key, multi-target escape dispatch (priority order preserved from the original onEscape):
   * loader → restore queued + abort; streaming → abort agent; bash running → abort bash;
   * bash mode → exit; empty editor → double-tap tree/fork.
   */
  dispatchEscape(): void {
    if (this.ctx.queue.isLoadingAnimationActive()) {
      this.ctx.queue.restoreQueuedMessagesWithAbort();
    } else if (this.ctx.runtime.isStreaming()) {
      this.ctx.runtime.abortAgent();
    } else if (this.ctx.runtime.isBashRunning()) {
      this.ctx.runtime.abortBash();
    } else if (this.ctx.bash.isBashMode()) {
      this.ctx.bash.exitBashMode();
    } else if (!this.ctx.editor.getText().trim()) {
      // Double-escape with empty editor triggers /tree, /fork, or nothing based on setting
      const action = this.ctx.tree.getDoubleEscapeAction();
      if (action !== "none") {
        const now = Date.now();
        if (now - this.lastEscapeTime < DOUBLE_TAP_WINDOW_MS) {
          if (action === "tree") {
            this.ctx.tree.showTreeSelector();
          } else {
            this.ctx.tree.showForkSelector();
          }
          this.lastEscapeTime = 0;
        } else {
          this.lastEscapeTime = now;
        }
      }
    }
  }

  /** Ctrl-C: double-tap (<500ms) shuts down; single tap clears the editor and arms the timer. */
  handleCtrlC(): void {
    const now = Date.now();
    if (now - this.lastSigintTime < DOUBLE_TAP_WINDOW_MS) {
      this.ctx.lifecycle.requestShutdown();
    } else {
      this.ctx.editor.clearEditor();
      this.lastSigintTime = now;
    }
  }

  /** Ctrl-D: only fires when the editor is empty (enforced by CustomEditor) → shutdown. */
  handleCtrlD(): void {
    this.ctx.lifecycle.requestShutdown();
  }

  /** Ctrl-Z: suspend the TUI and stop the process group (resume restores the TUI). */
  handleCtrlZ(): void {
    this.ctx.lifecycle.suspend();
  }
}
