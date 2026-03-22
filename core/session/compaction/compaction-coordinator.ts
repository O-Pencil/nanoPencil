/**
 * Compaction Coordinator
 *
 * Encapsulates compaction trigger logic, execution, and result handling.
 * This coordinator manages context compression for token budget management.
 */

import type { AgentMessage } from "@pencil-agent/agent-core";
import type { CompactionPreparation, CompactionResult } from "./index.js";

export interface CompactionCoordinatorOptions {
	/** Session manager for accessing session data */
	getSessionMessages: () => AgentMessage[];
	/** Trigger compaction manually */
	compact: (options?: {
		customInstructions?: string;
		onComplete?: (result: CompactionResult) => void;
		onError?: (error: Error) => void;
	}) => void;
	/** Abort ongoing compaction */
	abortCompaction: () => void;
	/** Check if auto-compaction is enabled */
	isAutoCompactionEnabled: () => boolean;
	/** Get context usage */
	getContextUsage: () => { tokens: number | null; contextWindow: number; percent: number | null } | undefined;
	/** Get model context window */
	getContextWindow: () => number;
}

export interface CompactionCheckResult {
	shouldCompact: boolean;
	reason?: "overflow" | "threshold" | "manual";
	overflowRatio?: number;
}

export class CompactionCoordinator {
	private options: CompactionCoordinatorOptions;
	private _lastAssistantMessage: AgentMessage | null = null;

	constructor(options: CompactionCoordinatorOptions) {
		this.options = options;
	}

	/**
	 * Update the last assistant message for tracking
	 */
	setLastAssistantMessage(msg: AgentMessage | null): void {
		this._lastAssistantMessage = msg;
	}

	/**
	 * Check if compaction should be triggered
	 */
	checkCompaction(overflowRatio?: number): CompactionCheckResult {
		// If overflow ratio is provided, use it
		if (overflowRatio !== undefined && overflowRatio > 1) {
			return {
				shouldCompact: true,
				reason: "overflow",
				overflowRatio,
			};
		}

		// Check auto-compaction threshold if enabled
		if (this.options.isAutoCompactionEnabled()) {
			const contextUsage = this.options.getContextUsage();
			if (contextUsage && contextUsage.percent !== null) {
				// Default threshold: 85%
				const threshold = 85;
				if (contextUsage.percent >= threshold) {
					return {
						shouldCompact: true,
						reason: "threshold",
						overflowRatio: contextUsage.percent / 100,
					};
				}
			}
		}

		return { shouldCompact: false };
	}

	/**
	 * Run compaction with the coordinator's settings
	 */
	runCompaction(options?: {
		customInstructions?: string;
		onComplete?: (result: CompactionResult) => void;
		onError?: (error: Error) => void;
	}): void {
		this.options.compact(options);
	}

	/**
	 * Abort ongoing compaction
	 */
	abort(): void {
		this.options.abortCompaction();
	}

	/**
	 * Get the last assistant message for context analysis
	 */
	getLastAssistantMessage(): AgentMessage | null {
		return this._lastAssistantMessage;
	}
}
