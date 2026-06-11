/**
 * [WHO]: Provides discoverLspServers()
 * [FROM]: Depends on node:child_process (which probing)
 * [TO]: Consumed by ./lsp-server-manager.ts
 * [HERE]: extensions/builtin/lsp/lsp-config.ts - built-in LSP server discovery via which probing
 */

import { execFile } from "node:child_process";
import type { LspServerConfig } from "./types.js";

interface DefaultServerEntry {
	name: string;
	config: LspServerConfig;
}

const DEFAULT_SERVERS: DefaultServerEntry[] = [
	{
		name: "typescript",
		config: {
			command: "typescript-language-server",
			args: ["--stdio"],
			extensionToLanguage: {
				".ts": "typescript",
				".tsx": "typescriptreact",
				".js": "javascript",
				".jsx": "javascriptreact",
				".mts": "typescript",
				".mjs": "javascript",
				".cts": "typescript",
				".cjs": "javascript",
			},
			startupTimeout: 30_000,
			maxRestarts: 3,
		},
	},
	{
		name: "python",
		config: {
			command: "pyright-langserver",
			args: ["--stdio"],
			extensionToLanguage: {
				".py": "python",
				".pyi": "python",
			},
			startupTimeout: 30_000,
			maxRestarts: 3,
		},
	},
	{
		name: "rust",
		config: {
			command: "rust-analyzer",
			extensionToLanguage: {
				".rs": "rust",
			},
			startupTimeout: 60_000,
			maxRestarts: 3,
		},
	},
	{
		name: "go",
		config: {
			command: "gopls",
			extensionToLanguage: {
				".go": "go",
			},
			startupTimeout: 30_000,
			maxRestarts: 3,
		},
	},
];

function which(command: string): Promise<boolean> {
	return new Promise((resolve) => {
		execFile("which", [command], (error) => {
			resolve(!error);
		});
	});
}

export async function discoverLspServers(): Promise<Map<string, LspServerConfig>> {
	const result = new Map<string, LspServerConfig>();

	const checks = await Promise.all(DEFAULT_SERVERS.map(async (entry) => ({
		entry,
		available: await which(entry.config.command),
	})));

	for (const { entry, available } of checks) {
		if (available) {
			result.set(entry.name, entry.config);
		}
	}

	return result;
}
