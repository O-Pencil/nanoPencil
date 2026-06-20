/**
 * [WHO]: Provides MCPServerConfig, MCPTool, MCPToolResult shared MCP contracts
 * [FROM]: No runtime dependencies; pure type surface for MCP client/config/adapter
 * [TO]: Consumed by core/mcp/mcp-client.ts, mcp-config.ts, mcp-manager.ts, mcp-adapter.ts, index.ts
 * [HERE]: core/mcp/mcp-types.ts - shared contracts that keep MCP client/config acyclic
 */

export interface MCPServerConfig {
  /** Unique identifier for this server */
  id: string;
  /** Display name */
  name: string;
  /** Command to start the server (e.g., "npx", "uvx") */
  command?: string;
  /** Arguments to pass to the command */
  args?: string[];
  /** Streamable HTTP endpoint for remote/local HTTP MCP servers */
  url?: string;
  /** SSE endpoint URL for SSE transport (separate from `url` which is for HTTP POST) */
  sseUrl?: string;
  /** Additional headers for HTTP MCP servers */
  headers?: Record<string, string>;
  /** Credential provider id stored in auth.json for HTTP MCP servers */
  authProvider?: string;
  /** Header name to use when authProvider resolves a token */
  authHeaderName?: string;
  /** Header auth scheme. "bearer" prefixes the token, "raw" passes it as-is */
  authScheme?: "bearer" | "raw";
  /** Environment variables to pass */
  env?: Record<string, string>;
  /** Transport type: "stdio", "sse", or "http" */
  transport?: "stdio" | "sse" | "http";
  /** Whether this server is enabled */
  enabled?: boolean;
  /** Tool call timeout in milliseconds (default: 20000) */
  toolTimeout?: number;
  /** Initialize request timeout in milliseconds (default: 20000) */
  initTimeout?: number;
  /** Working directory for the server process */
  cwd?: string;
}

export interface MCPTool {
  /** Tool name (server_id/tool_name format) */
  name: string;
  /** Display name */
  displayName?: string;
  /** Tool description */
  description: string;
  /** JSON Schema for input */
  inputSchema: Record<string, unknown>;
  /** Server ID */
  serverId: string;
}

export interface MCPToolResult {
  /** Tool result content */
  content: Array<{
    type: "text" | "image" | "resource";
    text?: string;
    data?: any;
  }>;
  /** Error message if call failed */
  error?: string;
  /** Whether result is partial (hasMore=true) */
  isPartial?: boolean;
}
