/**
 * [WHO]: SAL extension entry - enabled by default, registers --nosal/--sal-rebuild-terrain flags, /sal:coverage /sal:status /sal:setup commands, before_agent_start/tool_execution_start/agent_end hooks; runtime no-op when --nosal is set
 * [FROM]: Depends on core/extensions/types.ts, core/runtime/turn-context.ts (publishes structuralAnchor), extensions/defaults/sal/terrain.ts, anchors.ts, weights.ts, eval/index.ts (pluggable adapters)
 * [TO]: Loaded by builtin-extensions.ts as a default extension entry point
 * [HERE]: extensions/defaults/sal/index.ts - pluggable Structural Anchor Localization (SAL) extension; emits run_start/turn_anchor/run_end eval events; /sal:setup writes ~/.memory-experiments/credentials.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import {
	createEvalEvent,
	createEvalSink,
	type EvalAdapterId,
	type EvalSink,
	type EvalVariant,
} from "./eval/index.js";
import type {
	AgentEndEvent,
	BeforeAgentStartEvent,
	BeforeAgentStartEventResult,
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
	ToolExecutionStartEvent,
} from "../../../core/extensions/types.js";
import { getTurnContext, resetTurnContext, setTurnContext } from "../../../core/runtime/turn-context.js";
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
	evalAdapter?: EvalAdapterId;
	evalEndpoint?: string;
	evalApiKey?: string;
	evalAnonKey?: string;
	evalApiKeyHeader?: string;
	evalHeaders: Record<string, string>;
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


interface EvalCredentialEntry {
	id: string;
	name?: string;
	enabled?: boolean;
	apiKey?: string;
	api_key?: string;
	endpoint?: string;
	insforge_url?: string;
	api_key_header?: string;
	headers?: Record<string, string>;
}

interface EvalCredentials {
	insforge_url?: string;
	endpoint?: string;
	api_key?: string;
	anon_key?: string;
	api_key_header?: string;
	headers?: Record<string, string>;
	enabled?: boolean;
	allow_self_signed?: boolean;
	/** Adapter selector. When omitted, inferred from endpoint scheme (http→insforge, file/path→jsonl). */
	adapter?: EvalAdapterId;
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

