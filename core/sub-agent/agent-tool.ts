/**
 * [WHO]: createAgentTool, createTaskToolAlias — the "Agent" / "Task" tool for LLM invocation
 * [FROM]: Depends on @catui/agent-core ( @sinclair/typebox, ./agent-definition, ./agent-input-output, ./agent-registry, ./agent-tool-filter, ./sub-agent-backend
 * [TO]: Consumed by core/tools/index.ts ( tool registration ), core/runtime/agent-session.ts
 * [HERE]: core/sub-agent/agent-tool.ts - The Agent tool implementation per CC §VI (full spawn flow)
 * [COVENANT]: Change tool schema → update agent-input-output.ts
 */

import type { AgentTool, AgentToolResult } from "@catui/agent-core";
import type { AgentMessage } from "@catui/agent-core";
import type { Model } from "@catui/ai/types";
import { type Static, Type } from "@sinclair/typebox";
import type { ModelRegistry } from "../model-registry.js";
import type {
  AgentDefinition,
  AgentPermissionMode,
  AgentSystemPromptContext,
  ForksParentContext
} from "./agent-definition.js";
import {
  DEFAULT_FORK_AGENT,
  MAX_RESULT_SIZE_CHARS,
  AUTO_BACKGROUND_THRESHOLD_MS,
  MCP_AVAILABILITY_CHECK_TIMEOUT_MS
} from "./agent-definition.js";
import type {
  AgentInput,
  AgentOutputCompleted,
  AgentOutputAsync,
  AgentSpawnMetadata,
  WorktreeSpawnResult
} from "./agent-input-output.js";
import { isAgentOutputCompleted } from "./agent-input-output.js";
import type { AgentDefinitionRegistry } from "./agent-registry.js";
import { agentDefinitionRegistry } from "./agent-registry.js";
import {
  filterToolsForAgent,
  resolvePermissionMode,
  isReadOnlyTool,
  isReadTool,
  isBashTool
} from "./agent-tool-filter.js";
import { InProcessSubAgentBackend } from "./sub-agent-backend.js";
import type { CreateSessionFn } from "./sub-agent-backend.js";
import type { SubAgentSpec, SubAgentHandle, SubAgentEvent, SubAgentResult } from "./sub-agent-types.js";
import { WorktreeManager } from "../workspace/index.js";
import type { AgentSession } from "../runtime/agent-session.js";
import { extractAgentResult, truncateResult } from "./agent-result-extractor.js";
import { checkHandoffSafety, checkRecursionLimits } from "./agent-handoff-safety.js";
import {
  emitAgentSelected,
  emitAgentCompleted,
  emitAgentMemoryLoaded,
  type AgentSelectedEvent,
  type AgentCompletedEvent,
} from "./agent-telemetry.js";
import {
  getOutputFilePath,
  writeAgentOutputFile,
  writeAgentOutputCompleted,
  getTasksDir
} from "./agent-output-persistence.js";
import { buildNotesSystemPrompt, buildWorktreeNotes, buildCwdOverrideNotes } from "./agent-prompt-builder.js";

// ============================================================================
// Constants
// ============================================================================

export const AGENT_TOOL_NAME = "Agent";
export const TASK_TOOL_NAME = "Task"; // Alias (CC: eI="Task")

// ============================================================================
// Input Schema (CC §3.1)
// ============================================================================

const agentSchema = Type.Object({
  description: Type.String({
    description: "A short (3-5 word) description of the task",
  }),
  prompt: Type.String({
    description: "The task for the agent to perform",
  }),
  subagent_type: Type.Optional(Type.String({
    description: "The type of specialized agent to use for this task",
  })),
  model: Type.Optional(Type.Union([
    Type.Literal('sonnet'),
    Type.Literal('opus'),
    Type.Literal('haiku'),
    Type.String(),
  ], {
    description: "Optional model override for this agent. Takes precedence over the agent definition's model. If omitted, uses the agent definition's model, or inherits from the parent.",
  })),
  run_in_background: Type.Optional(Type.Boolean({
    description: "Set to true to run this agent in the background. You will be notified when it completes.",
  })),
  name: Type.Optional(Type.String({
    description: "Name for the spawned agent. Makes it addressable via SendMessage({to: name}) while running.",
  })),
  mode: Type.Optional(Type.Union([
    Type.Literal("acceptEdits"),
    Type.Literal("auto"),
    Type.Literal("bypassPermissions"),
    Type.Literal("default"),
    Type.Literal("dontAsk"),
    Type.Literal("plan"),
  ], {
    description: "Permission mode for spawned teammate",
  })),
  isolation: Type.Optional(Type.Literal("worktree", {
    description: "Isolation mode. 'worktree' creates a temporary git worktree so the agent works on an isolated copy of the repo.",
  })),
  // Note: 'cwd' is NOT included in the public schema (CC: nzY().omit({cwd:!0}))
  // but is accepted internally for processing
});

