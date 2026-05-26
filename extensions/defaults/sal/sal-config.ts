/**
 * [WHO]: Provides SAL build metadata, eval env constants, credential loading, and sidecar path resolution
 * [FROM]: Depends on node fs/os/path/url and eval adapter type for local credential normalization
 * [TO]: Consumed by extensions/defaults/sal/index.ts and tests that validate SAL experiment/config behavior
 * [HERE]: extensions/defaults/sal/sal-config.ts - configuration and path boundary for Structural Anchor Localization
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { EvalAdapterId } from "./eval/index.js";
import type { BuildMeta, SalDiagnosticReporter } from "./sal-runtime.js";

export const SAL_AB_ENV = "NANOPENCIL_SAL_AB";
export const EVAL_ENABLED_ENV = "NANOPENCIL_EVAL_ENABLED";
export const EVAL_ENDPOINT_ENV = "NANOPENCIL_EVAL_ENDPOINT";
export const EVAL_RUN_ID_ENV = "NANOPENCIL_EVAL_RUN_ID";
export const EVAL_VARIANT_ENV = "NANOPENCIL_EVAL_VARIANT";
export const EVAL_LEGACY_FILE_ENV = "NANOPENCIL_EVAL_LEGACY_FILE";
export const EVAL_API_KEY_ENV = "NANOPENCIL_EVAL_API_KEY";
export const EVAL_API_KEY_HEADER_ENV = "NANOPENCIL_EVAL_API_KEY_HEADER";
export const EVAL_HEADERS_JSON_ENV = "NANOPENCIL_EVAL_HEADERS_JSON";
export const EVAL_CREDENTIALS_FILE_ENV = "NANOPENCIL_EVAL_CREDENTIALS_FILE";
export const EVAL_STALE_CLEANUP_ENV = "NANOPENCIL_EVAL_CLEANUP_STALE_RUNS";

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

export interface EvalCredentials {
	insforge_url?: string;
	endpoint?: string;
	api_key?: string;
	anon_key?: string;
	api_key_header?: string;
	headers?: Record<string, string>;
	enabled?: boolean;
	allow_self_signed?: boolean;
	cleanup_stale_runs?: boolean;
	/** Adapter selector. When omitted, inferred from endpoint scheme (http -> insforge, file/path -> jsonl). */
	adapter?: EvalAdapterId;
}

export function loadBuildMeta(): BuildMeta {
	const fallback: BuildMeta = { version: "dev" };
	try {
		const thisFile = fileURLToPath(import.meta.url);
		const thisDir = dirname(thisFile);
		const distMeta = join(thisDir, "..", "..", "..", "build-meta.json");
		if (existsSync(distMeta)) {
			const parsed = JSON.parse(readFileSync(distMeta, "utf-8"));
			return {
				version: parsed.version ?? fallback.version,
				commitHash: parsed.commitHash,
				branch: parsed.branch,
			};
		}

		const pkgCandidates = [
			join(thisDir, "..", "..", "..", "package.json"),
			join(thisDir, "..", "..", "..", "..", "package.json"),
		];
		for (const p of pkgCandidates) {
			if (existsSync(p)) {
				const pkg = JSON.parse(readFileSync(p, "utf-8"));
				if (pkg.name === "@pencil-agent/nano-pencil") {
					return { version: pkg.version ?? fallback.version };
				}
			}
		}
	} catch {
		// Non-fatal: dev and tests can run without build metadata.
	}
	return fallback;
}

export const BUILD_META = loadBuildMeta();

export function resolveStaleCleanupEnabled(
	envValue: string | undefined,
	credentials: EvalCredentials | undefined,
): boolean {
	if (envValue !== undefined) return isTruthy(envValue);
	return credentials?.cleanup_stale_runs === true;
}

export function isTruthy(value: unknown): boolean {
	if (value === true) return true;
	if (typeof value !== "string") return false;
	if (!value) return false;
	return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function parseHeadersJson(
	raw: string | undefined,
	reportDiagnostic?: SalDiagnosticReporter,
): Record<string, string> {
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
		reportDiagnostic?.({
			source: "sal.eval",
			severity: "warning",
			category: "config",
			message: `SAL eval ignored invalid JSON in ${EVAL_HEADERS_JSON_ENV}.`,
			fingerprint: "sal.eval:config:invalid-headers-json",
		});
		return {};
	}
}

function resolveCredentialsFileCandidates(workspaceRoot: string): string[] {
	const envPath = process.env[EVAL_CREDENTIALS_FILE_ENV];
	const workspacePath = join(workspaceRoot, ".memory-experiments", "credentials.json");
	const userPath = join(homedir(), ".memory-experiments", "credentials.json");
	return [envPath, workspacePath, userPath].filter((path): path is string => Boolean(path));
}

function readCredentialsFromFile(
	filePath: string,
	reportDiagnostic?: SalDiagnosticReporter,
): EvalCredentials | undefined {
	try {
		if (!existsSync(filePath)) return undefined;
		const raw = readFileSync(filePath, "utf-8");
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object") return undefined;

		if (Array.isArray(parsed.credentials)) {
			const entry = parsed.credentials.find(
				(e: EvalCredentialEntry) => e.id === "insforge" && e.enabled !== false,
			) as EvalCredentialEntry | undefined;
			if (!entry) return undefined;
			return {
				endpoint: entry.endpoint ?? entry.insforge_url,
				insforge_url: entry.insforge_url ?? entry.endpoint,
				api_key: entry.api_key ?? entry.apiKey,
				anon_key: (entry as EvalCredentials).anon_key,
				api_key_header: entry.api_key_header,
				headers: entry.headers,
				enabled: entry.enabled,
			};
		}

		return parsed as EvalCredentials;
	} catch (err) {
		reportDiagnostic?.({
			source: "sal.eval",
			severity: "warning",
			category: "config",
			message: "SAL eval credentials file could not be read.",
			detail: { filePath, error: (err as Error).message },
			fingerprint: "sal.eval:config:credentials-read-failed",
		});
		return undefined;
	}
}

export function resolveEvalCredentials(
	workspaceRoot: string,
	reportDiagnostic?: SalDiagnosticReporter,
): EvalCredentials | undefined {
	for (const candidate of resolveCredentialsFileCandidates(workspaceRoot)) {
		const creds = readCredentialsFromFile(candidate, reportDiagnostic);
		if (creds) return creds;
	}
	return undefined;
}

export function normalizeExperimentId(experimentId?: string): string | undefined {
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

export function resolveSalSidecarDir(workspaceRoot: string, experimentId?: string): string {
	const normalized = normalizeExperimentId(experimentId);
	if (!normalized) {
		return join(workspaceRoot, ".memory-experiments", "sal", "anchors");
	}
	return join(workspaceRoot, ".memory-experiments", "runs", normalized, "sal", "anchors");
}

export function resolveSalAbEnabled(flagValue: unknown): boolean {
	return isTruthy(flagValue) || isTruthy(process.env[SAL_AB_ENV]);
}
