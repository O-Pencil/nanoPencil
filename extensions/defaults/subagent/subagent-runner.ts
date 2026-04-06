/**
 * [UPSTREAM]: Depends on core/sub-agent/*, core/workspace/*, core/tools/*
 * [SURFACE]: SubAgent orchestration logic
 * [LOCUS]: extensions/defaults/subagent/subagent-runner.ts
 */

import { SubAgentRuntime } from "../../../core/sub-agent/index.js";
import { WorktreeManager } from "../../../core/workspace/index.js";
import {
  createBashTool,
  createCodingTools,
  createReadOnlyTools,
  createSandboxHook,
  type Tool,
} from "../../../core/tools/index.js";
import type { SubAgentRunReport, SubAgentRunState, SubAgentWorkerInfo } from "./subagent-types.js";

const SUBAGENT_SYSTEM_PROMPT = `You are a helpful coding assistant. Analyze the task and provide a thorough response.`;

/**
 * SubAgent Runner - handles spawning and managing SubAgents.
 */
export class SubAgentRunner {
  private runtime: SubAgentRuntime;
  private worktreeManager: WorktreeManager;
  private currentState: SubAgentRunState | null = null;
  private abortController: AbortController | null = null;

  constructor() {
    this.runtime = new SubAgentRuntime();
    this.worktreeManager = new WorktreeManager();
  }

  /**
   * Start a new SubAgent run.
   * @param task The task description
   * @param options.runRole Worker role: "research" (read-only) or "implement" (can write)
   * @param options.model Model to use (reuses main session's model and auth)
   */
  async run(task: string, options?: { runRole?: "research" | "implement"; model?: any }): Promise<SubAgentRunReport> {
    const runId = crypto.randomUUID();
    this.abortController = new AbortController();

    this.currentState = {
      runId,
      phase: "planning",
      startTime: Date.now(),
      workers: [],
    };

    try {
      // Determine tools based on role
      const role = options?.runRole ?? "research";
      const tools = role === "research"
        ? this.createReadOnlyTools()
        : this.createSandboxedTools();

      this.currentState.phase = role === "research" ? "research" : "implementing";

      // Create worker
      const workerId = `${role}-worker-1`;
      this.currentState.workers.push({
        id: workerId,
        role: role === "research" ? "Research Worker" : "Implementation Worker",
        status: "running",
      });

      // Spawn the worker
      const handle = await this.runtime.spawn({
        prompt: task,
        tools,
        cwd: process.cwd(),
        signal: this.abortController.signal,
        model: options?.model,
      });

      // Update worker with handle
      const worker = this.currentState.workers.find(w => w.id === workerId);
      if (worker) {
        worker.handle = handle;
      }

      // Wait for result
      this.currentState.phase = "done";
      const result = await handle.result();

      worker!.status = result.success ? "done" : "error";

      // Extract summary from result
      let summary = result.error ?? "No result";
      if (result.success && result.response) {
        summary = result.response;
      } else if (result.success) {
        summary = "Task completed successfully";
      }

      const report: SubAgentRunReport = {
        runId,
        summary,
        findings: [],
        changedFiles: [],
        duration: Date.now() - this.currentState.startTime,
        success: result.success,
      };

      this.currentState.report = report;
      this.currentState.phase = "done";
      this.currentState.error = result.error;

      return report;
    } catch (error: unknown) {
      this.currentState.phase = "error";
      this.currentState.error = error instanceof Error ? error.message : String(error);

      return {
        runId,
        summary: "",
        findings: [],
        changedFiles: [],
        duration: Date.now() - this.currentState.startTime,
        success: false,
      };
    }
  }

  /**
   * Stop the current run.
   */
  async stop(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
    }
    await this.runtime.terminateAll();
    if (this.currentState) {
      this.currentState.phase = "error";
      this.currentState.error = "Stopped by user";
      this.currentState.workers.forEach(w => {
        w.status = "aborted";
      });
    }
  }

  /**
   * Get the current run state.
   */
  getState(): SubAgentRunState | null {
    return this.currentState;
  }

  /**
   * Get status text for display.
   */
  getStatusText(): string {
    const state = this.currentState;
    if (!state) {
      return "No active SubAgent run.";
    }

    const lines = [
      `Run ID: ${state.runId}`,
      `Phase: ${state.phase}`,
      `Duration: ${Math.round((Date.now() - state.startTime) / 1000)}s`,
      "",
      "Workers:",
    ];

    for (const worker of state.workers) {
      lines.push(`  - ${worker.role}: ${worker.status}`);
    }

    if (state.error) {
      lines.push("", `Error: ${state.error}`);
    }

    return lines.join("\n");
  }

  private createReadOnlyTools(): Tool[] {
    // Read-only tools with sandbox hook for bash (blocks write operations)
    const baseTools = createReadOnlyTools(process.cwd());

    // Replace bash tool with sandboxed version
    const sandboxBash = createBashTool(process.cwd(), {
      spawnHook: createSandboxHook(),
    });

    return [
      ...baseTools.filter(t => t.name !== "bash"),
      sandboxBash,
    ];
  }

  private createSandboxedTools(): Tool[] {
    // Full coding tools but with sandboxed bash
    const baseTools = createCodingTools(process.cwd());

    const sandboxBash = createBashTool(process.cwd(), {
      spawnHook: createSandboxHook(),
    });

    return [
      ...baseTools.filter(t => t.name !== "bash"),
      sandboxBash,
    ];
  }
}
