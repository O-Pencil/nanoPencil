/**
 * [WHO]: 8 formatter functions for LSP operation results
 * [FROM]: Depends on vscode-languageserver-types for Location, Hover, DocumentSymbol, etc.
 * [TO]: Consumed by ./lsp-tool.ts
 * [HERE]: extensions/builtin/lsp/lsp-formatters.ts - human-readable result formatting for 9 LSP operations
 */

import type {
	CallHierarchyIncomingCall,
	CallHierarchyItem,
	CallHierarchyOutgoingCall,
	DocumentSymbol,
	Hover,
	Location,
	LocationLink,
	MarkedString,
	MarkupContent,
	SymbolInformation,
} from "vscode-languageserver-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatUri(uri: string, cwd: string): string {
	let decoded = uri;
	if (decoded.startsWith("file://")) {
		decoded = decodeURIComponent(decoded.slice(7));
		// Strip Windows drive letter prefix if present
		if (/^\/[A-Z]:/i.test(decoded)) {
			decoded = decoded.slice(1);
		}
	}
	// Try relative path if shorter
	if (decoded.startsWith(cwd + "/")) {
		const rel = decoded.slice(cwd.length + 1);
		if (!rel.startsWith("..")) return rel;
	}
	return decoded;
}

function formatLocation(loc: Location, cwd: string): string {
	const file = formatUri(loc.uri, cwd);
	const line = loc.range.start.line + 1;
	const char = loc.range.start.character + 1;
	return `${file}:${line}:${char}`;
}

function groupByFile<T>(items: T[], getUri: (item: T) => string, cwd: string): Map<string, T[]> {
	const groups = new Map<string, T[]>();
	for (const item of items) {
		const uri = getUri(item);
		if (!uri) continue;
		const file = formatUri(uri, cwd);
		const arr = groups.get(file);
		if (arr) {
			arr.push(item);
		} else {
			groups.set(file, [item]);
		}
	}
	return groups;
}

function locationLinkToLocation(link: LocationLink): Location {
	return {
		uri: link.targetUri,
		range: link.targetSelectionRange ?? link.targetRange,
	};
}

function extractMarkupText(contents: MarkupContent | MarkedString | MarkedString[]): string {
	if (!contents) return "";
	if (typeof contents === "string") return contents;
	if (Array.isArray(contents)) {
		return contents
			.map((c) => (typeof c === "string" ? c : c.value))
			.join("\n\n");
	}
	if ("kind" in contents) return contents.value;
	if ("language" in contents) return `\`\`\`${contents.language}\n${contents.value}\n\`\`\``;
	return String(contents);
}

