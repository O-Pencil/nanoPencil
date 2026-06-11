/**
 * [WHO]: Provides createLSPClient(), LSPClient type
 * [FROM]: Depends on node:child_process, vscode-jsonrpc/node.js
 * [TO]: Consumed by ./lsp-server-instance.ts
 * [HERE]: extensions/builtin/lsp/lsp-client.ts - stdio JSON-RPC client for LSP servers
 */

import { type ChildProcess, spawn } from "node:child_process";
import type {
	MessageConnection,
} from "vscode-jsonrpc/node.js";
import {
	createMessageConnection,
	StreamMessageReader,
	StreamMessageWriter,
} from "vscode-jsonrpc/node.js";
import type {
	InitializeParams,
	InitializeResult,
	ServerCapabilities,
} from "vscode-languageserver-protocol";

export interface LSPClient {
	readonly capabilities: ServerCapabilities | undefined;
	readonly isInitialized: boolean;
	start(command: string, args: string[], options?: { env?: Record<string, string>; cwd?: string }): Promise<void>;
	initialize(params: InitializeParams): Promise<InitializeResult>;
	sendRequest<TResult>(method: string, params: unknown): Promise<TResult>;
	sendNotification(method: string, params: unknown): Promise<void>;
	onNotification(method: string, handler: (params: unknown) => void): void;
	onRequest<TParams, TResult>(method: string, handler: (params: TParams) => TResult | Promise<TResult>): void;
	stop(): Promise<void>;
}

export function createLSPClient(serverName: string, onCrash?: (error: Error) => void): LSPClient {
	let childProcess: ChildProcess | undefined;
	let connection: MessageConnection | undefined;
	let capabilities: ServerCapabilities | undefined;
	let isInitialized = false;
	let isStopping = false;
	let startFailed = false;
	let startError: Error | undefined;

	const pendingHandlers: Array<{ method: string; handler: (params: unknown) => void }> = [];
	const pendingRequestHandlers: Array<{ method: string; handler: (params: unknown) => unknown | Promise<unknown> }> = [];

	function flushPendingHandlers() {
		if (!connection) return;
		for (const { method, handler } of pendingHandlers) {
			connection.onNotification(method, handler);
		}
		pendingHandlers.length = 0;
		for (const { method, handler } of pendingRequestHandlers) {
			connection.onRequest(method, handler);
		}
		pendingRequestHandlers.length = 0;
	}

	return {
		get capabilities() {
			return capabilities;
		},
		get isInitialized() {
			return isInitialized;
		},

		async start(command: string, args: string[], options?: { env?: Record<string, string>; cwd?: string }): Promise<void> {
			if (startFailed) {
				throw startError ?? new Error(`LSP server ${serverName} previously failed to start`);
			}

			return new Promise<void>((resolve, reject) => {
				try {
					const child = spawn(command, args, {
						stdio: ["pipe", "pipe", "pipe"],
						env: { ...process.env, ...options?.env },
						cwd: options?.cwd,
					});

					let spawnConfirmed = false;

					child.on("spawn", () => {
						spawnConfirmed = true;
						childProcess = child;

						const reader = new StreamMessageReader(child.stdout!);
						const writer = new StreamMessageWriter(child.stdin!);
						connection = createMessageConnection(reader, writer);

						connection.onError((error) => {
							if (!isStopping) {
								console.error(`[LSP:${serverName}] Connection error:`, error);
							}
						});

						connection.onClose(() => {
							if (!isStopping) {
								isInitialized = false;
								onCrash?.(new Error(`LSP server ${serverName} connection closed unexpectedly`));
							}
						});

						connection.listen();
						flushPendingHandlers();
						resolve();
					});

					child.on("error", (err) => {
						if (!spawnConfirmed) {
							startFailed = true;
							startError = err;
							reject(err);
						} else if (!isStopping) {
							console.error(`[LSP:${serverName}] Process error:`, err);
						}
					});

					child.on("exit", (code) => {
						if (!isStopping && code !== 0) {
							isInitialized = false;
							const err = new Error(`LSP server ${serverName} exited with code ${code}`);
							if (!spawnConfirmed) {
								startFailed = true;
								startError = err;
								reject(err);
							} else {
								onCrash?.(err);
							}
						}
					});

					child.stderr?.on("data", () => {
						// Suppress stderr output from LSP servers
					});
				} catch (err) {
					startFailed = true;
					startError = err instanceof Error ? err : new Error(String(err));
					reject(startError);
				}
			});
		},

		async initialize(params: InitializeParams): Promise<InitializeResult> {
			if (!connection) {
				throw new Error(`LSP client ${serverName} not started`);
			}
			const result = await connection.sendRequest<InitializeResult>("initialize", params);
			capabilities = result.capabilities;
			await connection.sendNotification("initialized", {});
			isInitialized = true;
			return result;
		},

		async sendRequest<TResult>(method: string, params: unknown): Promise<TResult> {
			if (!connection || !isInitialized) {
				throw new Error(`LSP client ${serverName} not initialized`);
			}
			return connection.sendRequest<TResult>(method, params);
		},

		async sendNotification(method: string, params: unknown): Promise<void> {
			if (!connection) return;
			try {
				await connection.sendNotification(method, params);
			} catch {
				// Fire-and-forget: swallow notification errors
			}
		},

		onNotification(method: string, handler: (params: unknown) => void): void {
			if (connection) {
				connection.onNotification(method, handler);
			} else {
				pendingHandlers.push({ method, handler });
			}
		},

		onRequest<TParams, TResult>(method: string, handler: (params: TParams) => TResult | Promise<TResult>): void {
			if (connection) {
				connection.onRequest(method, handler);
			} else {
				pendingRequestHandlers.push({ method, handler: handler as (params: unknown) => unknown });
			}
		},

		async stop(): Promise<void> {
			isStopping = true;
			try {
				if (connection && isInitialized) {
					await connection.sendRequest("shutdown");
					await connection.sendNotification("exit");
				}
			} catch {
				// Best effort shutdown
			} finally {
				connection?.dispose();
				connection = undefined;
				isInitialized = false;

				if (childProcess) {
					childProcess.removeAllListeners();
					if (!childProcess.killed) {
						childProcess.kill();
					}
					childProcess = undefined;
				}
			}
		},
	};
}
