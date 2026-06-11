/**
 * [WHO]: LspServerState, LspServerConfig, LSPOperation, LSPToolInput, LSPToolOutput
 * [FROM]: No external dependencies
 * [TO]: Consumed by all other lsp/ modules
 * [HERE]: extensions/builtin/lsp/types.ts - type definitions for the LSP extension
 */

export type LspServerState = "stopped" | "starting" | "running" | "stopping" | "error";

export interface LspServerConfig {
	command: string;
	args?: string[];
	extensionToLanguage: Record<string, string>;
	env?: Record<string, string>;
	initializationOptions?: unknown;
	startupTimeout?: number;
	maxRestarts?: number;
}

export const LSP_OPERATIONS = [
	"goToDefinition",
	"findReferences",
	"hover",
	"documentSymbol",
	"workspaceSymbol",
	"goToImplementation",
	"prepareCallHierarchy",
	"incomingCalls",
	"outgoingCalls",
] as const;

export type LSPOperation = (typeof LSP_OPERATIONS)[number];

export interface LSPToolInput {
	operation: LSPOperation;
	filePath: string;
	line: number;
	character: number;
}

export interface LSPToolOutput {
	operation: LSPOperation;
	result: string;
	filePath: string;
	resultCount?: number;
	fileCount?: number;
}
