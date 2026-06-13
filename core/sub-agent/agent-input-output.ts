/**
 * [WHO]: AgentInput, AgentOutputCompleted, AgentOutputAsync, AgentOutput types + JSON schema
 * [FROM]: Depends on ./agent-definition for AgentDefinitionSource, AgentPermissionMode, AgentIsolationMode
 * [TO]: Consumed by ./agent-tool, ./agent-registry, extensions/builtin/subagent/*
 * [HERE]: core/sub-agent/agent-input-output.ts - Agent tool input/output types per CC §III
 * [COVENANT]: Change schema → update Agent tool handler
 */

import type {
  AgentDefinitionSource,
  AgentPermissionMode,
  AgentIsolationMode,
} from "./agent-definition.js";

// ============================================================================
// Agent Input (CC §3.1 — JSON Schema)
// ============================================================================

/**
 * Input schema for the Agent tool (what the LLM sees).
 * Matches CC's AgentInputSchema exactly, adapted for Catui tool naming.
 *
 * ⚠️ Note from CC source:
 * - `cwd` is omitted from the schema sent to the LLM (internal use only)
 * - `run_in_background` may be omitted when DISABLE_BACKGROUND_TASKS is set
 */
export interface AgentInput {
  /** Short (3-5 word) description of the task */
  description: string;

  /** The task for the agent to perform */
  prompt: string;

  /** The type of specialized agent to use for this task */
  subagent_type?: string;

  /**
   * Optional model override for this agent.
   * Takes precedence over the agent definition's model frontmatter.
   * If omitted, uses the agent definition's model, or inherits from the parent.
   */
  model?: "sonnet" | "opus" | "haiku" | string;

  /** Set to true to run this agent in the background. You will be notified when it completes. */
  run_in_background?: boolean;

  /** Name for the spawned agent. Makes it addressable via SendMessage({to: name}) while running. */
  name?: string;

  /** Team name for spawning. Uses current team context if omitted. */
  team_name?: string;

  /**
   * Permission mode for spawned teammate.
   * e.g. "plan" to require plan approval.
   */
  mode?: AgentPermissionMode;

  /**
   * Isolation mode.
   * "worktree" creates a temporary git worktree so the agent works on an isolated copy of the repo.
   */
  isolation?: AgentIsolationMode;

  /**
   * Absolute path to run the agent in.
   * Overrides the working directory for all filesystem and shell operations within this agent.
   * Mutually exclusive with isolation: "worktree".
   * ⚠️ NOT shown to the LLM in CC (omitted from public schema).
   */
  cwd?: string;
}

// ============================================================================
// Agent Output — Completed (CC §3.2)
// ============================================================================

export interface AgentUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number | null;
  cache_read_input_tokens: number | null;
  server_tool_use: {
    web_search_requests: number;
    web_fetch_requests: number;
  } | null;
  service_tier: ("standard" | "priority" | "batch") | null;
  cache_creation: {
    ephemeral_1h_input_tokens: number;
    ephemeral_5m_input_tokens: number;
  } | null;
}

/**
 * Output when an agent completes synchronously.
 * Matches CC's AgentOutputCompleted exactly.
 */
export interface AgentOutputCompleted {
  /** Unique identifier for this agent run */
  agentId: string;
  /** The agent type that was used */
  agentType?: string;
  /** Text content blocks from the final assistant message */
  content: Array<{ type: "text"; text: string }>;
  /** Total number of tool calls made by this agent */
  totalToolUseCount: number;
  /** Total wall-clock time in milliseconds */
  totalDurationMs: number;
  /** Total tokens consumed */
  totalTokens: number;
  /** Token usage breakdown */
  usage: AgentUsage;
  /** Completion status — always "completed" for this type */
  status: "completed";
  /** The original prompt text */
  prompt: string;
}

// ============================================================================
// Agent Output — Async Launched (CC §3.2)
// ============================================================================

/**
 * Output when an agent is launched asynchronously (background mode).
 * Matches CC's AgentOutputAsync exactly.
 */
export interface AgentOutputAsync {
  /** Status — always "async_launched" for this type */
  status: "async_launched";
  /** Unique identifier for this agent run */
  agentId: string;
  /** Short description of the task */
  description: string;
  /** The original prompt text */
  prompt: string;
  /** Path to the output file where results will be written */
  outputFile: string;
  /** Whether the parent agent has Read/Bash tools to check the output file */
  canReadOutputFile?: boolean;
}

// ============================================================================
// Union type
// ============================================================================

/** Output from the Agent tool — either completed synchronously or launched asynchronously. */
export type AgentOutput = AgentOutputCompleted | AgentOutputAsync;

// ============================================================================
// Agent Spawn Metadata
// ============================================================================

/**
 * Internal metadata tracked during an agent spawn.
 * Not returned to the LLM — used internally for bookkeeping.
 */
export interface AgentSpawnMetadata {
  agentId: string;
  agentType: string;
  prompt: string;
  description: string;
  startTime: number;
  isFork: boolean;
  isAsync: boolean;
  resolvedModel?: string;
  isBuiltInAgent: boolean;
  source: AgentDefinitionSource;
  color?: string;
  worktreeResult?: WorktreeSpawnResult;
}

/** Result from worktree creation during agent spawn. */
export interface WorktreeSpawnResult {
  worktreePath: string;
  worktreeBranch?: string;
  headCommit: string;
  gitRoot?: string;
  hookBased?: boolean;
}

// ============================================================================
// Helper: isAgentOutputCompleted / isAgentOutputAsync
// ============================================================================

export function isAgentOutputCompleted(output: AgentOutput): output is AgentOutputCompleted {
  return output.status === "completed";
}

export function isAgentOutputAsync(output: AgentOutput): output is AgentOutputAsync {
  return output.status === "async_launched";
}
