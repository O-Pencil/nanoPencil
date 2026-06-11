/**
 * [WHO]: Barrel exports - all SubAgent runtime, agent definition, agent tool, and utility exports
 * [FROM]: Depends on all sub-agent module files
 * [TO]: Consumed by core/tools/index.ts, core/runtime/agent-session.ts, extensions/builtin/subagent/*, extensions/builtin/team/*
 * [HERE]: core/sub-agent/index.ts - SubAgent runtime public API
 */

// --- Original SubAgent system ---
export { SubAgentRuntime } from "./sub-agent-runtime.js";
export { InProcessSubAgentBackend } from "./sub-agent-backend.js";
export type { CreateSessionFn } from "./sub-agent-backend.js";
export { SubprocessSubAgentBackend } from "./subprocess-backend.js";
export type { SubprocessBackendOptions } from "./subprocess-backend.js";
export type {
  SubAgentSpec,
  SubAgentEvent,
  SubAgentResult,
  SubAgentHandle,
  SubAgentBackend,
} from "./sub-agent-types.js";

// --- CC Agent system (cc-agent-design.md) ---
export type {
  AgentDefinitionSource,
  AgentPermissionMode,
  AgentIsolationMode,
  AgentMemoryScope,
  AgentEffort,
  ForksParentContext,
  AgentDefinition,
  AgentSystemPromptContext,
} from "./agent-definition.js";
export {
  MAX_RESULT_SIZE_CHARS,
  AUTO_BACKGROUND_THRESHOLD_MS,
  MCP_AVAILABILITY_CHECK_TIMEOUT_MS,
  GENERAL_PURPOSE_AGENT,
  EXPLORE_AGENT,
  PLAN_AGENT,
  BUILT_IN_AGENT_DEFINITIONS,
  DEFAULT_FORK_AGENT,
} from "./agent-definition.js";

export type {
  AgentInput,
  AgentOutputCompleted,
  AgentOutputAsync,
  AgentOutput,
  AgentUsage,
  AgentSpawnMetadata,
  WorktreeSpawnResult,
} from "./agent-input-output.js";
export {
  isAgentOutputCompleted,
  isAgentOutputAsync,
} from "./agent-input-output.js";

export { AgentDefinitionRegistry, agentDefinitionRegistry } from "./agent-registry.js";

export {
  filterToolsForAgent,
  isReadOnlyTool,
  isAgentTool,
  isReadTool,
  isBashTool,
  resolvePermissionMode,
} from "./agent-tool-filter.js";

export {
  createAgentTool,
  createTaskToolAlias,
  AGENT_TOOL_NAME,
  TASK_TOOL_NAME,
  type AgentToolConfig,
} from "./agent-tool.js";

export {
  createSendMessageTool,
  SEND_MESSAGE_TOOL_NAME,
} from "./send-message-tool.js";

export {
  extractAgentResult,
  truncateResult,
} from "./agent-result-extractor.js";

export {
  checkHandoffSafety,
  checkRecursionLimits,
} from "./agent-handoff-safety.js";

export {
  getOutputFilePath,
  writeAgentOutputFile,
  writeAgentOutputCompleted,
  readAgentOutputFile,
  agentOutputFileExists,
  getTasksDir,
} from "./agent-output-persistence.js";

export {
  buildNotesSystemPrompt,
  buildWorktreeNotes,
  buildCwdOverrideNotes,
} from "./agent-prompt-builder.js";

export {
  parseMarkdownAgentDefinition,
  parseJsonAgentDefinition,
  loadAgentDefinitionsFromDirectory,
  loadCustomAgentDefinitions,
} from "./agent-definition-loader.js";

export {
  emitAgentSelected,
  emitAgentCompleted,
  emitAgentAutoModeDecision,
  emitAgentMemoryLoaded,
  setAgentTelemetryEventBus,
  type AgentSelectedEvent,
  type AgentCompletedEvent,
  type AgentAutoModeDecisionEvent,
  type AgentMemoryLoadedEvent,
} from "./agent-telemetry.js";
