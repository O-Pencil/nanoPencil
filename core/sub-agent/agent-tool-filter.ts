/**
 * [WHO]: filterToolsForAgent, resolveAgentModel, isReadOnlyTool, getToolDescriptionsForAgent
 * [FROM]: Depends on ./agent-definition for AgentDefinition, AgentPermissionMode, core/tools for Tool
 * [TO]: Consumed by ./agent-tool, extensions/builtin/subagent/*
 * [HERE]: core/sub-agent/agent-tool-filter.ts - Tool filtering and model resolution per CC §IX, §XVIII.2
 * [COVENANT]: Change filter logic → update agent-tool handler
 */

import type { AgentTool } from "@pencil-agent/agent-core";
import type { AgentDefinition, AgentPermissionMode } from "./agent-definition.js";
import type { Model } from "@pencil-agent/ai/types";
import type { ModelRegistry } from "../model-registry.js";

// ============================================================================
// Tool Filtering (CC §IX)
// ============================================================================

/**
 * Filter the parent's tool set for a sub-agent.
 *
 * Per CC §IX:
 * - If agentDef.tools === ["*"] → inherit all parent tools (with exact match for fork)
 * - If agentDef.tools is a whitelist → only include listed tools
 * - If agentDef.disallowedTools is set → remove those from parent tools
 * - Permission mode "plan" → filter to read-only tools only
 * - MCP tools are added after permission filtering
 *
 * @param agentDef The agent definition controlling tool access
 * @param parentTools The parent session's available tools
 * @param permissionMode Permission context for the sub-agent
 * @param mcpTools Additional MCP tools to include
 * @param isFork Whether this is a fork agent (uses exact parent tools, no re-filtering)
 * @returns The filtered tool set for the sub-agent
 */
export function filterToolsForAgent(
  agentDef: AgentDefinition,
  parentTools: AgentTool[],
  permissionMode: AgentPermissionMode,
  mcpTools: AgentTool[] = [],
  isFork: boolean = false,
): AgentTool[] {
  // Fork mode: inherit parent tools exactly, no re-filtering (CC §VI step 10)
  if (isFork) {
    return [...parentTools];
  }

  // Start with parent tools
  let tools: AgentTool[] = [...parentTools];

  // Apply tool whitelist (CC: tools field)
  if (agentDef.tools && agentDef.tools.length > 0) {
    if (agentDef.tools.includes("*")) {
      // Wildcard: keep all parent tools
      tools = [...parentTools];
    } else {
      // Whitelist: only include listed tool names
      const whitelist = new Set(agentDef.tools);
      // Normalize tool names: CC uses "Read", nanoPencil uses "read"
      const normalizedWhitelist = new Set(
        Array.from(whitelist.values()).map((name) => name.toLowerCase()),
      );
      tools = tools.filter((t) => normalizedWhitelist.has(t.name.toLowerCase()));
    }
  }

  // Apply tool blacklist (CC: disallowedTools field)
  if (agentDef.disallowedTools && agentDef.disallowedTools.length > 0) {
    const blacklist = new Set(
      Array.from(agentDef.disallowedTools.values()).map((name) => name.toLowerCase()),
    );
    tools = tools.filter((t) => !blacklist.has(t.name.toLowerCase()));
  }

  // Permission mode filtering (CC §IX: td function)
  if (permissionMode === "plan") {
    tools = tools.filter((t) => isReadOnlyTool(t));
  }

  // Add MCP tools (CC §IX: "Add MCP tools")
  tools.push(...mcpTools);

  return tools;
}

/**
 * Check if a tool is read-only (non-destructive).
 * Used by plan mode to filter tools.
 *
 * Per CC §IX:
 * - Plan mode only allows read-only tools
 * - Read, Grep, Find, Ls, Time are read-only
 * - Bash, Edit, Write are NOT read-only
 * - Agent (sub-agent spawning) is NOT read-only
 */
export function isReadOnlyTool(tool: AgentTool): boolean {
  const readOnlyToolNames = new Set([
    "read", "grep", "find", "ls", "time",
    // CC-specific names (capitalized)
    "Read", "Grep", "Glob", "Find", "Ls", "Time",
  ]);
  return readOnlyToolNames.has(tool.name) || readOnlyToolNames.has(tool.name.toLowerCase());
}

/**
 * Check if a tool is the Agent tool (sub-agent spawning).
 * Used to prevent recursive agent spawning in certain agent types.
 */
export function isAgentTool(tool: AgentTool): boolean {
  return tool.name === "Agent" || tool.name === "agent" || tool.name === "Task" || tool.name === "task";
}

/**
 * Check if a tool is a read tool (for canReadOutputFile in async output).
 */
export function isReadTool(tool: AgentTool): boolean {
  return tool.name === "Read" || tool.name === "read";
}

/**
 * Check if a tool is a bash tool (for canReadOutputFile in async output).
 */