export type AgentToolInput = Static<typeof agentSchema>;

// ============================================================================
// Agent Tool Configuration
// ============================================================================

export interface AgentToolConfig {
  /** The parent AgentSession (for inheriting model, prompt, messages) */
  parentSession: AgentSession;
  /** The parent session's current permission mode */
  parentPermissionMode: AgentPermissionMode;
  /** The parent session's model */
  parentModel?: Model<any>;
  /** Agent definition registry (for looking up agent types) */
  registry?: AgentDefinitionRegistry;
  /** Worktree manager (for isolation mode) */
  worktreeManager?: WorktreeManager;
  /** Whether background tasks are disabled (CC: CLAUDE_CODE_DISABLE_BACKGROUND_TASKS) */
  disableBackgroundTasks?: boolean;
  /** Whether this agent is already a fork worker (prevents recursive fork) */
  isForkWorker?: boolean;
  /** Whether this agent is in a team context */
  isTeamContext?: boolean;
  /** Whether this agent is an in-process teammate */
  isInProcessTeam?: boolean;
  /** MCP tools available to sub-agents */
  mcpTools?: AgentTool[];
  /** Auto-background threshold override (default: 2 minutes) */
  autoBackgroundMs?: number;
  /** Tool use context for system prompt building */
  toolUseContext?: unknown;
  /** Callback for forwarding sub-agent events to parent's UI */
  onSubAgentEvent?: (event: SubAgentEvent) => void;
  /** Model registry for resolving tier names to concrete models (CC §VI step 7) */
  modelRegistry?: ModelRegistry;
  /** Factory for creating AgentSession instances (injected to avoid cycle with runtime/sdk) */
  createSession: CreateSessionFn;
}

// ============================================================================
// Create Agent Tool
// ============================================================================

