/**
 * MCP Extension
 *
 * Provides MCP (Model Context Protocol) tool integration.
 * This extension loads MCP servers and registers their tools.
 */

import type { ExtensionAPI } from "../../../core/extensions/types.js";
import { MCPManager } from "../../../core/mcp-manager.js";

let mcpManager: MCPManager | undefined;

/**
 * Extension factory function
 */
export default async function mcpExtension(pi: ExtensionAPI) {
	// Check if MCP is enabled via flag
	const enableMcp = pi.getFlag("enable-mcp") ?? false;
	if (!enableMcp) {
		console.log("[mcp] MCP disabled via flag");
		return;
	}

	console.log("[mcp] Initializing MCP...");

	try {
		mcpManager = new MCPManager();
		mcpManager.setWorkingDir(pi.cwd);
		await mcpManager.initialize();

		const mcpTools = mcpManager.getTools();

		// Register MCP tools
		for (const tool of mcpTools) {
			pi.registerTool(tool);
		}

		const status = mcpManager.getStatus();
		console.log(`[mcp] Loaded ${mcpTools.length} tools from ${status.startedServers.length} servers`);

		if (status.failedServers.length > 0) {
			console.warn(`[mcp] Failed servers: ${status.failedServers.join(", ")}`);
		}
	} catch (error) {
		console.error("[mcp] Failed to initialize:", error);
	}
}

/**
 * Get the MCP manager instance
 * Used by other parts of the system to access MCP functionality
 */
export function getMcpManager(): MCPManager | undefined {
	return mcpManager;
}
