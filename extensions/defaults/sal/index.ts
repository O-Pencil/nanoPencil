/**
 * [WHO]: SAL extension entry — enabled by default, registers --nosal flag, /sal:coverage command, before_agent_start/tool_execution_start/agent_end hooks
 * [FROM]: Depends on core/extensions/types.ts, extensions/defaults/sal/terrain.ts, anchors.ts, weights.ts
 * [TO]: Loaded by builtin-extensions.ts as a default extension entry point
 * [HERE]: extensions/defaults/sal/index.ts - pluggable Structural Anchor Localization (SAL) extension
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import type {
	AgentEndEvent,
	BeforeAgentStartEvent,
	BeforeAgentStartEventResult,
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
	ToolExecutionStartEvent,
} from "../../../core/extensions/types.js";
import { locateAction, locateTask, type AnchorResolution } from "./anchors.js";
import {
	buildTerrainIndex,
	checkDipCoverage,
	isSnapshotStale,
	type TerrainSnapshot,
	toPosixPath,
} from "./terrain.js";
import { loadSalWeights, SAL_DEFAULT_WEIGHTS, type SalWeights } from "./weights.js";

const NOSAL_FLAG = "nosal";
const SAL_REBUILD_FLAG = "sal-rebuild-terrain";
const SAL_CONTEXT_BUDGET_TOKENS = 800;
const APPROX_TOKENS_PER_CHAR = 0.25;

interface TurnState {
	taskResolution?: AnchorResolution;
	touchedFiles: Set<string>;
	prompt?: string;
}

interface SalRuntime {
	enabled: boolean;
	workspaceRoot: string;
	snapshot?: TerrainSnapshot;
	snapshotErrored?: boolean;
	weights: SalWeights;
	weightsSource: string;
	turn: TurnState;
	sidecarDir: string;
}

interface SalBridgeAnchor {
	modulePath?: string;
	filePath?: string;
	candidatePaths: string[];
}

function approxTokens(text: string): number {
	return Math.ceil(text.length * APPROX_TOKENS_PER_CHAR);
}

function truncateForBudget(parts: string[], budgetTokens: number): string {
	const out: string[] = [];
	let used = 0;
	for (const p of parts) {
		const t = approxTokens(p);
		if (used + t > budgetTokens) {
			const remaining = Math.max(0, budgetTokens - used);
			if (remaining > 20) {
				const charBudget = Math.floor(remaining / APPROX_TOKENS_PER_CHAR);
				out.push(`${p.slice(0, charBudget)}…`);
			}
			break;
		}
		out.push(p);
		used += t;
	}
	return out.join("\n");
}

function ensureSnapshot(runtime: SalRuntime, forceRebuild: boolean): TerrainSnapshot | undefined {
	if (runtime.snapshotErrored) return runtime.snapshot;
	if (runtime.snapshot && !forceRebuild && !isSnapshotStale(runtime.snapshot)) {
		return runtime.snapshot;
	}
	try {
		runtime.snapshot = buildTerrainIndex(runtime.workspaceRoot);
		return runtime.snapshot;
	} catch (err) {
		runtime.snapshotErrored = true;
		// Surface but never block the agent.
		// eslint-disable-next-line no-console
		console.error("[sal] terrain index build failed:", (err as Error).message);
		return undefined;
	}
}

function workspaceRelativePath(workspaceRoot: string, candidate: string): string | undefined {
	if (!candidate) return undefined;
	const abs = isAbsolute(candidate) ? candidate : join(workspaceRoot, candidate);
	const rel = relative(workspaceRoot, abs);
	if (rel.startsWith("..") || rel === "") return undefined;
	return toPosixPath(rel);
}

function extractToolFilePaths(toolName: string, args: unknown, workspaceRoot: string): string[] {
	if (!args || typeof args !== "object") return [];
	const a = args as Record<string, unknown>;
	const out: string[] = [];
	const candidates: string[] = [];
	if (typeof a.file_path === "string") candidates.push(a.file_path);
	if (typeof a.path === "string") candidates.push(a.path);
	if (Array.isArray(a.paths)) {
		for (const p of a.paths) if (typeof p === "string") candidates.push(p);
	}
	for (const c of candidates) {
		const rel = workspaceRelativePath(workspaceRoot, c);
		if (rel) out.push(rel);
	}
	// bash: best-effort path extraction from command
	if (toolName === "bash" && typeof a.command === "string") {
		const found = a.command.match(/[\w./-]+\.(?:ts|tsx|js|jsx|md|json)/g) ?? [];
		for (const f of found) {
			const rel = workspaceRelativePath(workspaceRoot, f);
			if (rel) out.push(rel);
		}
	}
	return out;
}

function buildContextInjection(resolution: AnchorResolution, snapshot: TerrainSnapshot): string | undefined {
	if (!resolution.selected || resolution.candidates.length === 0) return undefined;
	const top = resolution.candidates[0];
	const anchor = top.anchor;

	const region = anchor.modulePath || anchor.filePath || "<root>";
	const regionSummary = `Likely task region: ${region} (confidence ${anchor.confidence.toFixed(2)})`;

	const reasonLines = top.reasons.slice(0, 3).map((r) => `  - ${r}`);
	const altLines = resolution.candidates
		.slice(1, 4)
		.map((c) => {
			const target = c.anchor.modulePath || c.anchor.filePath || "<root>";
			return `  - ${target} (${c.score.toFixed(2)})`;
		});

	const moduleNode = snapshot.nodes.find(
		(n) => (n.kind === "module" || n.kind === "root") && (n.modulePath ?? "") === (anchor.modulePath ?? ""),
	);
	const summaryLine = moduleNode?.p2Summary ? `Module brief: ${moduleNode.p2Summary}` : undefined;

	const parts: string[] = ["[SAL Anchor]", regionSummary];
	if (summaryLine) parts.push(summaryLine);
	if (reasonLines.length > 0) {
		parts.push("Evidence:");
		parts.push(...reasonLines);
	}
	if (altLines.length > 0) {
		parts.push("Alternative anchors:");
		parts.push(...altLines);
	}
	parts.push(
		"Use this anchor as a structural prior. If the prompt actually targets a different region, override it from tool evidence.",
	);

	return truncateForBudget(parts, SAL_CONTEXT_BUDGET_TOKENS);
}

function ensureSidecarDir(runtime: SalRuntime): void {
	if (!existsSync(runtime.sidecarDir)) {
		try {
			mkdirSync(runtime.sidecarDir, { recursive: true });
		} catch {
			// non-fatal
		}
	}
}

function persistTurnRecord(runtime: SalRuntime, taskRes: AnchorResolution | undefined, actionRes: AnchorResolution): void {
	ensureSidecarDir(runtime);
	const ts = new Date().toISOString().replace(/[:.]/g, "-");
	const filePath = join(runtime.sidecarDir, `turn-${ts}.json`);
	const record = {
		generatedAt: new Date().toISOString(),
		workspaceRoot: runtime.workspaceRoot,
		weightsSource: runtime.weightsSource,
		prompt: runtime.turn.prompt?.slice(0, 500),
		taskAnchor: taskRes?.selected,
		taskCandidates: taskRes?.candidates.slice(0, 3),
		taskUnresolved: taskRes?.unresolvedSignals,
		actionAnchor: actionRes.selected,
		actionCandidates: actionRes.candidates.slice(0, 3),
		touchedFiles: Array.from(runtime.turn.touchedFiles),
	};
	try {
		writeFileSync(filePath, JSON.stringify(record, null, 2), "utf-8");
	} catch {
		// non-fatal
	}
}

function formatCoverageReport(runtime: SalRuntime, modules: string[]): string {
	const snapshot = ensureSnapshot(runtime, false);
	if (!snapshot) return "[sal] terrain snapshot unavailable";
	const reports = checkDipCoverage(snapshot, modules);
	if (reports.length === 0) return "[sal] no modules matched the requested filter";
	const lines: string[] = ["[SAL DIP Coverage]"];
	for (const r of reports) {
		const gate = r.coveragePct >= 90 ? "PASS" : r.coveragePct >= 70 ? "WARN" : "FAIL";
		lines.push(
			`  ${gate}  ${r.module.padEnd(40)}  P3 ${r.filesWithP3}/${r.totalFiles}  (${r.coveragePct}%)  ` +
				`${r.hasP2 ? "P2✓" : "P2✗"}  missingFields=${r.missingFields}`,
		);
	}
	lines.push("");
	lines.push("Gate: ≥90% PASS, ≥70% WARN, otherwise FAIL. Layer 1 experiments require PASS in target modules.");
	return lines.join("\n");
}

export default async function salExtension(api: ExtensionAPI) {
	api.registerFlag(NOSAL_FLAG, {
		type: "boolean",
		description: "Disable Structural Anchor Localization (SAL) — fall back to baseline memory mode",
		default: false,
	});
	api.registerFlag(SAL_REBUILD_FLAG, {
		type: "boolean",
		description: "Force SAL terrain index rebuild on next localization pass",
		default: false,
	});

	const workspaceRoot = api.cwd;
	const sidecarDir = join(workspaceRoot, ".memory-experiments", "sal", "anchors");
	const weightsDirCandidates = [workspaceRoot, join(workspaceRoot, ".memory-experiments", "sal")];
	const { weights, source: weightsSource } = loadSalWeights(weightsDirCandidates);

	const runtime: SalRuntime = {
		enabled: false,
		workspaceRoot,
		weights,
		weightsSource,
		turn: { touchedFiles: new Set<string>() },
		sidecarDir,
	};

	const isEnabled = (): boolean => !api.getFlag(NOSAL_FLAG);

	api.registerCommand("sal:coverage", {
		description: "Report DIP P3 coverage for SAL prerequisite gating. Usage: /sal:coverage [module1 module2 ...]",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const modules = (args ?? "")
				.trim()
				.split(/\s+/)
				.filter((s) => s.length > 0);
			runtime.enabled = true; // coverage check is read-only and always allowed via slash command
			const report = formatCoverageReport(runtime, modules);
			ctx.ui.notify(report, "info");
			api.sendMessage({
				customType: "sal_coverage_report",
				content: report,
				display: true,
				details: { modules, weightsSource: runtime.weightsSource },
			});
		},
	});

	api.registerCommand("sal:status", {
		description: "Show current SAL configuration and snapshot status",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			const flagOn = isEnabled();
			const snapshot = runtime.snapshot;
			const lines = [
				"[SAL Status]",
				`  SAL: ${flagOn ? "ON (default)" : "OFF (--nosal)"}`,
				`  workspaceRoot: ${runtime.workspaceRoot}`,
				`  weightsSource: ${runtime.weightsSource}`,
				`  snapshotGeneratedAt: ${snapshot ? new Date(snapshot.generatedAt).toISOString() : "(not built)"}`,
				`  nodes: ${snapshot?.nodes.length ?? 0}`,
				`  sidecarDir: ${runtime.sidecarDir}`,
			];
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	api.on(
		"before_agent_start",
		async (
			event: BeforeAgentStartEvent,
			_ctx: ExtensionContext,
		): Promise<BeforeAgentStartEventResult | undefined> => {
			// Clear global bridge — always, even when disabled, to prevent stale data.
			(globalThis as any).__salAnchor = undefined;

			if (!isEnabled()) return undefined;
			runtime.turn = { touchedFiles: new Set<string>(), prompt: event.prompt };
			const forceRebuild = Boolean(api.getFlag(SAL_REBUILD_FLAG));
			const snapshot = ensureSnapshot(runtime, forceRebuild);
			if (!snapshot) return undefined;

			const resolution = locateTask({
				prompt: event.prompt ?? "",
				cwd: runtime.workspaceRoot,
				snapshot,
				weights: runtime.weights,
			});
			runtime.turn.taskResolution = resolution;

			// Write anchor paths to process-global for mem-core structural boost.
			// mem-core reads this during scoring; if SAL is absent the global is undefined → boost = 0.
			const selectedAnchor = resolution.selected;
			const candidatePaths = resolution.candidates
				.slice(0, 4)
				.flatMap((c) => [c.anchor.modulePath, c.anchor.filePath].filter(Boolean) as string[]);
			if (selectedAnchor || candidatePaths.length > 0) {
				const bridgeAnchor: SalBridgeAnchor = {
					modulePath: selectedAnchor?.modulePath,
					filePath: selectedAnchor?.filePath,
					candidatePaths,
				};
				(globalThis as any).__salAnchor = bridgeAnchor;
			}

			const injection = buildContextInjection(resolution, snapshot);
			if (!injection) return undefined;
			return { appendSystemPrompt: injection };
		},
	);

	api.on("tool_execution_start", async (event: ToolExecutionStartEvent, _ctx: ExtensionContext) => {
		if (!isEnabled()) return;
		const paths = extractToolFilePaths(event.toolName, event.args, runtime.workspaceRoot);
		for (const p of paths) runtime.turn.touchedFiles.add(p);
	});

	api.on("agent_end", async (_event: AgentEndEvent, _ctx: ExtensionContext) => {
		if (!isEnabled()) return;
		const snapshot = runtime.snapshot;
		if (!snapshot) return;
		const actionRes = locateAction({
			touchedFiles: Array.from(runtime.turn.touchedFiles),
			snapshot,
		});
		persistTurnRecord(runtime, runtime.turn.taskResolution, actionRes);
		runtime.turn = { touchedFiles: new Set<string>() };
	});
}

export { SAL_DEFAULT_WEIGHTS };
