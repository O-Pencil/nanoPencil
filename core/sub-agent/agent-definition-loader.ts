/**
 * [WHO]: loadAgentDefinitionsFromDirectory, parseMarkdownAgentDefinition, parseJsonAgentDefinition
 * [FROM]: Depends on node:fs/promises, node:path, ./agent-definition for AgentDefinition types
 * [TO]: Consumed by ./agent-registry (reload), extensions/builtin/subagent/*
 * [HERE]: core/sub-agent/agent-definition-loader.ts - Custom agent definition loader per CC §XV (mM4/uM4)
 * [COVENANT]: Change format → update agent-registry reload and agent-definition interface
 */

import { readFile, readdir } from "node:fs/promises";
import { join, basename, dirname } from "node:path";
import type {
  AgentDefinition,
  AgentDefinitionSource,
  AgentPermissionMode,
  AgentIsolationMode,
  AgentMemoryScope,
  AgentEffort,
  ForksParentContext,
} from "./agent-definition.js";

// ============================================================================
// Custom Agent Definition: Markdown Format (CC §15.1 — mM4)
// ============================================================================

/**
 * Parse a markdown agent definition file.
 * Matches CC's mM4() function for parsing .claude/agents/*.md
 * (adapted to .catui/agents/*.md).
 *
 * Format (CC §15.1):
 * ```markdown
 * ---
 * name: my-agent
 * description: "A specialized agent for X"
 * tools: ["Read", "Glob", "Grep"]
 * disallowedTools: ["Write"]
 * model: sonnet
 * effort: high
 * permissionMode: plan
 * maxTurns: 10
 * background: false
 * memory: project
 * isolation: worktree
 * skills: ["skill-name"]
 * initialPrompt: "..."
 * appendSystemPrompt: true
 * mcpServers: ["server-name"]
 * ---
 *
 * You are a specialized agent for X.
 * ```
 */
export function parseMarkdownAgentDefinition(
  content: string,
  filePath: string,
  source: AgentDefinitionSource = "projectSettings",
): AgentDefinition | null {
  // Extract frontmatter (between --- markers)
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!frontmatterMatch) {
    // No frontmatter — entire content is the system prompt
    return {
      agentType: basename(filePath, ".md"),
      description: `Custom agent from ${filePath}`,
      whenToUse: `Use the ${basename(filePath, ".md")} agent for its specialized task.`,
      getSystemPrompt: () => content.trim(),
      source,
      baseDir: dirname(filePath),
      filename: filePath,
    };
  }

  const frontmatter = frontmatterMatch[1];
  const body = frontmatterMatch[2].trim();

  // Parse YAML frontmatter (simple key-value parsing, no full YAML library needed)
  const config = parseSimpleYamlFrontmatter(frontmatter);

 const agentType = config.name ?? basename(filePath, ".md");
  const systemPrompt: string = body || (config.prompt as string) || "";

  return {
    agentType: agentType as string,
    description: (config.description as string) ?? `Custom agent: ${agentType}`,
    whenToUse: (config.whenToUse as string) ?? `Use the ${agentType} agent for its specialized task.`,
    getSystemPrompt: () => systemPrompt,
    tools: parseToolList(config.tools),
    disallowedTools: parseToolList(config.disallowedTools),
    model: config.model as string | undefined,
    effort: config.effort as AgentEffort | undefined,
    permissionMode: config.permissionMode as AgentPermissionMode | undefined,
    isolation: config.isolation as AgentIsolationMode | undefined,
    background: config.background === "true" || config.background === true,
    forksParentContext: config.forksParentContext as ForksParentContext | undefined,
    requiredMcpServers: parseStringList(config.requiredMcpServers),
    mcpServers: parseStringList(config.mcpServers),
    source,
    baseDir: dirname(filePath),
    color: config.color as string | undefined,
    maxTurns: typeof config.maxTurns === "number" ? config.maxTurns : undefined,
    skills: parseStringList(config.skills),
    initialPrompt: config.initialPrompt as string | undefined,
    memory: config.memory as AgentMemoryScope | undefined,
    omitContextFiles: config.omitClaudeMd === "true" || config.omitClaudeMd === true || config.omitContextFiles === "true" || config.omitContextFiles === true,
    appendSystemPrompt: config.appendSystemPrompt === "true" || config.appendSystemPrompt === true,
    hooks: config.hooks as Record<string, unknown> | undefined,
    filename: filePath,
  };
}

// ============================================================================
// Custom Agent Definition: JSON Format (CC §15.2 — uM4)
// ============================================================================

/**
 * Parse a JSON agent definition (plugin format).
 * Matches CC's uM4() function for JSON agent definitions.
 *
 * Format (CC §15.2):
 * ```json
 * {
 *   "agents": {
 *     "my-agent": {
 *       "description": "A specialized agent for X",
 *       "tools": ["Read", "Glob", "Grep"],
 *       "prompt": "You are a specialized agent for X...",
 *       "model": "sonnet",
 *       "permissionMode": "plan",
 *       "maxTurns": 10,
 *       "background": false,
 *       "memory": "project",
 *       "isolation": "worktree"
 *     }
 *   }
 * }
 * ```
 */
