/**
 * [WHO]: AgentDefinitionRegistry — agent name registry, definition cache, lookup
 * [FROM]: Depends on ./agent-definition for AgentDefinition, BUILT_IN_AGENT_DEFINITIONS
 * [TO]: Consumed by ./agent-tool, ./index.ts, extensions/builtin/subagent/*
 * [HERE]: core/sub-agent/agent-registry.ts - Agent registration and lookup per CC §XIV
 * [COVENANT]: Change registry shape → update P2 AGENT.md member list
 */

import type { AgentDefinition } from "./agent-definition.js";
import { BUILT_IN_AGENT_DEFINITIONS, DEFAULT_FORK_AGENT } from "./agent-definition.js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";

// ============================================================================
// AgentDefinitionRegistry
// ============================================================================

/**
 * Manages agent definitions and the name→agentId mapping.
 *
 * Per CC §XIV:
 * - agentDefinitions has activeAgents (currently usable) and allAgents (including disabled)
 * - agentNameRegistry maps name → agentId for SendMessage routing
 * - Definitions are loaded at startup, config change, and plugin load
 * - Sources: built-in, plugin, user custom (.nanopencil/agents/*.md)
 */
export class AgentDefinitionRegistry {
  /** Currently active (usable) agent definitions */
  private activeAgents: Map<string, AgentDefinition> = new Map();
  /** All agent definitions (including disabled/filtered) */
  private allAgents: Map<string, AgentDefinition> = new Map();
  /** Name → agentId mapping (for SendMessage routing and name-based lookup) */
  private agentNameRegistry: Map<string, string> = new Map();
  /** Failed agent definition files (for error reporting) */
  private failedFiles: Array<{ path: string; error: string }> = [];
  /** Path for persisting agentNameRegistry to disk (CC §XIV, §18.6) */
  private persistencePath: string | undefined;

  /**
   * @param persistencePath Optional path for agentNameRegistry JSON persistence.
   *   Per CC §14.1, the name registry is persisted so it survives process restarts.
   *   Typical: join(cwd, ".nanopencil", "agent-registry.json")
   */
  constructor(persistencePath?: string) {
    this.persistencePath = persistencePath;
    // Initialize with built-in definitions
    this.reload();
  }

  /**
   * Reload all agent definitions from all sources.
   * Called at startup, config change, and plugin load (CC §XIV).
   */
  reload(): void {
    // Clear existing
    this.activeAgents.clear();
    this.allAgents.clear();
    this.failedFiles = [];

    // 1. Load built-in agents (always active)
    for (const [agentType, definition] of BUILT_IN_AGENT_DEFINITIONS) {
      this.allAgents.set(agentType, definition);
      this.activeAgents.set(agentType, definition);
    }

    // 2. Load custom agents from .nanopencil/agents/*.md (future: agent-loader.ts)
    // This is a placeholder — the actual file scanning will be in agent-loader.ts
    // For now, built-in agents are the only source.

    // 3. Load plugin-defined agents (future: from extension system)
    // Placeholder — plugins will register via registerPluginAgent()

    // 4. Load persisted agentNameRegistry (CC §XIV)
    this.loadNameRegistry();
  }

  // =========================================================================
  // Lookup
  // =========================================================================

  /**
   * Resolve an agent type name to its definition.
   * Matches CC's resolveAgentType (Mq8) function.
   *
   * @param subagentType The agent type to look up (e.g. "Explore", "general-purpose")
   * @returns The matching AgentDefinition, or undefined if not found
   */
  resolve(subagentType: string): AgentDefinition | undefined {
    return this.activeAgents.get(subagentType);
  }

  /**
   * Resolve an agent type, throwing if not found or denied.
   * Matches CC's agent type resolution path (§VI step 5).
   *
   * @param subagentType The agent type to look up
   * @param deniedTypes Optional set of agent types denied by permission rules
   * @returns The matching AgentDefinition
   * @throws Error if agent type not found or denied
   */
  resolveOrThrow(subagentType: string, deniedTypes?: ReadonlySet<string>): AgentDefinition {
    const definition = this.activeAgents.get(subagentType);
    if (!definition) {
      throw new Error(`Agent type '${subagentType}' not found. Available types: ${this.getActiveAgentTypes().join(", ")}`);
    }
    if (deniedTypes?.has(subagentType)) {
      throw new Error(`Agent type '${subagentType}' has been denied by permission rules.`);
    }
    return definition;
  }

  /**
   * Get the default fork agent definition.
   * Used when subagent_type is not specified (CC §VI step 5).
   */
  getDefaultForkAgent(): AgentDefinition {
    return DEFAULT_FORK_AGENT;
  }

  // =========================================================================
  // Name Registry (CC §XIV — agentNameRegistry)
  // =========================================================================