export function createAgentTool(config: AgentToolConfig): AgentTool<typeof agentSchema> {
  const registry = config.registry ?? agentDefinitionRegistry;
  const worktreeManager = config.worktreeManager ?? new WorktreeManager();
  const backend = new InProcessSubAgentBackend(config.createSession);
  const modelRegistry = config.modelRegistry ?? config.parentSession.modelRegistry;

  // Wire up name registry persistence path (CC §XIV, §18.6)
  // Lazy: only set if not already configured (avoids re-reading on every tool creation)
  const sessionCwd = config.parentSession.cwd;
  if (sessionCwd && !registry.getPersistencePath?.()) {
    registry.setPersistencePath(sessionCwd + "/.catui/agent-registry.json");
  }

  return {
    name: AGENT_TOOL_NAME,
    label: "Agent",
    aliases: [TASK_TOOL_NAME],
    description: buildAgentToolDescription(registry),
    parameters: agentSchema,
    // Agent tool has a large max result size (CC: maxResultSizeChars = 1e5)
    maxResultSizeChars: MAX_RESULT_SIZE_CHARS,

    execute: async (toolCallId: string, input: AgentToolInput, signal?: AbortSignal) => {
      const args = input as unknown as AgentInput;

      // === Step 3: Parameter preprocessing ===
      // CC: if Ay6() is true (restrictions), ignore model parameter
      const effectiveModelOverride = args.model;

      // === Step 4: Team path judgment ===
      if (args.team_name && args.name && config.isTeamContext) {
        // CC: team teammate spawn via KZK function
        // For now, throw — team teammate spawning is handled by the /team command
        throw new Error("Team teammate spawning is handled by the /team command. Do not use Agent tool with team_name in team context.");
      }

      // === Step 5: Agent type resolution ===
      let agentDef: AgentDefinition;
      let isFork: boolean;

      if (!args.subagent_type) {
        // No type specified -> fork mode (inherit parent)
        if (config.isForkWorker) {
          throw new Error("Fork is not available inside a forked worker. Complete your task directly using your tools.");
        }
        agentDef = DEFAULT_FORK_AGENT;
        isFork = true;
      } else {
        agentDef = registry.resolveOrThrow(args.subagent_type);
        isFork = false;
      }

      // === Step 5.1: Recursion limits (CC §XII.3) ===
      const recursionError = checkRecursionLimits(
        config.isForkWorker ?? false,
        config.isTeamContext ?? false,
        config.isInProcessTeam ?? false,
        args.name !== undefined,
        args.run_in_background === true,
      );
      if (recursionError) {
        throw new Error(recursionError);
      }

      // === Step 6: MCP server availability check ===
      if (agentDef.requiredMcpServers?.length) {
        const available = await checkMcpAvailability(
          agentDef.requiredMcpServers,
          () => config.mcpTools ?? [],
        );
        if (!available) {
          throw new Error(
            `Agent type '${agentDef.agentType}' requires MCP servers which are not available: ` +
            `${agentDef.requiredMcpServers.join(", ")}`,
          );
        }
      }

      // === Step 7: Model resolution ===
      // Priority: user override > agent def model > parent model
      const resolvedModel = resolveModelForAgent(
        agentDef.model,
        config.parentModel,
        effectiveModelOverride,
        modelRegistry,
      );

      // === Step 8: System prompt building ===
      const promptCtx: AgentSystemPromptContext = {
        cwd: args.cwd ?? config.parentSession.cwd ?? process.cwd(),
        isFork,
        additionalWorkingDirs: [],
        model: resolvedModel?.id ?? resolvedModel?.name ?? "inherit",
        toolUseContext: config.toolUseContext ?? undefined,
      };

      let systemPrompt: string;
      let messages: AgentMessage[];

      if (isFork) {
        // Fork mode: inherit parent's system prompt
        // CC §10.2: uses parentSession.renderedSystemPrompt
        const parentSession = config.parentSession;
        systemPrompt = parentSession.systemPrompt ?? parentSession.agent.state.systemPrompt ?? "";

        // Build fork messages (CC §11.1)
        messages = buildForkMessages(
          parentSession.agent.state.messages,
          args.prompt,
          agentDef.forksParentContext,
        );
      } else {
        // Normal mode: use agent definition's system prompt
        systemPrompt = agentDef.getSystemPrompt(promptCtx);

        // === Telemetry: memory loaded (CC §XVI) ===
        if (agentDef.memory) {
          emitAgentMemoryLoaded({ scope: agentDef.memory, source: "subagent" });
        }

        // Inject working directory notes (CC §10.3: Z18() prepends "Notes:" section)
        if (args.isolation === "worktree" || args.cwd) {
          const additionalDirs = args.cwd ? [args.cwd] : [];
          const notesPrompt = buildNotesSystemPrompt(additionalDirs);
          systemPrompt = notesPrompt + "\n\n" + systemPrompt;
        }

        // Simple message: just the user prompt
        messages = [
          {
            role: "user",
            content: args.prompt,
            timestamp: Date.now(),
          } as AgentMessage,
        ];
      }

      // === Step 9: Permission mode ===
      const childPermissionMode = resolvePermissionMode(
        config.parentPermissionMode,
        agentDef.permissionMode,
      );

      // === Step 10: Tool set determination ===
      const parentTools = config.parentSession.agent.state.tools ?? [];
      const filteredTools = filterToolsForAgent(
        agentDef,
        parentTools,
        childPermissionMode,
        config.mcpTools ?? [],
        isFork,
      );

      // === Step 11: Worktree creation ===
      let worktreeResult: WorktreeSpawnResult | undefined;
      let effectiveCwd = args.cwd ?? config.parentSession.cwd ?? process.cwd();

      if (args.isolation === "worktree") {
        // CC §VII: Xq8 function
        if (args.cwd) {
          throw new Error("cwd and isolation: 'worktree' are mutually exclusive. Choose one or the other.");
        }
        const agentId = crypto.randomUUID();
        const workspace = await worktreeManager.createGitWorktree(
          undefined, // --detach mode (CC: Xq8 uses --detach)
          effectiveCwd,
        );
        worktreeResult = {
          worktreePath: workspace.path,
          headCommit: await getHeadCommit(workspace.path),
          hookBased: false,
        };
        effectiveCwd = workspace.path;
      }

      // === Step 12: Async judgment ===
      // Three independent async triggers:
      // 1. run_in_background parameter (user explicit)
      // 2. agentDef.background (agent definition flag)
      // 3. Auto-background (runtime timeout at 2 minutes)
      const isExplicitAsync = args.run_in_background === true || agentDef.background === true;

      // Recursion limits (CC §XII.3)
      if (config.isInProcessTeam && isExplicitAsync) {
        throw new Error("In-process teammates cannot spawn background agents.");
      }

      if (config.disableBackgroundTasks && isExplicitAsync) {
        throw new Error("Background tasks are disabled in this environment.");
      }

      // === Step 12-16: Execute ===
      const agentId = crypto.randomUUID();
      const metadata: AgentSpawnMetadata = {
        agentId,
        agentType: agentDef.agentType,
        prompt: args.prompt,
        description: args.description,
        startTime: Date.now(),
        isFork,
        isAsync: isExplicitAsync,
        resolvedModel: resolvedModel?.id ?? resolvedModel?.name ?? "inherit",
        isBuiltInAgent: registry.isBuiltIn(agentDef.agentType),
        source: agentDef.source,
        color: agentDef.color,
        worktreeResult,
      };

      // === Telemetry: agent selected (CC §XVI) ===
      emitAgentSelected({
        agent_type: agentDef.agentType,
        model: metadata.resolvedModel ?? "inherit",
        source: agentDef.source,
        color: agentDef.color,
        is_built_in_agent: metadata.isBuiltInAgent,
        is_resume: false,
        is_async: isExplicitAsync,
        is_fork: isFork,
      });

      if (isExplicitAsync) {
        // === Async execution path (CC §6.2) ===
        const asyncOutput = await executeAsync(
          args,
          agentId,
          metadata,
          agentDef,
          systemPrompt,
          messages,
          filteredTools,
          effectiveCwd,
          childPermissionMode,
          resolvedModel,
          worktreeResult,
          registry,
          config,
          backend,
          toolCallId,
        );
        return {
          content: [{ type: "text", text: formatAsyncOutputForParent(asyncOutput) }],
          details: asyncOutput,
        };
      } else {
        // === Sync execution path (CC §6.1) ===
        const output: AgentOutputCompleted | AgentOutputAsync = await executeSync(
          args,
          agentId,
          metadata,
          agentDef,
          systemPrompt,
          messages,
          filteredTools,
          effectiveCwd,
          childPermissionMode,
          resolvedModel,
          worktreeResult,
          registry,
          config,
          backend,
          config.autoBackgroundMs ?? AUTO_BACKGROUND_THRESHOLD_MS,
          toolCallId,
        );

        // Format the result for the parent LLM
        // executeSync may return AgentOutputAsync if auto-background was triggered
        if (isAgentOutputCompleted(output)) {
          return {
            content: [{ type: "text", text: formatOutputForParent(output) }],
            details: output,
          };
        } else {
          return {
            content: [{ type: "text", text: formatAsyncOutputForParent(output) }],
            details: output,
          };
        }
      }
    },
  };
}

