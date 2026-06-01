/**
 * [WHO]: Provides AbortSlot — a single-occupancy holder for an in-flight operation's AbortController
 * [FROM]: No dependencies — wraps the Web AbortController primitive
 * [TO]: Consumed by core/runtime/agent-session.ts (compaction / auto-compaction / branch summary);
 *       reusable by any module that runs one cancellable operation at a time
 * [HERE]: core/platform/abort-slot.ts - generic cancellation primitive (no business knowledge)
 *
 * Replaces the repeated `private _xAbortController: AbortController | undefined` + begin/abort/
 * clear pattern. Holds at most one controller: begin() starts a fresh operation and returns its
 * signal; abort() cancels the active one; clear() releases the slot (call in finally).
 */

export class AbortSlot {
  private _controller: AbortController | undefined = undefined;

  /** Start a new operation, replacing any prior controller, and return its signal. */
  begin(): AbortSignal {
    this._controller = new AbortController();
    return this._controller.signal;
  }

  /** Whether an operation is currently active. */
  get active(): boolean {
    return this._controller !== undefined;
  }

  /** Whether the active operation has been aborted (false when no active operation). */
  get aborted(): boolean {
    return this._controller?.signal.aborted ?? false;
  }

  /** The active operation's signal, if any. */
  get signal(): AbortSignal | undefined {
    return this._controller?.signal;
  }

  /** Abort the active operation (no-op if none). */
  abort(): void {
    this._controller?.abort();
  }

  /** Release the slot — call in a finally after the operation settles. */
  clear(): void {
    this._controller = undefined;
  }
}