function symbolKindToString(kind: number): string {
	const kinds: Record<number, string> = {
		1: "File", 2: "Module", 3: "Namespace", 4: "Package", 5: "Class",
		6: "Method", 7: "Property", 8: "Field", 9: "Constructor", 10: "Enum",
		11: "Interface", 12: "Function", 13: "Variable", 14: "Constant",
		15: "String", 16: "Number", 17: "Boolean", 18: "Array", 19: "Object",
		20: "Key", 21: "Null", 22: "EnumMember", 23: "Struct", 24: "Event",
		25: "Operator", 26: "TypeParameter",
	};
	return kinds[kind] ?? `Kind(${kind})`;
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

export function formatGoToDefinitionResult(
	result: Location | Location[] | LocationLink | LocationLink[] | null,
	cwd: string,
): string {
	if (!result) return "No definition found.";

	const items = Array.isArray(result) ? result : [result];
	if (items.length === 0) return "No definition found.";

	const locations = items.map((item) => {
		if ("targetUri" in item) return locationLinkToLocation(item as LocationLink);
		return item as Location;
	});

	if (locations.length === 1) {
		return `Definition: ${formatLocation(locations[0], cwd)}`;
	}

	const lines = locations.map((loc) => `- ${formatLocation(loc, cwd)}`);
	return `Found ${locations.length} definitions:\n${lines.join("\n")}`;
}

export function formatFindReferencesResult(result: Location[] | null, cwd: string): string {
	if (!result || result.length === 0) return "No references found.";

	const groups = groupByFile(result, (l) => l.uri, cwd);
	const lines: string[] = [];

	for (const [file, locs] of groups) {
		lines.push(`${file}:`);
		for (const loc of locs) {
			const line = loc.range.start.line + 1;
			const char = loc.range.start.character + 1;
			lines.push(`  ${line}:${char}`);
		}
	}

	return `Found ${result.length} reference(s) in ${groups.size} file(s):\n${lines.join("\n")}`;
}

export function formatHoverResult(result: Hover | null): string {
	if (!result?.contents) return "No hover information available.";
	return extractMarkupText(result.contents);
}

export function formatDocumentSymbolResult(
	result: DocumentSymbol[] | SymbolInformation[] | null,
	cwd: string,
): string {
	if (!result || result.length === 0) return "No symbols found.";

	// Detect hierarchical vs flat
	const isHierarchical = result.length > 0 && "children" in (result[0] as DocumentSymbol);

	if (isHierarchical) {
		const lines: string[] = [];
		function walk(symbols: DocumentSymbol[], indent: number) {
			for (const sym of symbols) {
				const line = sym.range.start.line + 1;
				lines.push(`${"  ".repeat(indent)}${symbolKindToString(sym.kind)} ${sym.name} (line ${line})`);
				if (sym.children?.length) {
					walk(sym.children, indent + 1);
				}
			}
		}
		walk(result as DocumentSymbol[], 0);
		return lines.join("\n");
	}

	// Flat format (SymbolInformation[])
	const lines = (result as SymbolInformation[]).map((sym) => {
		const file = formatUri(sym.location.uri, cwd);
		const line = sym.location.range.start.line + 1;
		return `${symbolKindToString(sym.kind)} ${sym.name} — ${file}:${line}`;
	});

	return lines.join("\n");
}

export function formatWorkspaceSymbolResult(
	result: SymbolInformation[] | null,
	cwd: string,
): string {
	if (!result || result.length === 0) return "No workspace symbols found.";

	const groups = groupByFile(result, (s) => s.location?.uri ?? "", cwd);
	const lines: string[] = [];

	for (const [file, syms] of groups) {
		lines.push(`${file}:`);
		for (const sym of syms) {
			const line = sym.location.range.start.line + 1;
			lines.push(`  ${symbolKindToString(sym.kind)} ${sym.name} (line ${line})`);
		}
	}

	return `Found ${result.length} symbol(s) in ${groups.size} file(s):\n${lines.join("\n")}`;
}

export function formatPrepareCallHierarchyResult(
	result: CallHierarchyItem[] | null,
	cwd: string,
): string {
	if (!result || result.length === 0) return "No call hierarchy item found.";

	return result.map((item) => {
		const file = formatUri(item.uri, cwd);
		const line = item.range.start.line + 1;
		return `${symbolKindToString(item.kind)} ${item.name} — ${file}:${line}`;
	}).join("\n");
}

export function formatIncomingCallsResult(
	result: CallHierarchyIncomingCall[] | null,
	cwd: string,
): string {
	if (!result || result.length === 0) return "No incoming calls found.";

	const groups = groupByFile(result, (c) => c.from.uri, cwd);
	const lines: string[] = [];

	for (const [file, calls] of groups) {
		lines.push(`${file}:`);
		for (const call of calls) {
			const callerLine = call.from.range.start.line + 1;
			lines.push(`  ${symbolKindToString(call.from.kind)} ${call.from.name} (line ${callerLine})`);
			for (const loc of call.fromRanges) {
				lines.push(`    call at line ${loc.start.line + 1}:${loc.start.character + 1}`);
			}
		}
	}

	return `Found ${result.length} incoming call(s) from ${groups.size} file(s):\n${lines.join("\n")}`;
}

export function formatOutgoingCallsResult(
	result: CallHierarchyOutgoingCall[] | null,
	cwd: string,
): string {
	if (!result || result.length === 0) return "No outgoing calls found.";

	const groups = groupByFile(result, (c) => c.to.uri, cwd);
	const lines: string[] = [];

	for (const [file, calls] of groups) {
		lines.push(`${file}:`);
		for (const call of calls) {
			const calleeLine = call.to.range.start.line + 1;
			lines.push(`  ${symbolKindToString(call.to.kind)} ${call.to.name} (line ${calleeLine})`);
			for (const loc of call.fromRanges) {
				lines.push(`    call at line ${loc.start.line + 1}:${loc.start.character + 1}`);
			}
		}
	}

	return `Found ${result.length} outgoing call(s) to ${groups.size} file(s):\n${lines.join("\n")}`;
}