function readCredentialsFromFile(filePath: string): EvalCredentials | undefined {
	try {
		if (!existsSync(filePath)) return undefined;
		const raw = readFileSync(filePath, "utf-8");
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object") return undefined;

		// Format 1: { credentials: [{ id, apiKey, endpoint, ... }] }
		if (Array.isArray(parsed.credentials)) {
			const entry = parsed.credentials.find(
				(e: EvalCredentialEntry) => e.id === "insforge" && e.enabled !== false,
			) as EvalCredentialEntry | undefined;
			if (!entry) return undefined;
			return {
				endpoint: entry.endpoint ?? entry.insforge_url,
				insforge_url: entry.insforge_url ?? entry.endpoint,
				api_key: entry.api_key ?? entry.apiKey,
				anon_key: (entry as any).anon_key,
				api_key_header: entry.api_key_header,
				headers: entry.headers,
				enabled: entry.enabled,
			};
		}

		// Format 2: flat EvalCredentials at top level
		return parsed as EvalCredentials;
	} catch (err) {
		console.error(`[sal][eval] failed to read credentials file ${filePath}:`, (err as Error).message);
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
	const evalEnabledByEnvRaw = process.env[EVAL_ENABLED_ENV];
	const evalEnabledByEnv = evalEnabledByEnvRaw !== undefined ? isTruthy(evalEnabledByEnvRaw) : undefined;
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
	const evalAnonKey = process.env["NANOPENCIL_EVAL_ANON_KEY"] ?? credentials?.anon_key;
	const evalApiKeyHeader = process.env[EVAL_API_KEY_HEADER_ENV] ?? credentials?.api_key_header;
	const evalAdapterEnv = process.env["NANOPENCIL_EVAL_ADAPTER"];
	const evalAdapter: EvalAdapterId | undefined =
		(evalAdapterEnv === "insforge" || evalAdapterEnv === "jsonl" || evalAdapterEnv === "noop")
			? evalAdapterEnv
			: credentials?.adapter;
	const evalHeaders = {
		...(credentials?.headers ?? {}),
		...parseHeadersJson(process.env[EVAL_HEADERS_JSON_ENV]),
	};

	// Activation: credentials with endpoint+api_key auto-enable (unless explicitly disabled).
	// Env var NANOPENCIL_EVAL_ENABLED can override either direction.
	const credHasConfig = !!(credentials?.endpoint ?? credentials?.insforge_url) && !!credentials?.api_key;
	const evalEnabledByCreds = credHasConfig && credentials?.enabled !== false;
	const evalCollectionEnabled =
		evalEnabledByEnv === false ? false : evalEnabledByCreds || evalEnabledByEnv === true;

	if (evalCollectionEnabled && !evalEndpoint) {
		console.error("[sal][eval] enabled but no endpoint found in env or credentials. Using noop sink.");
	}

	const evalAllowSelfSigned =
		isTruthy(process.env["NANOPENCIL_EVAL_ALLOW_SELF_SIGNED"]) ||
		(credentials?.allow_self_signed ?? false);

	const evalSink = createEvalSink({
		enabled: evalCollectionEnabled && !!evalEndpoint,
		adapter: evalAdapter,
		endpoint: evalEndpoint,
		runId: evalRunId,
		headers: evalHeaders,
		apiKey: evalApiKey,
		anonKey: evalAnonKey,
		apiKeyHeader: evalApiKeyHeader,
		allowSelfSigned: evalAllowSelfSigned,
	});

	const runtime: SalRuntime = {
		workspaceRoot,
		weights,
		weightsSource,
		turn: { turnId: 0, startedAtMs: Date.now(), touchedFiles: new Set<string>() },
		sidecarDir,
		evalSink,
		evalAdapter,
		evalEndpoint,
		evalApiKey,
		evalAnonKey,
		evalApiKeyHeader,
		evalHeaders,
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
		},
	});

	api.registerCommand("sal:setup", {
		description:
			"Configure SAL eval credentials. " +
			"Usage: /sal:setup <endpoint> [api_key] [anon_key]  — adapter inferred from endpoint scheme " +
			"(http/https → InsForge backend; file path or file:// → local JSONL log).",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const tokens = (args ?? "").trim().split(/\s+/).filter((t) => t.length > 0);
			const endpoint = tokens[0];
			const apiKey = tokens[1];
			const anonKey = tokens[2];

			if (!endpoint) {
				ctx.ui.notify(
					"[SAL Setup] Usage: /sal:setup <endpoint> [api_key] [anon_key]\n" +
					"  - InsForge: /sal:setup https://app.region.insforge.app ik_xxx [anon_jwt]\n" +
					"  - Local JSONL: /sal:setup /path/to/eval-events.jsonl",
					"error",
				);
				return;
			}

			// Infer adapter from endpoint scheme; jsonl needs no api_key
			const inferredAdapter: EvalAdapterId =
				/^https?:\/\//i.test(endpoint) ? "insforge"
				: (endpoint.startsWith("file://") || endpoint.startsWith("/") || endpoint.startsWith("./") || endpoint.startsWith("../")) ? "jsonl"
				: "insforge";

			if (inferredAdapter === "insforge" && !apiKey) {
				ctx.ui.notify("[SAL Setup] InsForge adapter requires <api_key>", "error");
				return;
			}

			const credDir = join(homedir(), ".memory-experiments");
			const credPath = join(credDir, "credentials.json");
			try {
				if (!existsSync(credDir)) mkdirSync(credDir, { recursive: true });
				const creds: Record<string, unknown> = {
					adapter: inferredAdapter,
					endpoint,
					enabled: true,
				};
				if (apiKey) creds.api_key = apiKey;
				if (anonKey) creds.anon_key = anonKey;
				if (inferredAdapter === "insforge") creds.allow_self_signed = true;
				writeFileSync(credPath, JSON.stringify(creds, null, 2), "utf-8");
			} catch (err) {
				ctx.ui.notify(`[SAL Setup] Failed to write credentials: ${(err as Error).message}`, "error");
				return;
			}
			// Activate sink immediately without restart
			runtime.evalAdapter = inferredAdapter;
			runtime.evalEndpoint = endpoint;
			runtime.evalApiKey = apiKey;
			runtime.evalAnonKey = anonKey;
			const newSink = createEvalSink({
				enabled: true,
				adapter: inferredAdapter,
				endpoint,
				runId: runtime.evalRunId,
				headers: runtime.evalHeaders,
				apiKey,
				anonKey,
				apiKeyHeader: runtime.evalApiKeyHeader,
				allowSelfSigned: inferredAdapter === "insforge",
			});
			runtime.evalSink = newSink;
			runtime.evalEnabled = true;

			// Connectivity check: send a probe event and flush immediately
			ctx.ui.notify(`[SAL Setup] Testing ${inferredAdapter} sink…`, "info");
			const probeEvent = createEvalEvent("run_start", runtime.evalRunId, "sal", {
				_probe: true,
				workspace_root: runtime.workspaceRoot,
				model: "unknown",
				thinking: false,
				commit: "unknown",
				branch: "unknown",
			}, runtime.evalMetadata);
			await newSink.sendEvent(probeEvent);
			await newSink.flush();
			// Do NOT set evalRunStarted=true here — let before_agent_start emit the real
			// run_start with the actual model name, which will upsert (merge-duplicates)
			// and overwrite the probe's model=unknown placeholder.

			ctx.ui.notify(
				`[SAL Setup] Credentials saved to ${credPath}\n` +
				`Eval collection active. run_id: ${runtime.evalRunId}\n` +
				`Check terminal output for any HTTP errors from the probe request.`,
				"info",
			);
		},
	});

	api.registerCommand("sal:status", {
		description: "Show current SAL configuration and snapshot status",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			const flagOn = isEnabled();
			const snapshot = runtime.snapshot;
			const endpointDisplay = runtime.evalEndpoint
				? runtime.evalEndpoint.replace(/^(https?:\/\/[^/]{0,20}).*/, "$1…")
				: "(not configured — use /sal:setup <endpoint> <api_key>)";
			const lines = [
				"[SAL Status]",
				`  SAL: ${flagOn ? "ON (default)" : "OFF (--nosal)"}`,
				`  eval: ${runtime.evalEnabled ? "ON" : "OFF"}`,
				`  adapter: ${runtime.evalAdapter ?? "(inferred at sink creation)"}`,
				`  endpoint: ${endpointDisplay}`,
				`  run_id: ${runtime.evalRunId}`,
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
				resetTurnContext();

				runtime.turnCounter += 1;
				runtime.turn = {
					turnId: runtime.turnCounter,
					startedAtMs: Date.now(),
					touchedFiles: new Set<string>(),
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
					setTurnContext("structuralAnchor", {
						modulePath: selectedAnchor?.modulePath,
						filePath: selectedAnchor?.filePath,
						candidatePaths,
					});
				}

				const injection = buildContextInjection(resolution, snapshot);
				if (!injection) return undefined;
				return { appendSystemPrompt: injection };
			},
		);

	api.on("tool_execution_start", async (event: ToolExecutionStartEvent, _ctx: ExtensionContext) => {
		const paths = extractToolFilePaths(event.toolName, event.args, runtime.workspaceRoot);
		for (const p of paths) runtime.turn.touchedFiles.add(p);
	});

	api.on("agent_end", async (_event: AgentEndEvent, _ctx: ExtensionContext) => {
		const turnDuration = Math.max(0, Date.now() - runtime.turn.startedAtMs);
		const taskRes = runtime.turn.taskResolution;

		const snapshot = runtime.snapshot;
		let actionRes: AnchorResolution | undefined;
		if (isEnabled() && snapshot) {
			actionRes = locateAction({
				touchedFiles: Array.from(runtime.turn.touchedFiles),
				snapshot,
			});
		}

		// hit = SAL predicted the right module where the agent actually worked
		const taskModule = taskRes?.selected?.modulePath ?? taskRes?.selected?.filePath ?? null;
		const actionModule = actionRes?.selected?.modulePath ?? actionRes?.selected?.filePath ?? null;
		const hit = !!(taskModule && actionModule && taskModule === actionModule);

		await emitEval(runtime, "turn_anchor", isEnabled(), {
			turn_id: runtime.turn.turnId,
			prompt_summary: (runtime.turn.prompt ?? "").slice(0, 200),
			task_anchor: taskRes?.selected ?? null,
			task_candidates: (taskRes?.candidates ?? []).slice(0, 3).map(
				(c) => c.anchor.modulePath ?? c.anchor.filePath ?? null,
			),
			action_files: Array.from(runtime.turn.touchedFiles).slice(0, 10),
			action_anchor: actionRes?.selected ?? null,
			hit,
			sal_enabled: isEnabled(),
			duration_ms: turnDuration,
		});

		// Emit memory recall snapshot (written by mem-core during before_agent_start)
		const recallSnapshot = getTurnContext("memoryRecallSnapshot");
		if (recallSnapshot && recallSnapshot.length > 0) {
			await emitEval(runtime, "memory_recalls", isEnabled(), {
				turn_id: runtime.turn.turnId,
				recalls: recallSnapshot,
			});
		}

		if (actionRes) {
			persistTurnRecord(runtime, taskRes, actionRes);
		}

		runtime.turn = {
			turnId: runtime.turn.turnId,
			startedAtMs: Date.now(),
			touchedFiles: new Set<string>(),
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



