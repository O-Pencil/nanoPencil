/**
 * [WHO]: Provides createLSPServerInstance(), LSPServerInstance type
 * [FROM]: Depends on ./lsp-client, vscode-languageserver-protocol
 * [TO]: Consumed by ./lsp-server-manager.ts
 * [HERE]: extensions/builtin/lsp/lsp-server-instance.ts - single LSP server lifecycle with crash recovery
 */

import type {
	InitializeParams,
	InitializeResult,
} from "vscode-languageserver-protocol";
import { createLSPClient, type LSPClient } from "./lsp-client.js";
import type { LspServerConfig, LspServerState } from "./types.js";

const LSP_ERROR_CONTENT_MODIFIED = -32801;
const MAX_RETRIES_FOR_TRANSIENT_ERRORS = 3;
const RETRY_BASE_DELAY_MS = 500;

export interface LSPServerInstance {
	readonly name: string;
	readonly config: LspServerConfig;
	readonly state: LspServerState;
	readonly startTime: Date | undefined;
	readonly lastError: Error | undefined;
	readonly restartCount: number;
	start(): Promise<void>;
	stop(): Promise<void>;
	restart(): Promise<void>;
	isHealthy(): boolean;
	sendRequest<T>(method: string, params: unknown): Promise<T>;
	sendNotification(method: string, params: unknown): Promise<void>;
	onNotification(method: string, handler: (params: unknown) => void): void;
	onRequest<TParams, TResult>(method: string, handler: (params: TParams) => TResult | Promise<TResult>): void;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`Timeout: ${label} (${ms}ms)`)), ms);
		promise.then(
			(val) => { clearTimeout(timer); resolve(val); },
			(err) => { clearTimeout(timer); reject(err); },
		);
	});
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

export function createLSPServerInstance(name: string, config: LspServerConfig): LSPServerInstance {
	let state: LspServerState = "stopped";
	let startTime: Date | undefined;
	let lastError: Error | undefined;
	let restartCount = 0;
	let crashRecoveryCount = 0;
	let client: LSPClient | undefined;

	const maxRestarts = config.maxRestarts ?? 3;

	function onCrash(error: Error) {
		state = "error";
		lastError = error;
		crashRecoveryCount++;
	}

	return {
		get name() { return name; },
		get config() { return config; },
		get state() { return state; },
		get startTime() { return startTime; },
		get lastError() { return lastError; },
		get restartCount() { return restartCount; },

		async start(): Promise<void> {
			if (state === "running" || state === "starting") return;

			if (state === "error" && crashRecoveryCount > maxRestarts) {
				throw new Error(`LSP server ${name} exceeded max restart attempts (${maxRestarts})`);
			}

			state = "starting";
			lastError = undefined;

			try {
				client = createLSPClient(name, onCrash);

				const startPromise = client.start(config.command, config.args ?? [], { env: config.env });
				const timeout = config.startupTimeout ?? 30_000;
				await withTimeout(startPromise, timeout, `${name} start`);

				const cwd = process.cwd();
				const initParams: InitializeParams = {
					processId: process.pid,
					rootUri: `file://${cwd}`,
					capabilities: {
						textDocument: {
							synchronization: {
								dynamicRegistration: false,
								willSave: false,
								didSave: true,
								willSaveWaitUntil: false,
							},
							publishDiagnostics: { relatedInformation: false },
							hover: {
								dynamicRegistration: false,
								contentFormat: ["markdown", "plaintext"],
							},
							definition: { dynamicRegistration: false, linkSupport: false },
							references: { dynamicRegistration: false },
							documentSymbol: {
								dynamicRegistration: false,
								symbolKind: { valueSet: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26] },
								hierarchicalDocumentSymbolSupport: true,
							},
							callHierarchy: { dynamicRegistration: false },
						},
						workspace: {
							configuration: false,
							workspaceFolders: false,
						},
					},
					initializationOptions: config.initializationOptions,
				};

				const initPromise = client.initialize(initParams);
				await withTimeout(initPromise, timeout, `${name} initialize`);

				state = "running";
				startTime = new Date();
				crashRecoveryCount = 0;
			} catch (err) {
				state = "error";
				lastError = err instanceof Error ? err : new Error(String(err));
				throw lastError;
			}
		},

		async stop(): Promise<void> {
			if (state === "stopped" || state === "stopping") return;
			state = "stopping";
			try {
				await client?.stop();
			} finally {
				client = undefined;
				state = "stopped";
			}
		},

		async restart(): Promise<void> {
			await this.stop();
			restartCount++;
			if (restartCount > maxRestarts) {
				throw new Error(`LSP server ${name} exceeded max restarts (${maxRestarts})`);
			}
			await this.start();
		},

		isHealthy(): boolean {
			return state === "running" && (client?.isInitialized ?? false);
		},

		async sendRequest<T>(method: string, params: unknown): Promise<T> {
			if (!this.isHealthy()) {
				throw new Error(`LSP server ${name} is not healthy (state: ${state})`);
			}

			let lastErr: Error | undefined;
			for (let attempt = 0; attempt <= MAX_RETRIES_FOR_TRANSIENT_ERRORS; attempt++) {
				try {
					return await client!.sendRequest<T>(method, params);
				} catch (err: unknown) {
					const code = (err as { code?: number }).code;
					if (code === LSP_ERROR_CONTENT_MODIFIED && attempt < MAX_RETRIES_FOR_TRANSIENT_ERRORS) {
						await sleep(RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
						lastErr = err instanceof Error ? err : new Error(String(err));
						continue;
					}
					throw err;
				}
			}
			throw lastErr ?? new Error(`Request failed after retries: ${method}`);
		},

		async sendNotification(method: string, params: unknown): Promise<void> {
			if (!this.isHealthy()) return;
			await client!.sendNotification(method, params);
		},

		onNotification(method: string, handler: (params: unknown) => void): void {
			client?.onNotification(method, handler);
		},

		onRequest<TParams, TResult>(method: string, handler: (params: TParams) => TResult | Promise<TResult>): void {
			client?.onRequest(method, handler);
		},
	};
}