export function parseJsonAgentDefinition(
  content: string,
  filePath: string,
  source: AgentDefinitionSource = "plugin",
): AgentDefinition[] {
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }

  // Handle both {"agents": {...}} and direct agent definitions
  const agentsMap = parsed.agents ?? parsed;
  if (typeof agentsMap !== "object" || agentsMap === null) {
    return [];
  }

  const definitions: AgentDefinition[] = [];
  for (const [agentType, agentConfig] of Object.entries(agentsMap)) {
    if (typeof agentConfig !== "object" || agentConfig === null) continue;

    const config = agentConfig as Record<string, unknown>;
    const systemPrompt = (config.prompt as string) ?? "";

    definitions.push({
      agentType,
      description: (config.description as string) ?? `Custom agent: ${agentType}`,
      whenToUse: (config.whenToUse as string) ?? `Use the ${agentType} agent for its specialized task.`,
      getSystemPrompt: () => systemPrompt,
      tools: parseToolList(config.tools),
      disallowedTools: parseToolList(config.disallowedTools),
      model: config.model as string | undefined,
      effort: config.effort as AgentEffort | undefined,
      permissionMode: config.permissionMode as AgentPermissionMode | undefined,
      isolation: config.isolation as AgentIsolationMode | undefined,
      background: config.background === true,
      forksParentContext: config.forksParentContext as ForksParentContext | undefined,
      requiredMcpServers: parseStringList(config.requiredMcpServers),
      mcpServers: parseStringList(config.mcpServers),
      source,
      baseDir: dirname(filePath),
      color: config.color as string | undefined,
      maxTurns: typeof config.maxTurns === "number" ? config.maxTurns : undefined,
      skills: parseStringList(config.skills),
      initialPrompt: config.initialPrompt as string | undefined,
      memory: config.memory as AgentMemoryScope | undefined,
      omitContextFiles: config.omitClaudeMd === true || config.omitContextFiles === true,
      appendSystemPrompt: config.appendSystemPrompt === true,
      hooks: config.hooks as Record<string, unknown> | undefined,
      filename: filePath,
    });
  }

  return definitions;
}

// ============================================================================
// Directory Loading
// ============================================================================

/**
 * Load all agent definitions from a directory.
 * Scans for .md and .json files and parses them.
 *
 * Per CC §XIV:
 * - Sources: built-in, plugin, user custom (.catui/agents/*.md)
 * - Failed files are recorded for error reporting
 *
 * @param dirPath Directory to scan for agent definitions
 * @param source Source classification for loaded definitions
 * @returns Array of successfully parsed definitions and failed file entries
 */
export async function loadAgentDefinitionsFromDirectory(
  dirPath: string,
  source: AgentDefinitionSource = "projectSettings",
): Promise<{
  definitions: AgentDefinition[];
  failedFiles: Array<{ path: string; error: string }>;
}> {
  const definitions: AgentDefinition[] = [];
  const failedFiles: Array<{ path: string; error: string }> = [];

  let entries: string[];
  try {
    entries = await readdir(dirPath);
  } catch {
    // Directory doesn't exist — no custom agents
    return { definitions, failedFiles };
  }

  for (const entry of entries) {
    const filePath = join(dirPath, entry);

    if (entry.endsWith(".md")) {
      try {
        const content = await readFile(filePath, "utf-8");
        const def = parseMarkdownAgentDefinition(content, filePath, source);
        if (def) {
          definitions.push(def);
        }
      } catch (error: unknown) {
        failedFiles.push({
          path: filePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } else if (entry.endsWith(".json")) {
      try {
        const content = await readFile(filePath, "utf-8");
        const defs = parseJsonAgentDefinition(content, filePath, source);
        definitions.push(...defs);
      } catch (error: unknown) {
        failedFiles.push({
          path: filePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return { definitions, failedFiles };
}

/**
 * Load custom agent definitions from the standard locations.
 * Per CC §XIV:
 * - .catui/agents/*.md (project-scoped)
 * - ~/.catui/agents/<id>/agents/*.md (user-scoped)
 *
 * @param cwd Project root directory
 * @param agentDir Global agent config directory
 */
export async function loadCustomAgentDefinitions(
  cwd: string,
  agentDir: string,
): Promise<{
  definitions: AgentDefinition[];
  failedFiles: Array<{ path: string; error: string }>;
}> {
  // Project-scoped agents
  const projectResult = await loadAgentDefinitionsFromDirectory(
    join(cwd, ".catui", "agents"),
    "projectSettings",
  );

  // User-scoped agents
  const userResult = await loadAgentDefinitionsFromDirectory(
    join(agentDir, "agents"),
    "userSettings",
  );

  return {
    definitions: [...projectResult.definitions, ...userResult.definitions],
    failedFiles: [...projectResult.failedFiles, ...userResult.failedFiles],
  };
}

// ============================================================================
// Simple YAML Frontmatter Parser
// ============================================================================

/**
 * Parse simple YAML key-value pairs from frontmatter.
 * Handles strings, numbers, booleans, and arrays (JSON format only).
 * Does NOT support nested YAML — only flat key-value pairs.
 */
function parseSimpleYamlFrontmatter(frontmatter: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = frontmatter.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Split on first colon
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex < 0) continue;

    const key = trimmed.slice(0, colonIndex).trim();
    const value = trimmed.slice(colonIndex + 1).trim();

    // Try to parse the value
    if (!value) {
      result[key] = undefined;
      continue;
    }

    // Try JSON parsing (handles arrays, numbers, booleans, quoted strings)
    try {
      result[key] = JSON.parse(value);
    } catch {
      // Not JSON — treat as plain string
      // Remove surrounding quotes if present
      const unquoted = value.replace(/^["']|["']$/g, "");
      result[key] = unquoted;
    }
  }

  return result;
}

// ============================================================================
// Utility Functions
// ============================================================================

/** Parse a tool list from config (handles both string and array formats). */
function parseToolList(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") {
    // Single tool name or comma-separated
    if (value.includes(",")) {
      return value.split(",").map((s) => s.trim());
    }
    return [value.trim()];
  }
  if (Array.isArray(value)) {
    return value.map((s) => String(s).trim());
  }
  return undefined;
}

/** Parse a string list from config. */
function parseStringList(value: unknown): string[] | undefined {
  return parseToolList(value);
}
