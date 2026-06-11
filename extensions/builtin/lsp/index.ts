/**
 * [WHO]: lspExtension - registers LSP tool, manages server lifecycle, cleanup on shutdown
 * [FROM]: Depends on core/extensions-host/types, ./lsp-server-manager, ./lsp-tool
 * [TO]: Auto-loaded by builtin-extensions.ts as a default extension
 * [HERE]: extensions/builtin/lsp/index.ts - main LSP extension entry point
 */

import type { ExtensionAPI } from "../../../core/extensions-host/types.js";
import { createLSPServerManager, type LSPServerManager } from "./lsp-server-manager.js";
import { createLSPTool } from "./lsp-tool.js";

export default async function lspExtension(api: ExtensionAPI) {
	const manager: LSPServerManager = createLSPServerManager();

	// Initialize LSP servers (non-blocking — servers start lazily on first request)
	manager.initialize().catch(() => {
		// LSP initialization is optional; failures are silent
	});

	// Register the LSP tool
	const tool = createLSPTool(manager, api.cwd);
	api.registerTool(tool);

	// Cleanup on session shutdown
	api.on("session_shutdown", async () => {
		await manager.shutdown();
	});
}
