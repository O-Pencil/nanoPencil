/**
 * MCP (Model Context Protocol) Module
 *
 * Exports MCP client and adapter functionality.
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