  /**
   * Register a name → agentId mapping.
   * Used by the Agent tool when a `name` parameter is provided.
   * This allows SendMessage({to: name}) to address a running agent.
   * Persists to disk if persistencePath is configured (CC §18.6).
   */
  registerAgentName(name: string, agentId: string): void {
    this.agentNameRegistry.set(name, agentId);
    this.saveNameRegistry();
  }

  /**
   * Find an agent by its registered name.
   * Used by SendMessage routing.
   */
  findAgentByName(name: string): string | undefined {
    return this.agentNameRegistry.get(name);
  }

  /**
   * Remove a name registration (when the agent completes).
   * Persists to disk if persistencePath is configured (CC §18.6).
   */
  unregisterAgentName(name: string): void {
    this.agentNameRegistry.delete(name);
    this.saveNameRegistry();
  }

  // =========================================================================
  // Name Registry Persistence (CC §14.1, §18.6)
  // =========================================================================

  /**
   * Load agentNameRegistry from disk.
   * Called during reload(). Silently ignores missing or corrupt files.
   */
  private loadNameRegistry(): void {
    if (!this.persistencePath) return;
    readFile(this.persistencePath, "utf-8")
      .then((data) => {
        try {
          const parsed = JSON.parse(data);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            this.agentNameRegistry.clear();
            for (const [name, agentId] of Object.entries(parsed)) {
              if (typeof name === "string" && typeof agentId === "string") {
                this.agentNameRegistry.set(name, agentId);
              }
            }
          }
        } catch {
          // Corrupt file — ignore
        }
      })
      .catch(() => {
        // File doesn't exist yet — that's fine
      });
  }

  /**
   * Persist agentNameRegistry to disk.
   * Called on every register/unregister. Errors are logged but not thrown.
   */
  private saveNameRegistry(): void {
    if (!this.persistencePath) return;
    const obj: Record<string, string> = {};
    for (const [name, agentId] of this.agentNameRegistry) {
      obj[name] = agentId;
    }
    const dir = this.persistencePath.replace(/[/\\][^/\\]+$/, "");
    mkdir(dir, { recursive: true })
      .then(() => writeFile(this.persistencePath!, JSON.stringify(obj, null, 2), "utf-8"))
      .catch(() => {
        // Non-critical — log if logger available, otherwise silently ignore
      });
  }

  /** Get the current persistence path (if configured). */
  getPersistencePath(): string | undefined {
    return this.persistencePath;
  }

  /**
   * Set or update the persistence path for agentNameRegistry.
   * Called from createAgentTool when the parent session's cwd is known.
   * If the registry already has entries (from a previous session), they are
   * preserved; only the path is updated for future saves.
   */
  setPersistencePath(path: string): void {
    this.persistencePath = path;
    // Load any existing persisted data
    this.loadNameRegistry();
  }

  // =========================================================================
  // Registration (for plugins / custom agents)
  // =========================================================================

  /**
   * Register a custom agent definition (from plugin or user settings).
   * Per CC §XIV, definitions can come from:
   * - Plugin definitions (ao6)
   * - User custom agents (.nanopencil/agents/*.md)
   * - Flag / settings overrides
   */
  registerCustomAgent(definition: AgentDefinition): void {
    this.allAgents.set(definition.agentType, definition);
    this.activeAgents.set(definition.agentType, definition);
  }

  /**
   * Remove a custom agent definition.
   */
  unregisterCustomAgent(agentType: string): void {
    this.activeAgents.delete(agentType);
    this.allAgents.delete(agentType);
  }

  // =========================================================================
  // Queries
  // =========================================================================

  /** Get all currently active agent type names. */
  getActiveAgentTypes(): string[] {
    return Array.from(this.activeAgents.keys());
  }

  /** Get all active agent definitions. */
  getActiveDefinitions(): AgentDefinition[] {
    return Array.from(this.activeAgents.values());
  }

  /** Get all agent definitions (including inactive). */
  getAllDefinitions(): AgentDefinition[] {
    return Array.from(this.allAgents.values());
  }

  /** Get failed file entries (for error reporting). */
  getFailedFiles(): Array<{ path: string; error: string }> {
    return [...this.failedFiles];
  }

  /** Get the name registry (for SendMessage). */
  getNameRegistry(): Map<string, string> {
    return new Map(this.agentNameRegistry);
  }

  // =========================================================================
  // Failure tracking
  // =========================================================================

  /**
   * Record a failed agent definition file.
   * Used during loading when a .md or .json file fails to parse.
   */
  recordFailedFile(path: string, error: string): void {
    this.failedFiles.push({ path, error });
  }

  // =========================================================================
  // Telemetry helpers
  // =========================================================================

  /** Whether an agent definition is a built-in type. */
  isBuiltIn(agentType: string): boolean {
    return BUILT_IN_AGENT_DEFINITIONS.has(agentType);
  }
}

/**
 * Default global agent definition registry instance.
 * Per CC §XIV, this is maintained in AppState and refreshed at
 * startup, config change, and plugin load.
 */
export const agentDefinitionRegistry = new AgentDefinitionRegistry();