/**
 * Create the Task tool alias (CC: eI="Task" is an alias for Agent).
 * Same functionality, different name.
 */
export function createTaskToolAlias(config: AgentToolConfig): AgentTool<typeof agentSchema> {
  const agentTool = createAgentTool(config);
  return {
    ...agentTool,
    name: TASK_TOOL_NAME,
    aliases: undefined, // No aliases for the alias itself
  };
}

// ============================================================================
// Execution Functions
// ============================================================================

async function executeSync(
  args: AgentInput,
  agentId: string,
  metadata: AgentSpawnMetadata,
  agentDef: AgentDefinition,
  systemPrompt: string,
  messages: AgentMessage[],
  tools: AgentTool[],
  cwd: string,
  permissionMode: AgentPermissionMode,
  model: Model<any> | undefined,
  worktreeResult: WorktreeSpawnResult | undefined,
  registry: AgentDefinitionRegistry,
  config: AgentToolConfig,
  backend: InProcessSubAgentBackend,
  autoBackgroundMs: number,
  parentToolCallId?: string,
): Promise<AgentOutputCompleted | AgentOutputAsync> {
  const abortController = new AbortController();
  let autoBackgroundTimeout: ReturnType<typeof setTimeout> | undefined;
  let convertedToBackground = false;

  try {
    // Create sub-agent session (CC §8.1)
    const spec: SubAgentSpec = {
      prompt: buildFullPrompt(args.prompt, agentDef.initialPrompt),
      tools,
      cwd,
      signal: abortController.signal,
      model,
      contextFiles: [],
      agentType: agentDef.agentType,
      description: args.description,
      isAsync: metadata.isAsync,
      parentToolCallId,
      onEvent: (event: SubAgentEvent) => {
        // Forward sub-agent events to parent session's UI display (CC §XV)
        config.onSubAgentEvent?.(event);
      },
    };

    const handle = await backend.spawn(spec);

    // Register name if provided (CC §6.2 step 14)
    if (args.name) {
      registry.registerAgentName(args.name, agentId);
    }

    // === Auto-background race (CC §13.2) ===
    // Race between sub-agent completion and the auto-background timeout.
    // If the timeout fires first, convert to background mode: stop awaiting
    // but let the sub-agent continue running, and set up file-based output.
    let subAgentResult: SubAgentResult;
    if (autoBackgroundMs > 0) {
      const raceResult = await Promise.race([
        handle.result().then(r => ({ tag: "done" as const, result: r })),
        new Promise<{ tag: "timeout" }>(resolve => {
          autoBackgroundTimeout = setTimeout(() => resolve({ tag: "timeout" }), autoBackgroundMs);
        }),
      ]);

      if (raceResult.tag === "timeout") {
        // Auto-background conversion (CC §13.2)
        convertedToBackground = true;

        // Don't terminate the sub-agent — let it continue running in background.
        // Set up completion handler to write output file when it finishes.
        handle.result().then(async (result) => {
          const bgOutput = buildCompletedOutput(result, agentId, metadata);
          const bgTruncated = truncateResult(bgOutput, MAX_RESULT_SIZE_CHARS);
          emitAgentCompletedForMetadata(bgTruncated, metadata);
          if (args.name) {
            registry.unregisterAgentName(args.name);
          }
          await writeAgentOutputCompleted(agentId, cwd, bgTruncated);
        }).catch(async (error) => {
          if (args.name) {
            registry.unregisterAgentName(args.name);
          }
          await writeAgentOutputFile(agentId, cwd, JSON.stringify({
            agentId,
            agentType: metadata.agentType,
            content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
            status: "completed",
          }));
        });

        // Return async output to parent
        const canReadOutputFile = config.parentSession.agent.state.tools?.some(
          (t) => isReadTool(t) || isBashTool(t),
        ) ?? false;

        return {
          status: "async_launched",
          agentId,
          description: args.description,
          prompt: args.prompt,
          outputFile: getOutputFilePath(agentId, cwd),
          canReadOutputFile,
        };
      }

      subAgentResult = raceResult.result;
    } else {
      // No auto-background — just wait for completion
      subAgentResult = await handle.result();
    }

    // Extract result (CC §11.2: VS8 function)
    // The backend returns SubAgentResult, not AgentMessage[].
    // We need to convert SubAgentResult -> AgentOutputCompleted.
    const output = buildCompletedOutput(subAgentResult, agentId, metadata);

    // Truncate if exceeds max size (CC: maxResultSizeChars = 1e5)
    const truncatedOutput = truncateResult(output, MAX_RESULT_SIZE_CHARS);

    // === Step 15: Handoff safety check (auto mode) ===
    if (config.parentPermissionMode === "auto") {
      // We don't have the agent's actual messages for the classifier,
      // but we can check the result text for safety
      const safetyWarning = await checkHandoffSafety(
        [], // No access to sub-agent's internal messages here
        tools,
        config.parentPermissionMode,
        abortController.signal,
        agentDef.agentType,
        truncatedOutput.totalToolUseCount,
      );
      if (safetyWarning) {
        truncatedOutput.content.push({ type: "text", text: safetyWarning });
      }
    }

    // === Step 16: Worktree cleanup ===
    if (worktreeResult) {
      await cleanupWorktree(worktreeResult, config.worktreeManager ?? new WorktreeManager());
    }

    // === Telemetry: agent completed (CC §XVI) ===
    emitAgentCompletedForMetadata(truncatedOutput, metadata);

    // === Step 17: Return result ===
    return truncatedOutput;
  } finally {
    if (autoBackgroundTimeout) {
      clearTimeout(autoBackgroundTimeout);
    }
    // Clean up name registration (skip if converted to background — handled in .then())
    if (args.name && !convertedToBackground) {
      registry.unregisterAgentName(args.name);
    }
  }
}

