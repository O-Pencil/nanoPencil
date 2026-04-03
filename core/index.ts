/**
 * [UPSTREAM]: Depends on runtime/, tools/, extensions/, session/, model/, config/
 * [SURFACE]: Barrel exports for core API surface
 * [LOCUS]: Public entry point for core functionality; consumed by modes and SDK
 * [COVENANT]: Export changes → update P1/P2 documentation
 */

export {
  AgentSession,
  type AgentSessionConfig,
  type AgentSessionEvent,
  type AgentSessionEventListener,
  type ModelCycleResult,
  type PromptOptions,
  type SessionStats,
} from "./runtime/agent-session.js";
export {
  type BashExecutorOptions,
  type BashResult,
  executeBash,
  executeBashWithOperations,
} from "./bash-executor.js";
export type { CompactionResult } from "./session/compaction/index.js";
export {
  createEventBus,
  type EventBus,
  type EventBusController,
} from "./runtime/event-bus.js";

// Extensions system
export {
  type AgentEndEvent,
  type AgentStartEvent,
  type AgentToolResult,
  type AgentToolUpdateCallback,
  type BeforeAgentStartEvent,
  type ContextEvent,
  discoverAndLoadExtensions,
  type ExecOptions,
  type ExecResult,
  type Extension,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
  type ExtensionError,
  type ExtensionEvent,
  type ExtensionFactory,
  type ExtensionFlag,
  type ExtensionHandler,
  ExtensionRunner,
  type ExtensionShortcut,
  type ExtensionUIContext,
  type LoadExtensionsResult,
  type MessageRenderer,
  type RegisteredCommand,
  type SessionBeforeCompactEvent,
  type SessionBeforeForkEvent,
  type SessionBeforeSwitchEvent,
  type SessionBeforeTreeEvent,
  type SessionCompactEvent,
  type SessionForkEvent,
  type SessionShutdownEvent,
  type SessionStartEvent,
  type SessionSwitchEvent,
  type SessionTreeEvent,
  type ToolCallEvent,
  type ToolDefinition,
  type ToolRenderResultOptions,
  type ToolResultEvent,
  type TurnEndEvent,
  type TurnStartEvent,
  wrapToolsWithExtensions,
} from "./extensions/index.js";

// MCP (Model Context Protocol) support
export { MCPManager } from "./mcp-manager.js";
export type {
  MCPServerConfig,
  MCPTool,
  MCPToolResult,
} from "./mcp/mcp-client.js";
export {
  loadMCPConfig,
  saveMCPConfig,
  addMCPServer,
  removeMCPServer,
  getMCPServer,
  listMCPServers,
  listEnabledMCPServers,
} from "./mcp/mcp-config.js";
