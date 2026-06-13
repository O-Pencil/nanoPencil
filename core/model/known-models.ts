/**
 * [WHO]: KNOWN_MODEL_METADATA, lookupKnownModel(), UNKNOWN_MODEL_DEFAULTS, KnownModelMetadata
 * [FROM]: Depends on @catui/ai/types for Api type; data from known-models.generated.ts
 * [TO]: Consumed by core/model-registry.ts for discovered model defaults
 * [HERE]: core/model/known-models.ts - known model metadata for discovery fallback
 *
 * Provides a lookup table of model metadata extracted from models.generated.ts at build time.
 * When discovery finds a model ID from a remote /models endpoint, this table supplies
 * contextWindow, maxTokens, cost, etc. that the endpoint doesn't provide.
 */

import type { Api } from "@catui/ai/types";
import { GENERATED_KNOWN_MODELS } from "./known-models.generated.js";

/**
 * Lightweight metadata for a known model (no provider/baseUrl/runtime fields).
 */
export interface KnownModelMetadata {
	id: string;
	name: string;
	api: Api;
	contextWindow: number;
	maxTokens: number;
	reasoning: boolean;
	input: ("text" | "image")[];
	cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

/**
 * Map of model ID → known metadata.
 *
 * Populated at build time from models.generated.ts via scripts/generate-known-models.ts.
 * Multiple providers may share the same model ID (e.g., "gpt-4o" appears under both
 * "openai" and "openrouter"), so this map uses the bare model ID as key.
 */
export const KNOWN_MODEL_METADATA: Map<string, KnownModelMetadata> = new Map(
	GENERATED_KNOWN_MODELS.map((m) => [m.id, m]),
);

/**
 * Look up known metadata for a discovered model by ID.
 *
 * Resolution order:
 * 1. Exact match (e.g., "claude-sonnet-4-20250514")
 * 2. Strip date suffix (e.g., "claude-sonnet-4-20250514" → "claude-sonnet-4")
 * 3. Strip "-latest" suffix (e.g., "gemini-2.5-flash-latest" → "gemini-2.5-flash")
 * 4. Returns undefined if no match found
 */
export function lookupKnownModel(modelId: string): KnownModelMetadata | undefined {
	// 1. Exact match
	const exact = KNOWN_MODEL_METADATA.get(modelId);
	if (exact) return exact;

	// 2. Strip date suffix: "claude-sonnet-4-20250514" → "claude-sonnet-4"
	const dateStripped = modelId.replace(/-\d{8}$/, "");
	if (dateStripped !== modelId) {
		const dateMatch = KNOWN_MODEL_METADATA.get(dateStripped);
		if (dateMatch) return dateMatch;
	}

	// 3. Strip "-latest" suffix: "gemini-2.5-flash-latest" → "gemini-2.5-flash"
	const latestStripped = modelId.replace(/-latest$/, "");
	if (latestStripped !== modelId) {
		const latestMatch = KNOWN_MODEL_METADATA.get(latestStripped);
		if (latestMatch) return latestMatch;
	}

	return undefined;
}

/**
 * Conservative defaults for completely unknown discovered models.
 * Used when lookupKnownModel() returns undefined.
 *
 * Note: `api` is intentionally omitted — it should come from the provider config.
 */
export const UNKNOWN_MODEL_DEFAULTS = {
	contextWindow: 128_000,
	maxTokens: 16_384,
	reasoning: false,
	input: ["text"] as ("text" | "image")[],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
} as const;
