/**
 * [WHO]: TerrainNode, TerrainEdge, TerrainSnapshot, buildTerrainIndex(), checkDipCoverage(), CoverageReport
 * [FROM]: Depends on node:fs, node:path
 * [TO]: Consumed by extensions/defaults/sal/anchors.ts, extensions/defaults/sal/index.ts
 * [HERE]: extensions/defaults/sal/terrain.ts - terrain graph builder from DIP P2/P3 headers
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export type TerrainNodeKind = "root" | "module" | "file";

export interface TerrainNode {
	id: string; // canonical: posix-style relative path from workspace root
	kind: TerrainNodeKind;
	label: string;
	modulePath?: string; // posix-style module dir path
	filePath?: string; // posix-style file path
	// Parsed P3 fields when kind === "file"
	p3Who?: string;
	p3From?: string;
	p3To?: string;
	p3Here?: string;
	hasP3: boolean;
	// Parsed P2 summary line(s) when kind === "module"
	p2Summary?: string;
	mtimeMs: number;
}

export interface TerrainEdge {
	fromId: string;
	toId: string;
	type: "contains" | "adjacent-to";
}

export interface TerrainSnapshot {
	workspaceRoot: string;
	generatedAt: number;
	nodes: TerrainNode[];
	edges: TerrainEdge[];
	// fileId -> moduleId index for fast lookup
	moduleByFile: Record<string, string>;
}

export interface CoverageReport {
	module: string;
	totalFiles: number;
	filesWithP3: number;
	coveragePct: number;
	hasP2: boolean;
	missingFields: number; // count of files where any of WHO/FROM/TO/HERE empty
}

const IGNORED_DIRS = new Set([
	"node_modules",
	".git",
	"dist",
	"build",
	".next",
	".cache",
	"coverage",
	".memory-experiments",
	".pencil",
	".nanopencil",
	"out",
	".turbo",
]);

const SOURCE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts"]);

/** P2 module map files: prefer AGENT.md; CLAUDE.md supported for legacy trees. */
const DIP_MODULE_MAP_FILENAMES = ["AGENT.md", "CLAUDE.md"] as const;

function dipModuleMapFileName(rel: string): (typeof DIP_MODULE_MAP_FILENAMES)[number] | undefined {
	for (const name of DIP_MODULE_MAP_FILENAMES) {
		if (rel === name || rel.endsWith(`/${name}`)) return name;
	}
	return undefined;
}

function toPosix(p: string): string {
	return p.split(sep).join("/");
}

interface WalkEntry {
	abs: string;
	rel: string; // posix-style
	mtimeMs: number;
}