async function executeAsync(
  args: AgentInput,
  agentId: string,
  metadata: AgentSpawnMetadata,
  agentDef: AgentDefinition,
  systemPrompt: string,
  messages: AgentMessage[],
  tools: AgentTool[],
  cwd: string,
  permissionMode: AgentPermissionMode,
  model: Model<any> | undefined,
  worktreeResult: WorktreeSpawnResult | undefined,
  registry: AgentDefinitionRegistry,
  config: AgentToolConfig,
  backend: InProcessSubAgentBackend,
  parentToolCallId?: string,
): Promise<AgentOutputAsync> {
  const abortController = new AbortController();

  // Register name if provided (CC §6.2 step 14)
  if (args.name) {
    registry.registerAgentName(args.name, agentId);
  }

  // Launch async execution (CC §6.2 step 14: OU + LS8)
  // Fire-and-forget: spawn the agent, don't await completion
  const spec: SubAgentSpec = {
    prompt: buildFullPrompt(args.prompt, agentDef.initialPrompt),
    tools,
    cwd,
    signal: abortController.signal,
    model,
    contextFiles: [],
    agentType: agentDef.agentType,
    description: args.description,
    isAsync: metadata.isAsync,
    parentToolCallId,
    exitHook: async (result) => {
      // Write output to file when completed (CC §11.3)
      const completedOutput = buildCompletedOutput(result, agentId, metadata);
      // Telemetry: agent completed (CC §XVI)
      emitAgentCompletedForMetadata(completedOutput, metadata);
      await writeAgentOutputCompleted(agentId, cwd, completedOutput);
    },
    onEvent: (event: SubAgentEvent) => {
      // Forward events even for background agents (CC §XV)
      config.onSubAgentEvent?.(event);
    },
  };

  // Fire-and-forget: spawn the agent, don't await
  backend.spawn(spec).catch(async (error) => {
    // Write error to output file
    await writeAgentOutputFile(agentId, cwd, JSON.stringify({
      agentId,
      agentType: agentDef.agentType,
      content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
      totalToolUseCount: 0,
      totalDurationMs: Date.now() - metadata.startTime,
      totalTokens: 0,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
        server_tool_use: null,
        service_tier: null,
        cache_creation: null,
      },
      status: "completed",
      prompt: args.prompt,
    }));
  });

  // Check if parent has Read/Bash tools (for canReadOutputFile)
  const canReadOutputFile = config.parentSession.agent.state.tools?.some(
    (t) => isReadTool(t) || isBashTool(t),
  ) ?? false;

  const asyncOutput: AgentOutputAsync = {
    status: "async_launched",
    agentId,
    description: args.description,
    prompt: args.prompt,
    outputFile: getOutputFilePath(agentId, cwd),
    canReadOutputFile,
  };

  return asyncOutput;
}

