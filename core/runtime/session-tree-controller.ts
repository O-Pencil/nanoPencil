/**
 * [WHO]: Provides SessionTreeController — session-tree navigation + branch summarization
 * [FROM]: Depends on session/compaction (generateBranchSummary), session-manager (BranchSummaryEntry),
 *         extensions-host (TreePreparation, SessionBeforeTreeResult), platform/abort-slot,
 *         and ./session-context (SessionTreeControllerContext)
 * [TO]: Consumed by core/runtime/agent-session.ts (constructs one, delegates navigateTree()/abortBranchSummary())
 * [HERE]: core/runtime/agent-session.ts split (AS10) — owns the branch-summary abort slot
 *
 * Extracted from AgentSession (AS10). Owns navigateTree() and the branch-summary cancellation
 * state. Unlike fork() (a session-identity change), navigateTree stays in the same session file
 * and moves the leaf. Session state is reached through SessionTreeControllerContext; behavior is
 * identical to the former AgentSession.navigateTree().
 */

import { generateBranchSummary } from "../session/compaction/index.js";
import type { SessionBeforeTreeResult, TreePreparation } from "../extensions-host/index.js";
import type { BranchSummaryEntry } from "../session/session-manager.js";
import { AbortSlot } from "../platform/abort-slot.js";
import type { SessionTreeControllerContext } from "./session-context.js";

export interface NavigateTreeOptions {
  summarize?: boolean;
  customInstructions?: string;
  replaceInstructions?: boolean;
  label?: string;
}

export interface NavigateTreeResult {
  editorText?: string;
  cancelled: boolean;
  aborted?: boolean;
  summaryEntry?: BranchSummaryEntry;
}

export class SessionTreeController {
  /** Cancellation slot for the in-flight branch summarization. */
  private readonly _slot = new AbortSlot();

  constructor(private readonly ctx: SessionTreeControllerContext) {}

  /** Cancel an in-progress branch summarization. */
  abortBranchSummary(): void {
    this._slot.abort();
  }

  /**
   * Navigate to a different node in the session tree (stays in the same session file; moves the
   * leaf). Optionally summarizes the abandoned branch.
   */
  async navigateTree(targetId: string, options: NavigateTreeOptions = {}): Promise<NavigateTreeResult> {
    const oldLeafId = this.ctx.getLeafId();

    // No-op if already at target
    if (targetId === oldLeafId) {
      return { cancelled: false };
    }

    // Model required for summarization
    if (options.summarize && !this.ctx.getModel()) {
      throw new Error("No model available for summarization");
    }

    const targetEntry = this.ctx.getEntry(targetId);
    if (!targetEntry) {
      throw new Error(`Entry ${targetId} not found`);
    }

    // Collect entries to summarize (from old leaf to common ancestor)
    const { entries: entriesToSummarize, commonAncestorId } = this.ctx.collectBranchSummaryEntries(
      oldLeafId,
      targetId,
    );

    // Prepare event data - mutable so extensions can override
    let customInstructions = options.customInstructions;
    let replaceInstructions = options.replaceInstructions;
    let label = options.label;

    const preparation: TreePreparation = {
      targetId,
      oldLeafId,
      commonAncestorId,
      entriesToSummarize,
      userWantsSummary: options.summarize ?? false,
      customInstructions,
      replaceInstructions,
      label,
    };

    // Set up abort controller for summarization
    const branchSummarySignal = this._slot.begin();
    let extensionSummary: { summary: string; details?: unknown } | undefined;
    let fromExtension = false;

    const runner = this.ctx.getExtensionRunner();
    // Emit session_before_tree event
    if (runner?.hasHandlers("session_before_tree")) {
      const result = (await runner.emit({
        type: "session_before_tree",
        preparation,
        signal: branchSummarySignal,
      })) as SessionBeforeTreeResult | undefined;

      if (result?.cancel) {
        return { cancelled: true };
      }

      if (result?.summary && options.summarize) {
        extensionSummary = result.summary;
        fromExtension = true;
      }

      // Allow extensions to override instructions and label
      if (result?.customInstructions !== undefined) {
        customInstructions = result.customInstructions;
      }
      if (result?.replaceInstructions !== undefined) {
        replaceInstructions = result.replaceInstructions;
      }
      if (result?.label !== undefined) {
        label = result.label;
      }
    }

    // Run default summarizer if needed
    let summaryText: string | undefined;
    let summaryDetails: unknown;
    if (options.summarize && entriesToSummarize.length > 0 && !extensionSummary) {
      const model = this.ctx.getModel()!;
      const apiKey = await this.ctx.getApiKey(model);
      if (!apiKey) {
        throw new Error(`No API key for ${model.provider}`);
      }
      const result = await generateBranchSummary(entriesToSummarize, {
        model,
        apiKey,
        signal: branchSummarySignal,
        customInstructions,
        replaceInstructions,
        reserveTokens: this.ctx.getBranchSummaryReserveTokens(),
      });
      this._slot.clear();
      if (result.aborted) {
        return { cancelled: true, aborted: true };
      }
      if (result.error) {
        throw new Error(result.error);
      }
      summaryText = result.summary;
      summaryDetails = {
        readFiles: result.readFiles || [],
        modifiedFiles: result.modifiedFiles || [],
      };
    } else if (extensionSummary) {
      summaryText = extensionSummary.summary;
      summaryDetails = extensionSummary.details;
    }

    // Determine the new leaf position based on target type
    let newLeafId: string | null;
    let editorText: string | undefined;

    if (targetEntry.type === "message" && targetEntry.message.role === "user") {
      // User message: leaf = parent (null if root), text goes to editor
      newLeafId = targetEntry.parentId;
      editorText = this.ctx.extractUserMessageText(targetEntry.message.content);
    } else if (targetEntry.type === "custom_message") {
      // Custom message: leaf = parent (null if root), text goes to editor
      newLeafId = targetEntry.parentId;
      editorText =
        typeof targetEntry.content === "string"
          ? targetEntry.content
          : targetEntry.content
              .filter((c): c is { type: "text"; text: string } => c.type === "text")
              .map((c) => c.text)
              .join("");
    } else {
      // Non-user message: leaf = selected node
      newLeafId = targetId;
    }

    // Switch leaf (with or without summary)
    // Summary is attached at the navigation target position (newLeafId), not the old branch
    let summaryEntry: BranchSummaryEntry | undefined;
    if (summaryText) {
      // Create summary at target position (can be null for root)
      const summaryId = this.ctx.branchWithSummary(newLeafId, summaryText, summaryDetails, fromExtension);
      summaryEntry = this.ctx.getEntry(summaryId) as BranchSummaryEntry;

      // Attach label to the summary entry
      if (label) {
        this.ctx.appendLabelChange(summaryId, label);
      }
    } else if (newLeafId === null) {
      // No summary, navigating to root - reset leaf
      this.ctx.resetLeaf();
    } else {
      // No summary, navigating to non-root
      this.ctx.branch(newLeafId);
    }

    // Attach label to target entry when not summarizing (no summary entry to label)
    if (label && !summaryText) {
      this.ctx.appendLabelChange(targetId, label);
    }

    // Update agent state
    this.ctx.rebuildAgentMessages();

    // Emit session_tree event
    if (runner) {
      await runner.emit({
        type: "session_tree",
        newLeafId: this.ctx.getLeafId(),
        oldLeafId,
        summaryEntry,
        fromExtension: summaryText ? fromExtension : undefined,
      });
    }

    this._slot.clear();
    return { editorText, cancelled: false, summaryEntry };
  }
}
