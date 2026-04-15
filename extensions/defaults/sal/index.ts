/**
 * [WHO]: SAL extension entry - enabled by default, registers --nosal flag, /sal:coverage command, lifecycle hooks
 * [FROM]: Depends on core/extensions/types.ts, extensions/defaults/sal/terrain.ts, anchors.ts, weights.ts, eval sink in this extension
 * [TO]: Loaded by builtin-extensions.ts as a default extension entry point
 * [HERE]: extensions/defaults/sal/index.ts - pluggable Structural Anchor Localization (SAL) extension
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import {
	createEvalEvent,
	createEvalSink,
	type EvalSink,
	type EvalVariant,
} from "./eval.js";
import type {
	AgentEndEvent,
	BeforeAgentStartEvent,
	BeforeAgentStartEventResult,
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
	ToolExecutionEndEvent,
	ToolExecutionStartEvent,
} from "../../../core/extensions/types.js";
import { locateAction, locateTask, type AnchorResolution } from "./anchors.js";

// Local type for bridge anchor (passed via globalThis for eval tracking)
interface SalBridgeAnchor {
	modulePath?: string;
	filePath?: string;
	candidatePaths: string[];
}

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

const EVAL_ENABLED_ENV = "NANOPENCIL_EVAL_ENABLED";
const EVAL_ENDPOINT_ENV = "NANOPENCIL_EVAL_ENDPOINT";
const EVAL_RUN_ID_ENV = "NANOPENCIL_EVAL_RUN_ID";
const EVAL_VARIANT_ENV = "NANOPENCIL_EVAL_VARIANT";
const EVAL_LEGACY_FILE_ENV = "NANOPENCIL_EVAL_LEGACY_FILE";
const EVAL_API_KEY_ENV = "NANOPENCIL_EVAL_API_KEY";
const EVAL_API_KEY_HEADER_ENV = "NANOPENCIL_EVAL_API_KEY_HEADER";
const EVAL_HEADERS_JSON_ENV = "NANOPENCIL_EVAL_HEADERS_JSON";
const EVAL_CREDENTIALS_FILE_ENV = "NANOPENCIL_EVAL_CREDENTIALS_FILE";

interface TurnState {
	turnId: number;
	startedAtMs: number;
	taskResolution?: AnchorResolution;
	touchedFiles: Set<string>;
	toolsCalled: Set<string>;
	prompt?: string;
}

interface SalRuntime {
	workspaceRoot: string;
	snapshot?: TerrainSnapshot;
	snapshotErrored?: boolean;
	weights: SalWeights;
	weightsSource: string;
	turn: TurnState;
	sidecarDir: string;
	evalSink: EvalSink;
	evalEnabled: boolean;
	evalRunId: string;
	evalVariantOverride?: EvalVariant;
	evalStartedAtMs: number;
	evalRunStarted: boolean;
	turnCounter: number;
	evalMetadata: {
		workspace_root: string;
		session_id: string;
		model?: string;
	};
}


interface EvalCredentials {
	insforge_url?: string;
	endpoint?: string;
	api_key?: string;
	api_key_header?: string;
	headers?: Record<string, string>;
	enabled?: boolean;
}
function isTruthy(value: string | undefined): boolean {
	if (!value) return false;
	return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function parseHeadersJson(raw: string | undefined): Record<string, string> {
	if (!raw) return {};
	try {
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object") return {};
		const out: Record<string, string> = {};
		for (const [key, value] of Object.entries(parsed)) {
			if (typeof value === "string") {
				out[key] = value;
			}
		}
		return out;
	} catch {
		console.error(`[sal][eval] invalid JSON in ${EVAL_HEADERS_JSON_ENV}, ignoring custom headers.`);
		return {};
	}
}


function resolveCredentialsFileCandidates(workspaceRoot: string): string[] {
	const envPath = process.env[EVAL_CREDENTIALS_FILE_ENV];
	const workspacePath = join(workspaceRoot, ".memory-experiments", "credentials.json");
	const userPath = join(homedir(), ".memory-experiments", "credentials.json");
	return [envPath, workspacePath, userPath].filter((path): path is string => Boolean(path));
}

function readCredentialsFromFile(path: string): EvalCredentials | undefined {
	try {
		if (!existsSync(path)) return undefined;
		const raw = readFileSync(path, "utf-8");
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object") return undefined;
		return parsed as EvalCredentials;
	} catch (err) {
		console.error(`[sal][eval] failed to read credentials file ${path}:`, (err as Error).message);
		return undefined;
	}
}

function resolveEvalCredentials(workspaceRoot: string): EvalCredentials | undefined {
	for (const candidate of resolveCredentialsFileCandidates(workspaceRoot)) {
		const creds = readCredentialsFromFile(candidate);
		if (creds) return creds;
	}
	return undefined;
}
function normalizeExperimentId(experimentId?: string): string | undefined {
	const raw = (experimentId ?? "").trim();
	if (!raw) return undefined;
	const normalized = raw
		.replace(/[^a-zA-Z0-9-_/.\s]/g, " ")
		.replace(/[\/\s]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.toLowerCase();
	return normalized || "run";
}

function resolveSalSidecarDir(workspaceRoot: string, experimentId?: string): string {
	const normalized = normalizeExperimentId(experimentId);
	if (!normalized) {
		return join(workspaceRoot, ".memory-experiments", "sal", "anchors");
	}
	return join(workspaceRoot, ".memory-experiments", "runs", normalized, "sal", "anchors");
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
				out.push(`${p.slice(0, charBudget)}...`);
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
	if (runtime.evalEnabled) return;
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
				`${r.hasP2 ? "P2:Y" : "P2:N"}  missingFields=${r.missingFields}`,
		);
	}
	lines.push("");
	lines.push("Gate: >=90% PASS, >=70% WARN, otherwise FAIL. Layer 1 experiments require PASS in target modules.");
	return lines.join("\n");
}

function resolveEvalVariant(runtime: SalRuntime, salEnabled: boolean): EvalVariant {
	if (runtime.evalVariantOverride) return runtime.evalVariantOverride;
	return salEnabled ? "sal" : "control";
}

async function emitEval(
	runtime: SalRuntime,
	eventType: Parameters<typeof createEvalEvent>[0],
	salEnabled: boolean,
	payload: Record<string, unknown>,
): Promise<void> {
	if (!runtime.evalEnabled) return;
	try {
		const event = createEvalEvent(
			eventType,
			runtime.evalRunId,
			resolveEvalVariant(runtime, salEnabled),
			payload,
			runtime.evalMetadata,
		);
		await runtime.evalSink.sendEvent(event);
	} catch (err) {
		console.error("[sal][eval] failed to emit event:", (err as Error).message);
	}
}

export default async function salExtension(api: ExtensionAPI) {
	api.registerFlag(NOSAL_FLAG, {
		type: "boolean",
		description: "Disable Structural Anchor Localization (SAL) - fall back to baseline memory mode",
		default: false,
	});
	api.registerFlag(SAL_REBUILD_FLAG, {
		type: "boolean",
		description: "Force SAL terrain index rebuild on next localization pass",
		default: false,
	});

	const workspaceRoot = api.cwd;
	const experimentId = process.env.NANOPENCIL_EXPERIMENT_ID;
	const sidecarDir = resolveSalSidecarDir(workspaceRoot, experimentId);
	const weightsDirCandidates = [workspaceRoot, join(workspaceRoot, ".memory-experiments", "sal")];
	const { weights, source: weightsSource } = loadSalWeights(weightsDirCandidates);

	const credentials = resolveEvalCredentials(workspaceRoot);
	const evalEnabledByEnv = process.env[EVAL_ENABLED_ENV];
	const evalEnabled = evalEnabledByEnv ? isTruthy(evalEnabledByEnv) : true;
	const evalEnabledByCreds = credentials?.enabled ?? true;
	const evalEndpoint = process.env[EVAL_ENDPOINT_ENV] ?? credentials?.insforge_url ?? credentials?.endpoint;
	const evalRunId =
		process.env[EVAL_RUN_ID_ENV] ??
		`np-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}-${Math.random().toString(36).slice(2, 8)}`;
	const evalVariantEnv = process.env[EVAL_VARIANT_ENV];
	const evalVariantOverride =
		evalVariantEnv === "control" || evalVariantEnv === "sal" || evalVariantEnv === "baseline"
			? (evalVariantEnv as EvalVariant)
			: undefined;
	const evalApiKey = process.env[EVAL_API_KEY_ENV] ?? credentials?.api_key;
	const evalApiKeyHeader = process.env[EVAL_API_KEY_HEADER_ENV] ?? credentials?.api_key_header;
	const evalHeaders = {
		...(credentials?.headers ?? {}),
		...parseHeadersJson(process.env[EVAL_HEADERS_JSON_ENV]),
	};
	const evalCollectionEnabled = evalEnabled && evalEnabledByCreds;

	if (evalCollectionEnabled && !evalEndpoint) {
		console.error(`[sal][eval] enabled but no endpoint found in env or credentials. Using noop sink.`);
	}

	const evalSink = createEvalSink({
		enabled: evalCollectionEnabled,
		endpoint: evalEndpoint,
		runId: evalRunId,
		headers: evalHeaders,
		apiKey: evalApiKey,
		apiKeyHeader: evalApiKeyHeader,
	});

	const runtime: SalRuntime = {
		workspaceRoot,
		weights,
		weightsSource,
		turn: { turnId: 0, startedAtMs: Date.now(), touchedFiles: new Set<string>(), toolsCalled: new Set<string>() },
		sidecarDir,
		evalSink,
		evalEnabled: evalSink.enabled,
		evalRunId,
		evalVariantOverride,
		evalStartedAtMs: Date.now(),
		evalRunStarted: false,
		turnCounter: 0,
		evalMetadata: {
			workspace_root: workspaceRoot,
			session_id: evalRunId,
		},
	};

	const isEnabled = (): boolean => !api.getFlag(NOSAL_FLAG);

	api.registerCommand("sal:coverage", {
		description: "Report DIP P3 coverage for SAL prerequisite gating. Usage: /sal:coverage [module1 module2 ...]",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const modules = (args ?? "")
				.trim()
				.split(/\s+/)
				.filter((s) => s.length > 0);
			const report = formatCoverageReport(runtime, modules);
			ctx.ui.notify(report, "info");
			api.sendMessage({
				customType: "sal_coverage_report",
				content: report,
				display: true,
				details: { modules, weightsSource: runtime.weightsSource },
			});
			await emitEval(runtime, "sal_coverage_check", isEnabled(), {
				modules_checked: modules,
				report,
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
				`  eval: ${runtime.evalEnabled ? "ON" : "OFF"}`,
				`  evalRunId: ${runtime.evalRunId}`,
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
		async (event: BeforeAgentStartEvent, ctx: ExtensionContext): Promise<BeforeAgentStartEventResult | undefined> => {
			(globalThis as any).__salAnchor = undefined;

			runtime.turnCounter += 1;
			runtime.turn = {
				turnId: runtime.turnCounter,
				startedAtMs: Date.now(),
				touchedFiles: new Set<string>(),
				toolsCalled: new Set<string>(),
				prompt: event.prompt,
			};

			if (!runtime.evalRunStarted && runtime.evalEnabled) {
				runtime.evalRunStarted = true;
				runtime.evalMetadata.model = runtime.evalMetadata.model ?? (ctx.model as any)?.id ?? (ctx.model as any)?.name;
				await emitEval(runtime, "run_start", isEnabled(), {
					task_description: (event.prompt ?? "").slice(0, 500),
					task_file: process.env.NANOPENCIL_EXPERIMENT_TASK_FILE,
					model: runtime.evalMetadata.model ?? "unknown",
					thinking: false,
					commit: process.env.NANOPENCIL_EVAL_COMMIT ?? "unknown",
					branch: process.env.NANOPENCIL_EVAL_BRANCH ?? "unknown",
					workspace_root: runtime.workspaceRoot,
				});
			}

			await emitEval(runtime, "turn_start", isEnabled(), {
				turn_id: runtime.turn.turnId,
				user_prompt: (event.prompt ?? "").slice(0, 2000),
				prompt_truncated: (event.prompt ?? "").length > 2000,
			});

			if (!isEnabled()) return undefined;

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

			await emitEval(runtime, "sal_anchor", true, {
				turn_id: runtime.turn.turnId,
				anchor_type: "task",
				anchor: resolution.selected,
				candidates: resolution.candidates.slice(0, 5),
				touched_files: Array.from(runtime.turn.touchedFiles),
				unresolved_signals: resolution.unresolvedSignals,
			});

			const injection = buildContextInjection(resolution, snapshot);
			if (!injection) return undefined;
			return { appendSystemPrompt: injection };
		},
	);

	api.on("tool_execution_start", async (event: ToolExecutionStartEvent, _ctx: ExtensionContext) => {
		if (!isEnabled() && !runtime.evalEnabled) return;

		const paths = extractToolFilePaths(event.toolName, event.args, runtime.workspaceRoot);
		for (const p of paths) runtime.turn.touchedFiles.add(p);
		runtime.turn.toolsCalled.add(event.toolName);

		await emitEval(runtime, "tool_call", isEnabled(), {
			turn_id: runtime.turn.turnId,
			tool_name: event.toolName,
			tool_args: event.args ?? {},
			call_id: event.toolCallId,
			touched_files: paths,
		});
	});

	api.on("tool_execution_end", async (event: ToolExecutionEndEvent, _ctx: ExtensionContext) => {
		const resultText =
			typeof event.result === "string" ? event.result : JSON.stringify(event.result ?? {}, null, 0);
		await emitEval(runtime, "tool_result", isEnabled(), {
			turn_id: runtime.turn.turnId,
			call_id: event.toolCallId,
			result_preview: resultText.slice(0, 500),
			result_length: resultText.length,
			success: !event.isError,
			error: event.isError ? resultText.slice(0, 500) : undefined,
		});
	});

	api.on("agent_end", async (_event: AgentEndEvent, _ctx: ExtensionContext) => {
		const turnDuration = Math.max(0, Date.now() - runtime.turn.startedAtMs);
		await emitEval(runtime, "turn_end", isEnabled(), {
			turn_id: runtime.turn.turnId,
			assistant_response_length: 0,
			duration_ms: turnDuration,
			tools_called: Array.from(runtime.turn.toolsCalled),
			touched_files: Array.from(runtime.turn.touchedFiles),
		});

		if (!isEnabled()) {
			runtime.turn = {
				turnId: runtime.turn.turnId,
				startedAtMs: Date.now(),
				touchedFiles: new Set<string>(),
				toolsCalled: new Set<string>(),
			};
			return;
		}

		const snapshot = runtime.snapshot;
		if (!snapshot) return;
		const actionRes = locateAction({
			touchedFiles: Array.from(runtime.turn.touchedFiles),
			snapshot,
		});

		await emitEval(runtime, "sal_anchor", true, {
			turn_id: runtime.turn.turnId,
			anchor_type: "action",
			anchor: actionRes.selected,
			candidates: actionRes.candidates.slice(0, 5),
			touched_files: Array.from(runtime.turn.touchedFiles),
			unresolved_signals: actionRes.unresolvedSignals,
		});

		persistTurnRecord(runtime, runtime.turn.taskResolution, actionRes);
		runtime.turn = {
			turnId: runtime.turn.turnId,
			startedAtMs: Date.now(),
			touchedFiles: new Set<string>(),
			toolsCalled: new Set<string>(),
		};
	});

	api.on("session_shutdown", async () => {
		if (!runtime.evalEnabled) return;
		await emitEval(runtime, "run_end", isEnabled(), {
			status: "success",
			turn_count: runtime.turnCounter,
			total_duration_ms: Math.max(0, Date.now() - runtime.evalStartedAtMs),
		});
		await runtime.evalSink.flush();
		await runtime.evalSink.close();
	});
}

export { SAL_DEFAULT_WEIGHTS, normalizeExperimentId, resolveSalSidecarDir };