// ============================================================================
// Helpers
// ============================================================================

/** Build the full prompt by prepending initialPrompt if defined. */
function buildFullPrompt(userPrompt: string, initialPrompt?: string): string {
  if (!initialPrompt) return userPrompt;
  return `${initialPrompt}\n\n${userPrompt}`;
}

/** Build AgentOutputCompleted from a SubAgentResult (shared by sync, async, and auto-background paths). */
function buildCompletedOutput(
  result: SubAgentResult,
  agentId: string,
  metadata: AgentSpawnMetadata,
): AgentOutputCompleted {
  return {
    agentId,
    agentType: metadata.agentType,
    content: result.success && result.response
      ? [{ type: "text" as const, text: result.response }]
      : [{ type: "text" as const, text: result.error ?? "No response" }],
    totalToolUseCount: result.totalToolUseCount ?? 0,
    totalDurationMs: Date.now() - metadata.startTime,
    totalTokens: result.totalTokens ?? 0,
    usage: result.usage ?? {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      server_tool_use: null,
      service_tier: null,
      cache_creation: null,
    },
    status: "completed",
    prompt: metadata.prompt,
  };
}

/** Emit agent completed telemetry from output and metadata (CC §XVI). */
function emitAgentCompletedForMetadata(
  output: AgentOutputCompleted,
  metadata: AgentSpawnMetadata,
): void {
  const responseText = output.content.map(c => c.text).join("");
  emitAgentCompleted({
    agent_type: metadata.agentType,
    model: metadata.resolvedModel ?? "inherit",
    prompt_char_count: metadata.prompt.length,
    response_char_count: responseText.length,
    assistant_message_count: 0,
    total_tool_use_count: output.totalToolUseCount,
    duration_ms: output.totalDurationMs,
    total_tokens: output.totalTokens,
    is_built_in_agent: metadata.isBuiltInAgent,
    is_async: metadata.isAsync,
  });
}

/**
 * Build fork messages from parent context (CC §11.1).
 * forksParentContext controls inheritance:
 * - true: inherit all parent messages
 * - "turn": only inherit current turn's messages
 * - undefined: no inheritance (fresh start)
 */
