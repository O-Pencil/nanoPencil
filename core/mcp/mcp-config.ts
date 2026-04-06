/**
 * [WHO]: MCPConfig, loadMcpConfig(), saveMcpConfig(), listEnabledMCPServers()
 * [FROM]: Depends on node:fs, node:path, node:os, config, mcp-client
 * [TO]: Consumed by core/index.ts, core/mcp-manager.ts, modes/interactive/interactive-mode.ts, extensions/defaults/mcp/index.ts
 * [HERE]: core/mcp/mcp-config.ts - MCP server configuration management
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { homedir } from "os";
import { getAgentDir } from "../../config.js";
import type { MCPServerConfig } from "./mcp-client.js";

export interface MCPConfig {
  mcpServers: MCPServerConfig[];
}

const DEFAULT_MCP_CONFIG: MCPConfig = {
  mcpServers: [
    // ===== 核心工具 (默认启用) =====
    // 注意: filesystem 的目录在运行时由 MCPManager 动态设置
    {
      id: "filesystem",
      name: "Filesystem",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "{cwd}"],
      enabled: true,
      transport: "stdio",
      toolTimeout: 30000,
    },
    {
      id: "fetch",
      name: "Fetch (Web Scraper)",
      command: "npx",
      args: ["-y", "@kazuph/mcp-fetch"],
      enabled: false,
      transport: "stdio",
      toolTimeout: 30000,
    },
    {
      id: "puppeteer",
      name: "Puppeteer (Browser Automation)",
      // 注意：此包已废弃 (DEPRECATED)，但仍可正常工作
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-puppeteer"],
      enabled: true,
      transport: "stdio",
      toolTimeout: 60000,
    },
    {
      id: "sequential-thinking",
      name: "Sequential Thinking",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
      enabled: true,
      transport: "stdio",
      toolTimeout: 30000,
    },
    {
      id: "memory",
      name: "Memory (Knowledge Graph)",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-memory"],
      enabled: true,
      transport: "stdio",
      toolTimeout: 30000,
    },
    {
      id: "figma-desktop",
      name: "Figma Desktop MCP",
      url: "http://127.0.0.1:3845/mcp",
      enabled: false,
      transport: "http",
      toolTimeout: 60000,
      initTimeout: 20000,
    },
    {
      id: "figma-remote",
      name: "Figma Remote MCP",
      url: "https://mcp.figma.com/mcp",
      authProvider: "figma",
      authHeaderName: "Authorization",
      authScheme: "bearer",
      enabled: false,
      transport: "http",
      toolTimeout: 60000,
      initTimeout: 20000,
    },
    // ===== 数据库工具 =====
    {
      id: "sqlite",
      name: "SQLite (Database)",
      command: "npx",
      args: ["-y", "mcp-server-sqlite"],
      enabled: false,
      transport: "stdio",
      toolTimeout: 30000,
    },
    // ===== 需要 API Key 的工具 =====
    {
      id: "github",
      name: "GitHub",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: {
        GITHUB_TOKEN: "", // 用户设置后启用
      },
      enabled: false,
      transport: "stdio",
      toolTimeout: 30000,
    },
    {
      id: "brave-search",
      name: "Brave Search",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-brave-search"],
      env: {
        BRAVE_API_KEY: "", // 免费额度: 每月 2000 次查询
      },
      enabled: false,
      transport: "stdio",
      toolTimeout: 60000,
    },
    // ===== 开发工具 =====
    {
      id: "git",
      name: "Git",
      command: "npx",
      args: ["-y", "@liangshanli/mcp-server-git"],
      enabled: false,
      transport: "stdio",
      toolTimeout: 30000,
    },
    {
      id: "postgres",
      name: "PostgreSQL",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-postgres"],
      env: {
        POSTGRES_CONNECTION_STRING: "", // 用户本地数据库
      },
      enabled: false,
      transport: "stdio",
      toolTimeout: 30000,
    },
  ],
};

/**
 * Get the path to the MCP configuration file
 */
export function getMCPConfigPath(): string {
	const env = process.env.MCP_CONFIG_PATH;
	if (env && env.trim()) {
		const trimmed = env.trim();
		if (trimmed === "~") return homedir();
		if (trimmed.startsWith("~/")) return join(homedir(), trimmed.slice(2));
		if (trimmed.startsWith("~")) return join(homedir(), trimmed.slice(1));
		return resolve(trimmed);
	}
	return join(getAgentDir(), "mcp.json");
}

/**
 * Load MCP configuration from file
 */
export function loadMCPConfig(): MCPConfig {
  const configPath = getMCPConfigPath();

  if (!existsSync(configPath)) {
    // Create default config
    const configDir = getAgentDir();
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    writeFileSync(
      configPath,
      JSON.stringify(DEFAULT_MCP_CONFIG, null, 2),
      "utf-8",
    );
    return DEFAULT_MCP_CONFIG;
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(content) as MCPConfig;
    const existingServers = parsed.mcpServers ?? [];
    const existingIds = new Set(existingServers.map((server) => server.id));
    const missingDefaults = DEFAULT_MCP_CONFIG.mcpServers.filter(
      (server) => !existingIds.has(server.id),
    );

    if (missingDefaults.length === 0) {
      return parsed;
    }

    const mergedConfig: MCPConfig = {
      mcpServers: [...existingServers, ...missingDefaults],
    };
    saveMCPConfig(mergedConfig);
    return mergedConfig;
  } catch (error) {
    console.error(`Failed to load MCP config: ${error}`);
    return DEFAULT_MCP_CONFIG;
  }
}

/**
 * Save MCP configuration to file
 */
export function saveMCPConfig(config: MCPConfig): void {
  const configPath = getMCPConfigPath();
  const configDir = getAgentDir();

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * Add an MCP server configuration
 */
export function addMCPServer(server: MCPServerConfig): void {
  const config = loadMCPConfig();

  // Remove existing server with same ID
  config.mcpServers = config.mcpServers.filter((s) => s.id !== server.id);

  // Add new server
  config.mcpServers.push(server);

  saveMCPConfig(config);
}

/**
 * Remove an MCP server configuration
 */
export function removeMCPServer(serverId: string): void {
  const config = loadMCPConfig();
  config.mcpServers = config.mcpServers.filter((s) => s.id !== serverId);
  saveMCPConfig(config);
}

/**
 * Update an MCP server configuration
 */
export function updateMCPServer(
  serverId: string,
  updates: Partial<MCPServerConfig>,
): void {
  const config = loadMCPConfig();
  const server = config.mcpServers.find((s) => s.id === serverId);

  if (server) {
    Object.assign(server, updates);
    saveMCPConfig(config);
  }
}

/**
 * Enable/disable an MCP server
 */
export function setMCPServerEnabled(serverId: string, enabled: boolean): void {
  updateMCPServer(serverId, { enabled });
}

/**
 * Get an MCP server by ID
 */
export function getMCPServer(serverId: string): MCPServerConfig | undefined {
  const config = loadMCPConfig();
  return config.mcpServers.find((s) => s.id === serverId);
}

/**
 * List all MCP servers
 */
export function listMCPServers(): MCPServerConfig[] {
  const config = loadMCPConfig();
  return config.mcpServers;
}

/**
 * List enabled MCP servers
 */
export function listEnabledMCPServers(): MCPServerConfig[] {
  const config = loadMCPConfig();
  return config.mcpServers.filter((s) => s.enabled !== false);
}