export function isBashTool(tool: AgentTool): boolean {
  return tool.name === "Bash" || tool.name === "bash";
}

// ============================================================================
// Model Resolution (CC §VI step 7)
// ============================================================================

/**
 * Resolve the model for a sub-agent.
 *
 * Per CC §VI step 7:
 * Priority: agent definition's model > user override > main loop model
 *
 * Special values:
 * - "inherit" → use parent model
 * - "haiku"/"sonnet"/"opus" → resolve to the corresponding model tier
 * - undefined → inherit from parent
 *
 * @param agentDefModel Model specified in the agent definition
 * @param parentModel The parent session's current model
 * @param userOverride User-specified model override (from Agent tool call)
 * @param modelRegistry For resolving tier names to concrete models
 * @returns The resolved model to use
 */
/**
 * Resolve a model specifier against available models in the registry.
 * Matching: exact id first, then case-insensitive substring on id/name.
 */
function resolveModelFromSpecifier(
  specifier: string,
  modelRegistry: ModelRegistry | undefined,
): Model<any> | undefined {
  if (!modelRegistry) return undefined;
  const available = modelRegistry.getAvailable();
  if (available.length === 0) return undefined;
  const lower = specifier.toLowerCase();
  const exact = available.find((m) => m.id === specifier);
  if (exact) return exact;
  return available.find(
    (m) => m.id.toLowerCase().includes(lower) || m.name.toLowerCase().includes(lower),
  );
}

/**
 * Resolve the model for a sub-agent.
 *
 * Per CC §VI step 7 (JE6 equivalent):
 * Priority: user override > agent definition model > parent model.
 *
 * Special values:
 * - "inherit" or undefined → use parent model
 * - "haiku"/"sonnet"/"opus" → resolve to the corresponding model tier
 * - Any other string → try to find a matching model by id or name substring
 *
 * @param agentDefModel Model specified in the agent definition
 * @param parentModel The parent session's current model
 * @param userOverride User-specified model override (from Agent tool call)
 * @param modelRegistry For resolving tier names to concrete models
 * @returns The resolved model to use
 */
export function resolveAgentModel(
  agentDefModel: string | undefined,
  parentModel: Model<any> | undefined,
  userOverride: string | undefined,
  modelRegistry?: ModelRegistry,
): Model<any> | undefined {
  // 1. User override takes highest priority
  if (userOverride) {
    const resolved = resolveModelFromSpecifier(userOverride, modelRegistry);
    if (resolved) return resolved;
  }
  // 2. Agent definition model
  if (agentDefModel && agentDefModel !== "inherit") {
    const resolved = resolveModelFromSpecifier(agentDefModel, modelRegistry);
    if (resolved) return resolved;
  }
  // 3. Fall back to parent model
  return parentModel;
}

// ============================================================================
// Tool Description Builder (for Agent tool schema)
// ============================================================================

/**
 * Build tool descriptions for the sub-agent's system prompt.
 * Only includes descriptions for tools the agent actually has access to.
 */
export function getToolDescriptionsForAgent(
  tools: AgentTool[],
  toolGuidance: Record<string, string>,
): string {
  const descriptions: string[] = [];
  for (const tool of tools) {
    const guidance = toolGuidance[tool.name] ?? toolGuidance[tool.name.toLowerCase()];
    if (guidance) {
      descriptions.push(`- ${tool.name}: ${guidance}`);
    }
  }
  return descriptions.join("\n");
}

// ============================================================================
// Permission Context Inheritance (CC §XII.2)
// ============================================================================

/**
 * Determine the permission context for a sub-agent.
 *
 * Per CC §XII.2:
 * - Agent definition can override permission mode
 * - But cannot be more permissive than the parent
 * - Default: "acceptEdits" if not specified
 *
 * @param parentMode Parent's permission mode
 * @param agentDefMode Agent definition's permission mode override
 * @returns The resolved permission mode (no more permissive than parent)
 */
export function resolvePermissionMode(
  parentMode: AgentPermissionMode | undefined,
  agentDefMode: AgentPermissionMode | undefined,
): AgentPermissionMode {
  // Agent definition override takes precedence
  const candidate = agentDefMode ?? parentMode ?? "acceptEdits";

  // Enforce: child cannot be more permissive than parent
  // Permission strictness hierarchy (most → least strict):
  // plan > dontAsk > acceptEdits > default > auto > bypassPermissions
  const strictnessOrder: AgentPermissionMode[] = [
    "plan", "dontAsk", "acceptEdits", "default", "auto", "bypassPermissions",
  ];

  const parentIndex = strictnessOrder.indexOf(parentMode ?? "acceptEdits");
  const candidateIndex = strictnessOrder.indexOf(candidate);

  // If candidate is more permissive than parent, clamp to parent
  if (candidateIndex > parentIndex) {
    return parentMode ?? "acceptEdits";
  }

  return candidate;
}