function buildForkMessages(
  parentMessages: AgentMessage[],
  prompt: string,
  forksParentContext: ForksParentContext,
): AgentMessage[] {
  if (forksParentContext === undefined) {
    // No inheritance — just the prompt
    return [
      {
        role: "user",
        content: prompt,
        timestamp: Date.now(),
      } as AgentMessage,
    ];
  }

  if (forksParentContext === "turn") {
    // Only inherit current turn's messages
    // Find the last user message and everything after it
    const lastUserIdx = parentMessages.reduce((acc, msg, i) => {
      if (msg.role === "user") return i;
      return acc;
    }, -1);
    if (lastUserIdx >= 0) {
      const turnMessages = parentMessages.slice(lastUserIdx);
      return [
        ...turnMessages,
        {
          role: "user",
          content: prompt,
          timestamp: Date.now(),
        } as AgentMessage,
      ];
    }
  }

  // forksParentContext === true: inherit all
  return [
    ...parentMessages,
    {
      role: "user",
      content: prompt,
      timestamp: Date.now(),
    } as AgentMessage,
  ];
}

/**
 * Resolve a model specifier (tier name like "haiku"/"sonnet"/"opus", or a
 * concrete model id) against the available models in the registry.
 *
 * Matching strategy (CC's JE6 equivalent):
 * 1. Exact id match
 * 2. Case-insensitive substring match on id or name
 */
function resolveModelFromRegistry(
  specifier: string,
  modelRegistry: ModelRegistry | undefined,
): Model<any> | undefined {
  if (!modelRegistry) return undefined;
  const available = modelRegistry.getAvailable();
  if (available.length === 0) return undefined;
  const lower = specifier.toLowerCase();
  // Exact id match first
  const exact = available.find((m) => m.id === specifier);
  if (exact) return exact;
  // Substring match on id or name (handles tier names like "haiku", "sonnet", "opus")
  const match = available.find(
    (m) => m.id.toLowerCase().includes(lower) || m.name.toLowerCase().includes(lower),
  );
  return match;
}

/** Resolve model for a sub-agent (CC §VI step 7, JE6 equivalent).
 *
 * Priority: user override > agent definition model > parent model.
 *
 * Special values:
 * - "inherit" or undefined → use parent model
 * - "haiku"/"sonnet"/"opus" → resolve to the corresponding model tier
 * - Any other string → try to find a matching model by id or name substring
 */
function resolveModelForAgent(
  agentDefModel: string | undefined,
  parentModel: Model<any> | undefined,
  userOverride: string | undefined,
  modelRegistry?: ModelRegistry,
): Model<any> | undefined {
  // 1. User override takes highest priority (explicit LLM choice)
  if (userOverride) {
    const resolved = resolveModelFromRegistry(userOverride, modelRegistry);
    if (resolved) return resolved;
    // If unresolvable, fall through to agent def / parent
  }
  // 2. Agent definition model (author's intent for this agent type)
  if (agentDefModel && agentDefModel !== "inherit") {
    const resolved = resolveModelFromRegistry(agentDefModel, modelRegistry);
    if (resolved) return resolved;
  }
  // 3. Fall back to parent model
  return parentModel;
}

/** Check MCP server availability (CC §VI step 6). */
async function checkMcpAvailability(
  requiredServers: string[],
  getMcpTools: () => AgentTool[],
): Promise<boolean> {
  // CC §VI step 6: check MCP server availability, wait up to 30s for pending connections.
  // The MCP tools list may grow over time as servers finish connecting,
  // so we re-scan after each wait instead of using a stale snapshot.

  const maxAttempts = 30; // 30 × 1s = 30s (CC: MCP_AVAILABILITY_CHECK_TIMEOUT_MS)

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const currentMcpTools = getMcpTools();
    const availableServerNames = new Set<string>();
    for (const tool of currentMcpTools) {
      if (tool.name.startsWith("mcp_")) {
        // MCP tools are prefixed with "mcp_<serverName>_" in Catui
        const parts = tool.name.split("_");
        const serverName = parts.length >= 2 ? parts[1] : undefined;
        if (serverName) availableServerNames.add(serverName);
      }
    }

    const allAvailable = requiredServers.every((required) => availableServerNames.has(required));
    if (allAvailable) return true;

    // Wait 1 second before re-checking (MCP servers may still be connecting)
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // After 30 seconds, still not available
  return false;
}

