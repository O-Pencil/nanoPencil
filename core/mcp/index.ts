/**
 * [WHO]: MCP module barrel exports
 * [FROM]: Depends on mcp-client, mcp-adapter, mcp-config, mcp-guidance, figma-auth
 * [TO]: Consumed by core/index.ts
 * [HERE]: core/mcp/index.ts - MCP module public API
 */
export { MCPClient } from "./mcp-client.js";
export type { MCPServerConfig, MCPTool, MCPToolResult } from "./mcp-client.js";

export {
  createMCPTool,
  getMCPToolDisplayName,
  loadMCPTools,
} from "./mcp-adapter.js";
export {
  API_KEY_GUIDANCE,
  formatGuidanceMessage,
  getAPIKeyGuidance,
  getMissingKeyServers,
  getOptionalAPIKeyServers,
  requiresAPIKey,
} from "./mcp-guidance.js";
export type { APIKeyGuidance } from "./mcp-guidance.js";
