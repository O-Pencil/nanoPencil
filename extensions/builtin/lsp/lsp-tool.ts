/**
 * [WHO]: Provides createLSPTool()
 * [FROM]: Depends on @sinclair/typebox, ./lsp-server-manager, ./lsp-formatters, ./types, node:fs, node:path
 * [TO]: Consumed by ./index.ts
 * [HERE]: extensions/builtin/lsp/lsp-tool.ts - LSP tool definition with TypeBox schema for 9 operations
 */

import { type Static, Type } from "@sinclair/typebox";
import { readFileSync, statSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import {
	formatDocumentSymbolResult,
	formatFindReferencesResult,
	formatGoToDefinitionResult,
	formatHoverResult,
	formatIncomingCallsResult,
	formatOutgoingCallsResult,
	formatPrepareCallHierarchyResult,
	formatWorkspaceSymbolResult,
} from "./lsp-formatters.js";
import type { LSPServerManager } from "./lsp-server-manager.js";
import { LSP_OPERATIONS, type LSPOperation, type LSPToolOutput } from "./types.js";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const lspSchema = Type.Object({
	operation: Type.Union(
		LSP_OPERATIONS.map((op) => Type.Literal(op)),
		{ description: "The LSP operation to perform" },
	),
	filePath: Type.String({ description: "Absolute path to the file" }),
	line: Type.Integer({ minimum: 1, description: "Line number (1-based)" }),
	character: Type.Integer({ minimum: 1, description: "Character offset (1-based)" }),
});

export type LSPInput = Static<typeof lspSchema>;

interface MethodAndParams {
	method: string;
	params: unknown;
}

function getMethodAndParams(
	operation: LSPOperation,
	filePath: string,
	line: number,
	character: number,
	cwd: string,
): MethodAndParams {
	// LSP uses 0-based coordinates
	const zeroBasedLine = line - 1;
	const zeroBasedChar = character - 1;

	let absolutePath = filePath;
	if (!absolutePath.startsWith("/")) {
		absolutePath = resolvePath(cwd, filePath);
	}
	const uri = `file://${absolutePath}`;

	const textDoc = { uri };
	const position = { line: zeroBasedLine, character: zeroBasedChar };

	switch (operation) {
		case "goToDefinition":
			return { method: "textDocument/definition", params: { textDocument: textDoc, position } };
		case "findReferences":
			return { method: "textDocument/references", params: { textDocument: textDoc, position, context: { includeDeclaration: true } } };
		case "hover":
			return { method: "textDocument/hover", params: { textDocument: textDoc, position } };
		case "documentSymbol":
			return { method: "textDocument/documentSymbol", params: { textDocument: textDoc } };
		case "workspaceSymbol":
			return { method: "workspace/symbol", params: { query: "" } };
		case "goToImplementation":
			return { method: "textDocument/implementation", params: { textDocument: textDoc, position } };
		case "prepareCallHierarchy":
			return { method: "textDocument/prepareCallHierarchy", params: { textDocument: textDoc, position } };
		case "incomingCalls":
			return { method: "textDocument/prepareCallHierarchy", params: { textDocument: textDoc, position } };
		case "outgoingCalls":
			return { method: "textDocument/prepareCallHierarchy", params: { textDocument: textDoc, position } };
	}
}

async function filterGitignored<T>(
	items: T[],
	getUri: (item: T) => string | undefined,
	cwd: string,
): Promise<T[]> {
	if (items.length === 0) return items;

	const { execFile: execFileCb } = await import("node:child_process");
	const { promisify } = await import("node:util");
	const execFileAsync = promisify(execFileCb);

	// Collect unique file paths from URIs
	const filePaths = new Set<string>();
	for (const item of items) {
		const uri = getUri(item);
		if (uri?.startsWith("file://")) {
			const path = decodeURIComponent(uri.slice(7));
			if (path.startsWith(cwd)) {
				filePaths.add(path);
			}
		}
	}

	if (filePaths.size === 0) return items;

	// Batch check with git check-ignore (groups of 50)
	const ignored = new Set<string>();
	const paths = Array.from(filePaths);
	for (let i = 0; i < paths.length; i += 50) {
		const batch = paths.slice(i, i + 50);
		try {
			const { stdout } = await execFileAsync("git", ["check-ignore", ...batch], { cwd });
			for (const line of stdout.split("\n")) {
				if (line.trim()) ignored.add(line.trim());
			}
		} catch {
			// git check-ignore exits non-zero when no files match — that's fine
		}
	}

	if (ignored.size === 0) return items;

	return items.filter((item) => {
		const uri = getUri(item);
		if (!uri?.startsWith("file://")) return true;
		const path = decodeURIComponent(uri.slice(7));
		return !ignored.has(path);
	});
}

export function createLSPTool(
	manager: LSPServerManager,
	cwd: string,
): {
	name: string;
	label: string;
	description: string;
	parameters: typeof lspSchema;
	isConcurrencySafe: true;
	isReadOnly: true;
	guidance: string;
	execute: (toolCallId: string, params: LSPInput, signal?: AbortSignal) => Promise<{ content: Array<{ type: "text"; text: string }>; details: LSPToolOutput | undefined }>;
} {
	return {
		name: "LSP",
		label: "LSP",
		description:
			"Interact with Language Server Protocol (LSP) servers to get code intelligence features. " +
			"Supported operations: goToDefinition, findReferences, hover, documentSymbol, workspaceSymbol, " +
			"goToImplementation, prepareCallHierarchy, incomingCalls, outgoingCalls. " +
			"All operations require filePath, line (1-based), and character (1-based).",
		parameters: lspSchema,
		isConcurrencySafe: true,
		isReadOnly: true,
		guidance:
			"Use LSP for code navigation: goToDefinition to find where a symbol is defined, " +
			"findReferences to find all uses, hover for documentation, documentSymbol for file outline, " +
			"workspaceSymbol to search across workspace, goToImplementation for interface implementations, " +
			"and incomingCalls/outgoingCalls for call hierarchy.",

		async execute(
			_toolCallId: string,
			{ operation, filePath, line, character }: LSPInput,
			signal?: AbortSignal,
		): Promise<{ content: Array<{ type: "text"; text: string }>; details: LSPToolOutput | undefined }> {
			if (signal?.aborted) throw new Error("Operation aborted");

			// Resolve absolute path
			let absolutePath = filePath;
			if (!absolutePath.startsWith("/")) {
				absolutePath = resolvePath(cwd, filePath);
			}

			// Validate file exists and is regular file
			try {
				const stat = statSync(absolutePath);
				if (!stat.isFile()) {
					return {
						content: [{ type: "text", text: `Error: ${filePath} is not a regular file.` }],
						details: undefined,
					};
				}
				if (stat.size > MAX_FILE_SIZE_BYTES) {
					return {
						content: [{ type: "text", text: `Error: ${filePath} exceeds 10MB limit for LSP operations.` }],
						details: undefined,
					};
				}
			} catch {
				return {
					content: [{ type: "text", text: `Error: File not found: ${filePath}` }],
					details: undefined,
				};
			}

			// Ensure server is running
			const server = await manager.ensureServerStarted(absolutePath);
			if (!server) {
				return {
					content: [{ type: "text", text: `No LSP server available for file type: ${filePath}` }],
					details: undefined,
				};
			}

			// Open file if not already open
			if (!manager.isFileOpen(absolutePath)) {
				const content = readFileSync(absolutePath, "utf-8");
				await manager.openFile(absolutePath, content);
			}

			if (signal?.aborted) throw new Error("Operation aborted");

			// Map operation to LSP method + params
			const { method, params } = getMethodAndParams(operation, absolutePath, line, character, cwd);

			// Two-step call hierarchy operations
			if (operation === "incomingCalls" || operation === "outgoingCalls") {
				const items = await manager.sendRequest<unknown[] | null>(absolutePath, method, params);
				if (!items || items.length === 0) {
					return {
						content: [{ type: "text", text: `No call hierarchy item at ${filePath}:${line}:${character}` }],
						details: { operation, result: "No call hierarchy item found.", filePath: absolutePath },
					};
				}

				const item = Array.isArray(items) ? items[0] : items;
				const callMethod = operation === "incomingCalls" ? "callHierarchy/incomingCalls" : "callHierarchy/outgoingCalls";
				const callResult = await manager.sendRequest<unknown[] | null>(absolutePath, callMethod, { item });

				const formatted = operation === "incomingCalls"
					? formatIncomingCallsResult(callResult as import("vscode-languageserver-types").CallHierarchyIncomingCall[] | null, cwd)
					: formatOutgoingCallsResult(callResult as import("vscode-languageserver-types").CallHierarchyOutgoingCall[] | null, cwd);

				return {
					content: [{ type: "text", text: formatted }],
					details: { operation, result: formatted, filePath: absolutePath },
				};
			}

			// Standard single-request operations
			const result = await manager.sendRequest<unknown>(absolutePath, method, params);

			// Filter gitignored files from location-based results
			let filteredResult = result;
			if (Array.isArray(result) && result.length > 0) {
				const first = result[0] as Record<string, unknown>;
				// Location[] / LocationLink[] — has top-level uri
				if (typeof first.uri === "string") {
					filteredResult = await filterGitignored(result, (item) => (item as { uri?: string }).uri, cwd);
				}
				// SymbolInformation[] — has location.uri
				else if (first.location && typeof (first.location as Record<string, unknown>).uri === "string") {
					filteredResult = await filterGitignored(result, (item) => (item as { location?: { uri?: string } }).location?.uri, cwd);
				}
			}

			// Format result
			let formatted: string;
			let resultCount: number | undefined;
			let fileCount: number | undefined;

			switch (operation) {
				case "goToDefinition": {
					const r = filteredResult as import("vscode-languageserver-types").Location | import("vscode-languageserver-types").Location[] | import("vscode-languageserver-types").LocationLink | import("vscode-languageserver-types").LocationLink[] | null;
					formatted = formatGoToDefinitionResult(r, cwd);
					const items = r ? (Array.isArray(r) ? r : [r]) : [];
					resultCount = items.length;
					break;
				}
				case "findReferences": {
					const r = filteredResult as import("vscode-languageserver-types").Location[] | null;
					formatted = formatFindReferencesResult(r, cwd);
					resultCount = r?.length;
					if (r && r.length > 0) {
						fileCount = new Set(r.map((l) => l.uri)).size;
					}
					break;
				}
				case "hover": {
					formatted = formatHoverResult(filteredResult as import("vscode-languageserver-types").Hover | null);
					break;
				}
				case "documentSymbol": {
					formatted = formatDocumentSymbolResult(
						filteredResult as import("vscode-languageserver-types").DocumentSymbol[] | import("vscode-languageserver-types").SymbolInformation[] | null,
						cwd,
					);
					resultCount = Array.isArray(filteredResult) ? filteredResult.length : 0;
					break;
				}
				case "workspaceSymbol": {
					const r = filteredResult as import("vscode-languageserver-types").SymbolInformation[] | null;
					formatted = formatWorkspaceSymbolResult(r, cwd);
					resultCount = r?.length;
					break;
				}
				case "goToImplementation": {
					const r = filteredResult as import("vscode-languageserver-types").Location | import("vscode-languageserver-types").Location[] | import("vscode-languageserver-types").LocationLink | import("vscode-languageserver-types").LocationLink[] | null;
					formatted = formatGoToDefinitionResult(r, cwd);
					const items = r ? (Array.isArray(r) ? r : [r]) : [];
					resultCount = items.length;
					break;
				}
				case "prepareCallHierarchy": {
					formatted = formatPrepareCallHierarchyResult(
						filteredResult as import("vscode-languageserver-types").CallHierarchyItem[] | null,
						cwd,
					);
					resultCount = Array.isArray(filteredResult) ? filteredResult.length : 0;
					break;
				}
			}

			return {
				content: [{ type: "text", text: formatted! }],
				details: { operation, result: formatted!, filePath: absolutePath, resultCount, fileCount },
			};
		},
	};
}