/** Get the HEAD commit hash from a workspace path (for worktree change detection). */
async function getHeadCommit(workspacePath: string): Promise<string> {
  try {
    const { execSync } = await import("node:child_process");
    return execSync("git rev-parse HEAD", {
      cwd: workspacePath,
      encoding: "utf-8",
    }).trim();
  } catch {
    return "unknown";
  }
}

/**
 * Cleanup worktree after agent execution (CC §7.4: jJ6).
 * Decision: remove if no changes, keep if there are changes.
 */
async function cleanupWorktree(
  worktreeResult: WorktreeSpawnResult,
  worktreeManager: WorktreeManager,
): Promise<void> {
  // Check for changes (CC §7.2: E77 function)
  const hasChanges = await checkWorktreeChanges(
    worktreeResult.worktreePath,
    worktreeResult.headCommit,
  );

  if (!hasChanges) {
    // No changes → cleanup (CC §7.4 lifecycle)
    await worktreeManager.dispose({
      path: worktreeResult.worktreePath,
      type: "worktree",
    });
  }
  // If there are changes, keep the worktree — parent can inspect and apply
}

/**
 * Check if a worktree has changes since baseline commit (CC §7.2: E77/il8).
 */
async function checkWorktreeChanges(
  worktreePath: string,
  baselineCommit: string,
): Promise<boolean> {
  try {
    const { execSync } = await import("node:child_process");

    // Check for dirty files (git status --porcelain)
    const statusOutput = execSync("git status --porcelain", {
      cwd: worktreePath,
      encoding: "utf-8",
    }).trim();

    if (statusOutput.length > 0) return true;

    // Check for commits ahead of baseline (git rev-list --count)
    const countOutput = execSync(
      `git rev-list ${baselineCommit}..HEAD --count`,
      {
        cwd: worktreePath,
        encoding: "utf-8",
      },
    ).trim();
    const commitsAhead = parseInt(countOutput, 10);
    return commitsAhead > 0;
  } catch {
    // If git commands fail, assume there are changes (conservative)
    return true;
  }
}

/** Format AgentOutputCompleted as text for the parent LLM to consume. */
function formatOutputForParent(output: AgentOutputCompleted): string {
  const parts = output.content.map((c) => c.text).join("\n\n");

  const summary = [
    `Agent completed (${output.agentType ?? "unknown"}):`,
    `Duration: ${Math.round(output.totalDurationMs / 1000)}s`,
    `Tool calls: ${output.totalToolUseCount}`,
    `Tokens: ${output.totalTokens}`,
    "",
    parts,
  ].join("\n");

  return summary;
}

/** Format AgentOutputAsync as text for the parent LLM. */
function formatAsyncOutputForParent(output: AgentOutputAsync): string {
  return [
    `Agent launched in background (${output.description}):`,
    `Agent ID: ${output.agentId}`,
    `Output file: ${output.outputFile}`,
    output.canReadOutputFile
      ? "You can check progress by reading the output file."
      : "The output file will be available when the agent completes.",
    "",
    `Prompt: ${output.prompt.slice(0, 200)}${output.prompt.length > 200 ? "..." : ""}`,
  ].join("\n");
}

// ============================================================================
// Agent Tool Description & Schema
// ============================================================================

/** Build the tool description shown to the LLM. */
function buildAgentToolDescription(registry: AgentDefinitionRegistry): string {
  const agentTypes = registry.getActiveAgentTypes();
  const definitions = registry.getActiveDefinitions();

  const typeDescriptions = definitions
    .filter((d) => d.agentType !== "__fork__")
    .map((d) => {
      const whenToUse = typeof d.whenToUse === "function" ? d.whenToUse() : d.whenToUse;
      return `- ${d.agentType}: ${whenToUse.slice(0, 120)}${whenToUse.length > 120 ? "..." : ""}`;
    })
    .join("\n");

  return [
    "Spawns a sub-agent to handle a task. The sub-agent runs with its own system prompt, tool set, and message history.",
    "",
    "Available agent types:",
    typeDescriptions,
    "If no subagent_type is specified, a fork of the current session is created (inheriting the prompt, tools, and messages).",
    "",
    "Parameters:",
    "- prompt: The task for the agent to perform (required)",
    "- description: Short 3-5 word description of the task (required)",
    "- subagent_type: Which agent type to use (optional, defaults to fork)",
    "- model: Override model (optional)",
    "- run_in_background: Run asynchronously (optional)",
    "- name: Name for addressing via SendMessage (optional)",
    "- mode: Permission mode override (optional)",
    "- isolation: 'worktree' for git worktree isolation (optional)",
  ].join("\n");
}