function walk(root: string): { files: WalkEntry[]; dirs: WalkEntry[] } {
	const files: WalkEntry[] = [];
	const dirs: WalkEntry[] = [];
	const stack: string[] = [root];
	while (stack.length > 0) {
		const current = stack.pop();
		if (!current) break;
		let entries: import("node:fs").Dirent[];
		try {
			entries = readdirSync(current, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (entry.name.startsWith(".") && entry.name !== ".") {
				// allow .pencil-style files via AGENT.md, but skip dot dirs by default
				if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue;
				if (entry.isDirectory()) continue;
			}
			if (entry.isDirectory()) {
				if (IGNORED_DIRS.has(entry.name)) continue;
				const abs = join(current, entry.name);
				const rel = toPosix(relative(root, abs));
				let mtimeMs = 0;
				try {
					mtimeMs = statSync(abs).mtimeMs;
				} catch {
					// ignore
				}
				dirs.push({ abs, rel, mtimeMs });
				stack.push(abs);
			} else if (entry.isFile()) {
				const abs = join(current, entry.name);
				const rel = toPosix(relative(root, abs));
				let mtimeMs = 0;
				try {
					mtimeMs = statSync(abs).mtimeMs;
				} catch {
					// ignore
				}
				files.push({ abs, rel, mtimeMs });
			}
		}
	}
	return { files, dirs };
}

const P3_BLOCK_RE = /\/\*\*([\s\S]*?)\*\//;

interface P3Fields {
	who?: string;
	from?: string;
	to?: string;
	here?: string;
}

function parseP3Header(content: string): P3Fields | undefined {
	const match = content.match(P3_BLOCK_RE);
	if (!match) return undefined;
	const block = match[1];
	if (!/\[WHO\]|\[FROM\]|\[TO\]|\[HERE\]/.test(block)) return undefined;
	const lines = block.split("\n").map((l) => l.replace(/^\s*\*\s?/, "").trim());
	const fields: P3Fields = {};
	let currentKey: keyof P3Fields | undefined;
	for (const line of lines) {
		const tagMatch = line.match(/^\[(WHO|FROM|TO|HERE)\]:\s*(.*)$/);
		if (tagMatch) {
			currentKey = tagMatch[1].toLowerCase() as keyof P3Fields;
			fields[currentKey] = tagMatch[2].trim();
		} else if (currentKey && line.length > 0) {
			fields[currentKey] = `${fields[currentKey] ?? ""} ${line}`.trim();
		}
	}
	return fields;
}

function parseP2Summary(content: string): string | undefined {
	// Take the first non-empty paragraph below "## Overview" or the first H2 description.
	const lines = content.split("\n");
	let inOverview = false;
	const buf: string[] = [];
	for (const line of lines) {
		if (/^##\s+Overview/i.test(line)) {
			inOverview = true;
			continue;
		}
		if (inOverview) {
			if (/^##\s+/.test(line)) break;
			if (line.trim().length > 0) buf.push(line.trim());
			if (buf.join(" ").length > 400) break;
		}
	}
	if (buf.length > 0) return buf.join(" ").slice(0, 400);
	// Fallback: first non-header non-empty line
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		if (trimmed.startsWith("#") || trimmed.startsWith(">")) continue;
		return trimmed.slice(0, 400);
	}
	return undefined;
}

/**
 * Build a terrain index from a workspace root.
 * Coarse, file/module-level only. Symbol-level deferred.
 */
export function buildTerrainIndex(workspaceRoot: string): TerrainSnapshot {
	const { files } = walk(workspaceRoot);
	const nodes: TerrainNode[] = [];
	const edges: TerrainEdge[] = [];
	const moduleByFile: Record<string, string> = {};

	const moduleNodes = new Map<string, TerrainNode>();
	const fileNodes: TerrainNode[] = [];

	// Pass 1: P2 module nodes from AGENT.md (or legacy CLAUDE.md) files
	for (const f of files) {
		const dipName = dipModuleMapFileName(f.rel);
		if (!dipName) continue;
		const modulePath = f.rel === dipName ? "" : f.rel.slice(0, f.rel.length - dipName.length - 1);
		let p2Summary: string | undefined;
		try {
			const content = readFileSync(f.abs, "utf-8");
			p2Summary = parseP2Summary(content);
		} catch {
			// ignore
		}
		const id = modulePath || "<root>";
		const node: TerrainNode = {
			id,
			kind: modulePath ? "module" : "root",
			label: modulePath || "<root>",
			modulePath: modulePath || undefined,
			p2Summary,
			hasP3: false,
			mtimeMs: f.mtimeMs,
		};
		moduleNodes.set(id, node);
		nodes.push(node);
	}

	// Pass 2: file nodes for source files
	for (const f of files) {
		const dotIdx = f.rel.lastIndexOf(".");
		if (dotIdx < 0) continue;
		const ext = f.rel.slice(dotIdx);
		if (!SOURCE_EXTS.has(ext)) continue;

		let p3: P3Fields | undefined;
		try {
			const content = readFileSync(f.abs, "utf-8");
			p3 = parseP3Header(content);
		} catch {
			// ignore unreadable files
		}

		// Find nearest module ancestor (longest matching modulePath)
		let bestModuleId = "<root>";
		let bestLen = -1;
		for (const m of moduleNodes.values()) {
			const mp = m.modulePath ?? "";
			if (mp === "" && bestLen < 0) bestModuleId = "<root>";
			if (mp && f.rel.startsWith(`${mp}/`) && mp.length > bestLen) {
				bestModuleId = m.id;
				bestLen = mp.length;
			}
		}

		const node: TerrainNode = {
			id: f.rel,
			kind: "file",
			label: f.rel,
			modulePath: moduleNodes.get(bestModuleId)?.modulePath,
			filePath: f.rel,
			p3Who: p3?.who,
			p3From: p3?.from,
			p3To: p3?.to,
			p3Here: p3?.here,
			hasP3: Boolean(p3),
			mtimeMs: f.mtimeMs,
		};
		fileNodes.push(node);
		nodes.push(node);
		moduleByFile[node.id] = bestModuleId;
		edges.push({ fromId: bestModuleId, toId: node.id, type: "contains" });
	}

	return {
		workspaceRoot,
		generatedAt: Date.now(),
		nodes,
		edges,
		moduleByFile,
	};
}

/**
 * Check DIP coverage for the requested module list.
 * Each module string is a posix-style path relative to workspace root, e.g. "core/runtime".
 * If modules is empty, all known modules are reported.
 */
export function checkDipCoverage(snapshot: TerrainSnapshot, modules: string[]): CoverageReport[] {
	const reports: CoverageReport[] = [];
	const requested = modules.length > 0 ? modules : null;
	const moduleIds = snapshot.nodes
		.filter((n) => n.kind === "module" || n.kind === "root")
		.map((n) => n.modulePath ?? "");
	const targets = requested ?? moduleIds;

	for (const mp of targets) {
		const moduleNode = snapshot.nodes.find(
			(n) => (n.kind === "module" || n.kind === "root") && (n.modulePath ?? "") === mp,
		);
		const filesInModule = snapshot.nodes.filter(
			(n) => n.kind === "file" && (n.modulePath ?? "") === mp,
		);
		const totalFiles = filesInModule.length;
		const filesWithP3 = filesInModule.filter((n) => n.hasP3).length;
		const missingFields = filesInModule.filter(
			(n) => n.hasP3 && (!n.p3Who || !n.p3From || !n.p3To || !n.p3Here),
		).length;
		reports.push({
			module: mp || "<root>",
			totalFiles,
			filesWithP3,
			coveragePct: totalFiles === 0 ? 0 : Math.round((filesWithP3 / totalFiles) * 1000) / 10,
			hasP2: Boolean(moduleNode),
			missingFields,
		});
	}

	return reports;
}

/**
 * Determine whether the snapshot is stale relative to current DIP files.
 * Returns true when any AGENT.md (or legacy CLAUDE.md) or source file mtime exceeds snapshot.generatedAt.
 */
export function isSnapshotStale(snapshot: TerrainSnapshot): boolean {
	const stack: string[] = [snapshot.workspaceRoot];
	while (stack.length > 0) {
		const current = stack.pop();
		if (!current) break;
		let entries: import("node:fs").Dirent[];
		try {
			entries = readdirSync(current, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (entry.isDirectory()) {
				if (IGNORED_DIRS.has(entry.name)) continue;
				if (entry.name.startsWith(".")) continue;
				stack.push(join(current, entry.name));
				continue;
			}
			if (!entry.isFile()) continue;
			const abs = join(current, entry.name);
			const isDipModuleMap = (DIP_MODULE_MAP_FILENAMES as readonly string[]).includes(entry.name);
			const dotIdx = entry.name.lastIndexOf(".");
			const ext = dotIdx >= 0 ? entry.name.slice(dotIdx) : "";
			if (!isDipModuleMap && !SOURCE_EXTS.has(ext)) continue;
			try {
				const st = statSync(abs);
				if (st.mtimeMs > snapshot.generatedAt) return true;
			} catch {
				// ignore
			}
		}
	}
	return false;
}

/**
 * Look up the module id that contains a given relative file path.
 * Used by action evidence accumulation to map touched files back to anchors.
 */
export function moduleIdForPath(snapshot: TerrainSnapshot, relPath: string): string | undefined {
	const posix = toPosix(relPath);
	if (snapshot.moduleByFile[posix]) return snapshot.moduleByFile[posix];
	// Best-effort longest module prefix match for paths not in the index yet.
	let best: string | undefined;
	let bestLen = -1;
	for (const node of snapshot.nodes) {
		if (node.kind !== "module") continue;
		const mp = node.modulePath ?? "";
		if (mp && posix.startsWith(`${mp}/`) && mp.length > bestLen) {
			best = node.id;
			bestLen = mp.length;
		}
	}
	return best;
}

export function toPosixPath(p: string): string {
	return toPosix(p);
}
