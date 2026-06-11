/**
 * [WHO]: Provides createLSPServerManager(), LSPServerManager type
 * [FROM]: Depends on ./lsp-server-instance, ./lsp-config, node:path
 * [TO]: Consumed by ./index.ts
 * [HERE]: extensions/builtin/lsp/lsp-server-manager.ts - multi-server router with file extension mapping
 */

import { extname } from "node:path";
import { discoverLspServers } from "./lsp-config.js";
import { createLSPServerInstance, type LSPServerInstance } from "./lsp-server-instance.js";
import type { LspServerConfig } from "./types.js";

export interface LSPServerManager {
	initialize(): Promise<void>;
	shutdown(): Promise<void>;
	getServerForFile(filePath: string): LSPServerInstance | undefined;
	ensureServerStarted(filePath: string): Promise<LSPServerInstance | undefined>;
	sendRequest<T>(filePath: string, method: string, params: unknown): Promise<T | undefined>;
	getAllServers(): Map<string, LSPServerInstance>;
	openFile(filePath: string, content: string): Promise<void>;
	changeFile(filePath: string, content: string): Promise<void>;
	saveFile(filePath: string): Promise<void>;
	closeFile(filePath: string): Promise<void>;
	isFileOpen(filePath: string): boolean;
}

function pathToUri(filePath: string): string {
	if (filePath.startsWith("file://")) return filePath;
	const absolute = filePath.startsWith("/") ? filePath : `/${filePath}`;
	return `file://${absolute}`;
}

export function createLSPServerManager(): LSPServerManager {
	const servers = new Map<string, LSPServerInstance>();
	const extensionMap = new Map<string, string[]>();
	const openedFiles = new Map<string, string>();

	return {
		async initialize(): Promise<void> {
			const configs = await discoverLspServers();
			for (const [name, config] of configs) {
				for (const ext of Object.keys(config.extensionToLanguage)) {
					const lower = ext.toLowerCase();
					const existing = extensionMap.get(lower);
					if (existing) {
						existing.push(name);
					} else {
						extensionMap.set(lower, [name]);
					}
				}

				const instance = createLSPServerInstance(name, config);
				servers.set(name, instance);

				// Register workspace/configuration handler (some servers request this even when unsupported)
				instance.onRequest<{ items: unknown[] }, (null)[]>(
					"workspace/configuration",
					(params) => {
						const items = (params as { items?: unknown[] })?.items;
						if (!Array.isArray(items)) return [];
						return items.map(() => null);
					},
				);
			}
		},

		async shutdown(): Promise<void> {
			const stopPromises = Array.from(servers.values())
				.filter((s) => s.state === "running" || s.state === "error")
				.map((s) => s.stop().catch(() => {}));
			await Promise.allSettled(stopPromises);
			servers.clear();
			extensionMap.clear();
			openedFiles.clear();
		},

		getServerForFile(filePath: string): LSPServerInstance | undefined {
			const ext = extname(filePath).toLowerCase();
			const serverNames = extensionMap.get(ext);
			if (!serverNames || serverNames.length === 0) return undefined;
			return servers.get(serverNames[0]);
		},

		async ensureServerStarted(filePath: string): Promise<LSPServerInstance | undefined> {
			const server = this.getServerForFile(filePath);
			if (!server) return undefined;

			if (server.state === "stopped" || server.state === "error") {
				try {
					await server.start();
				} catch {
					return undefined;
				}
			}
			return server;
		},

		async sendRequest<T>(filePath: string, method: string, params: unknown): Promise<T | undefined> {
			const server = await this.ensureServerStarted(filePath);
			if (!server) return undefined;
			return server.sendRequest<T>(method, params);
		},

		getAllServers(): Map<string, LSPServerInstance> {
			return new Map(servers);
		},

		async openFile(filePath: string, content: string): Promise<void> {
			const server = await this.ensureServerStarted(filePath);
			if (!server) return;

			const uri = pathToUri(filePath);
			const key = `${uri}:${server.name}`;
			if (openedFiles.has(key)) return;

			const ext = extname(filePath).toLowerCase();
			const languageId = server.config.extensionToLanguage[ext] ?? "unknown";

			await server.sendNotification("textDocument/didOpen", {
				textDocument: {
					uri,
					languageId,
					version: 1,
					text: content,
				},
			});

			openedFiles.set(key, server.name);
		},

		async changeFile(filePath: string, content: string): Promise<void> {
			const server = this.getServerForFile(filePath);
			if (!server) return;

			const uri = pathToUri(filePath);
			const key = `${uri}:${server.name}`;

			if (!openedFiles.has(key)) {
				await this.openFile(filePath, content);
				return;
			}

			await server.sendNotification("textDocument/didChange", {
				textDocument: { uri, version: Date.now() },
				contentChanges: [{ text: content }],
			});
		},

		async saveFile(filePath: string): Promise<void> {
			const server = this.getServerForFile(filePath);
			if (!server) return;
			await server.sendNotification("textDocument/didSave", {
				textDocument: { uri: pathToUri(filePath) },
			});
		},

		async closeFile(filePath: string): Promise<void> {
			const server = this.getServerForFile(filePath);
			if (!server) return;

			const uri = pathToUri(filePath);
			const key = `${uri}:${server.name}`;

			await server.sendNotification("textDocument/didClose", {
				textDocument: { uri },
			});

			openedFiles.delete(key);
		},

		isFileOpen(filePath: string): boolean {
			const server = this.getServerForFile(filePath);
			if (!server) return false;
			const uri = pathToUri(filePath);
			return openedFiles.has(`${uri}:${server.name}`);
		},
	};
}
