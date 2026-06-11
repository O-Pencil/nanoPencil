/**
 * [WHO]: CUSTOM_ANTHROPIC_PROVIDER, CUSTOM_OPENAI_PROVIDER, registerCustomProvider()
 * [FROM]: Depends on config/auth-storage, node:fs
 * [TO]: Consumed by core/model-registry.ts
 * [HERE]: core/model/custom-providers.ts - custom provider registration
 */
import type { AuthStorage } from "../platform/config/auth-storage.js";
import { existsSync, readFileSync, writeFileSync } from "fs";

export const CUSTOM_ANTHROPIC_PROVIDER = "custom-anthropic";
export const CUSTOM_OPENAI_PROVIDER = "custom-openai";
const DEFAULT_CUSTOM_MODEL_NAME = "custom-model";
const CUSTOM_PROVIDER_CONFIG_VERSION = 2;

export type CustomProtocolProviderId =
	| typeof CUSTOM_ANTHROPIC_PROVIDER
	| typeof CUSTOM_OPENAI_PROVIDER;

type ModelsConfigFile = {
	providers?: Record<string, Record<string, unknown>>;
};

type CustomProtocolProviderDefinition = {
	id: CustomProtocolProviderId;
	label: string;
	description: string;
	defaultBaseUrl: string;
	api: "anthropic-messages" | "openai-completions";
	defaultInput: ("text" | "image")[];
};

const CUSTOM_PROVIDER_DEFINITIONS: Record<
	CustomProtocolProviderId,
	CustomProtocolProviderDefinition
> = {
	[CUSTOM_ANTHROPIC_PROVIDER]: {
		id: CUSTOM_ANTHROPIC_PROVIDER,
		label: "Anthropic-compatible",
		description: "Configure or edit an endpoint that speaks the Anthropic Messages API.",
		defaultBaseUrl: "https://api.anthropic.com/v1",
		api: "anthropic-messages",
		defaultInput: ["text", "image"],
	},
	[CUSTOM_OPENAI_PROVIDER]: {
		id: CUSTOM_OPENAI_PROVIDER,
		label: "OpenAI-compatible",
		description: "Configure or edit an endpoint that speaks an OpenAI-compatible API.",
		defaultBaseUrl: "https://api.openai.com/v1",
		api: "openai-completions",
		defaultInput: ["text", "image"],
	},
};

type CustomProviderModelDefinition = {
	id: string;
	name: string;
	api: "anthropic-messages" | "openai-completions";
	input: ("text" | "image")[];
	contextWindow: number;
	maxTokens: number;
};

function readModelsConfig(modelsPath: string): ModelsConfigFile {
	if (!existsSync(modelsPath)) {
		return { providers: {} };
	}

	const raw = readFileSync(modelsPath, "utf-8");
	const parsed = JSON.parse(raw) as ModelsConfigFile;
	return { providers: parsed.providers ?? {} };
}

function writeModelsConfig(modelsPath: string, config: ModelsConfigFile): void {
	writeFileSync(modelsPath, JSON.stringify(config, null, 2), "utf-8");
}

function createCustomModelDefinition(
	provider: CustomProtocolProviderId,
	modelName: string,
	overrides?: { contextWindow?: number; maxTokens?: number },
): CustomProviderModelDefinition {
	const definition = getCustomProtocolProviderDefinition(provider);
	const normalizedModelName = modelName.trim() || DEFAULT_CUSTOM_MODEL_NAME;

	return {
		id: normalizedModelName,
		name: normalizedModelName,
		api: definition.api,
		input: definition.defaultInput,
		contextWindow: overrides?.contextWindow ?? 256000,
		maxTokens: overrides?.maxTokens ?? 32768,
	};
}

/**
 * Probe provider API for model context window and max output tokens.
 * Returns null if probing is unsupported or fails silently.
 */
async function probeModelContextWindow(
	provider: CustomProtocolProviderId,
	baseUrl: string,
	apiKey: string | undefined,
	modelName: string,
): Promise<{ contextWindow?: number; maxTokens?: number } | null> {
	try {
		// Anthropic-compatible: no /v1/models endpoint
		if (provider === CUSTOM_ANTHROPIC_PROVIDER) {
			return null;
		}

		// Ollama: use /api/show (more reliable than /v1/models for context_length)
		if (baseUrl.includes("localhost:11434") || baseUrl.includes("127.0.0.1:11434")) {
			const ollamaResult = await probeOllamaModelInfo(modelName);
			if (ollamaResult) return ollamaResult;
		}

		// OpenAI-compatible: GET /v1/models
		if (!apiKey) return null;
		return await probeOpenAICompatibleModels(baseUrl, apiKey, modelName);
	} catch {
		return null;
	}
}

/** Probe Ollama /api/show for model metadata. */
async function probeOllamaModelInfo(
	modelName: string,
): Promise<{ contextWindow?: number; maxTokens?: number } | null> {
	try {
		const ollamaBase = "http://localhost:11434";
		const resp = await fetch(`${ollamaBase}/api/show`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: modelName }),
			signal: AbortSignal.timeout(5000),
		});
		if (!resp.ok) return null;

		const data = await resp.json() as Record<string, unknown>;
		const modelInfo = data.model_info as Record<string, unknown> | undefined;
		if (!modelInfo) return null;

		// Ollama stores context_length in model_info["general.context_length"]
		const contextLength = modelInfo["general.context_length"];
		if (typeof contextLength === "number" && contextLength > 0) {
			return { contextWindow: contextLength };
		}
		return null;
	} catch {
		return null;
	}
}

/** Probe OpenAI-compatible /v1/models for model metadata. */
async function probeOpenAICompatibleModels(
	baseUrl: string,
	apiKey: string,
	modelName: string,
): Promise<{ contextWindow?: number; maxTokens?: number } | null> {
	try {
		// Normalize: strip trailing path beyond /v1 to get /v1/models endpoint
		const modelsUrl = buildModelsEndpoint(baseUrl);
		const resp = await fetch(modelsUrl, {
			headers: { Authorization: `Bearer ${apiKey}` },
			signal: AbortSignal.timeout(5000),
		});
		if (!resp.ok) return null;

		const data = await resp.json() as Record<string, unknown>;
		const models = data.data as Array<Record<string, unknown>> | undefined;
		if (!Array.isArray(models)) return null;

		const match = models.find((m) => m.id === modelName);
		if (!match) return null;

		// Extract context_length — different providers use different fields
		const contextLength =
			(match.context_length as number | undefined) ??
			(match.max_context_length as number | undefined) ??
			((match.top_provider as Record<string, unknown> | undefined)?.context_length as number | undefined);

		if (typeof contextLength === "number" && contextLength > 0) {
			return { contextWindow: contextLength };
		}
		return null;
	} catch {
		return null;
	}
}

/** Build /v1/models URL from a baseUrl that may point to chat/completions. */
function buildModelsEndpoint(baseUrl: string): string {
	const url = baseUrl.replace(/\/+$/, "");
	// If URL ends with /chat/completions, strip it
	if (url.endsWith("/chat/completions")) {
		return url.slice(0, -"/chat/completions".length) + "/models";
	}
	// If URL ends with /v1, append /models
	if (url.endsWith("/v1")) {
		return url + "/models";
	}
	// Otherwise assume it's already a /v1-compatible base
	return url + "/models";
}

function getStoredProviderConfig(
	modelsPath: string,
	provider: CustomProtocolProviderId,
): Record<string, unknown> | undefined {
	try {
		const config = readModelsConfig(modelsPath);
		return config.providers?.[provider];
	} catch {
		return undefined;
	}
}

function getStoredModelId(providerConfig: Record<string, unknown> | undefined): string | undefined {
	const models = providerConfig?.models;
	if (!Array.isArray(models) || models.length === 0) {
		return undefined;
	}

	const firstModel = models[0];
	if (
		typeof firstModel === "object" &&
		firstModel !== null &&
		"id" in firstModel &&
		typeof firstModel.id === "string" &&
		firstModel.id.trim()
	) {
		return firstModel.id.trim();
	}

	return undefined;
}

function getStoredModelCount(providerConfig: Record<string, unknown> | undefined): number {
	const models = providerConfig?.models;
	return Array.isArray(models) ? models.length : 0;
}

function getStoredConfigVersion(
	providerConfig: Record<string, unknown> | undefined,
): number | undefined {
	const version = providerConfig?.customProviderVersion;
	return typeof version === "number" ? version : undefined;
}

export function isCustomProtocolProvider(
	provider: string,
): provider is CustomProtocolProviderId {
	return provider === CUSTOM_ANTHROPIC_PROVIDER || provider === CUSTOM_OPENAI_PROVIDER;
}

export function listCustomProtocolProviders(): CustomProtocolProviderId[] {
	return [CUSTOM_ANTHROPIC_PROVIDER, CUSTOM_OPENAI_PROVIDER];
}

export function getCustomProtocolProviderDefinition(
	provider: CustomProtocolProviderId,
): CustomProtocolProviderDefinition {
	return CUSTOM_PROVIDER_DEFINITIONS[provider];
}

export function getCustomProtocolProviderBaseUrl(
	modelsPath: string,
	provider: CustomProtocolProviderId,
): string | undefined {
	const providerConfig = getStoredProviderConfig(modelsPath, provider);
	const baseUrl = providerConfig?.baseUrl;
	return typeof baseUrl === "string" && baseUrl.trim() ? baseUrl.trim() : undefined;
}

export function getCustomProtocolProviderModelName(
	modelsPath: string,
	provider: CustomProtocolProviderId,
): string | undefined {
	return getStoredModelId(getStoredProviderConfig(modelsPath, provider));
}

export function ensureCustomProtocolProvidersInModels(modelsPath: string): void {
	let config: ModelsConfigFile;
	try {
		config = readModelsConfig(modelsPath);
	} catch {
		return;
	}
	config.providers ??= {};

	let changed = false;
	for (const provider of listCustomProtocolProviders()) {
		const definition = getCustomProtocolProviderDefinition(provider);
		const existing = config.providers[provider];
		const version = getStoredConfigVersion(existing);
		const shouldResetModelName =
			version !== CUSTOM_PROVIDER_CONFIG_VERSION ||
			getStoredModelCount(existing) !== 1;
		const modelName = shouldResetModelName
			? DEFAULT_CUSTOM_MODEL_NAME
			: getStoredModelId(existing) ?? DEFAULT_CUSTOM_MODEL_NAME;
		const nextModels = [createCustomModelDefinition(provider, modelName)];

		if (!existing) {
			config.providers[provider] = {
				baseUrl: definition.defaultBaseUrl,
				customProviderVersion: CUSTOM_PROVIDER_CONFIG_VERSION,
				models: nextModels,
			};
			changed = true;
			continue;
		}

		if (typeof existing.baseUrl !== "string" || !existing.baseUrl.trim()) {
			existing.baseUrl = definition.defaultBaseUrl;
			changed = true;
		}

		if (existing.customProviderVersion !== CUSTOM_PROVIDER_CONFIG_VERSION) {
			existing.customProviderVersion = CUSTOM_PROVIDER_CONFIG_VERSION;
			changed = true;
		}

		const currentModels = existing.models;
		if (JSON.stringify(currentModels) !== JSON.stringify(nextModels)) {
			existing.models = nextModels;
			changed = true;
		}
	}

	if (changed) {
		writeModelsConfig(modelsPath, config);
	}
}

export async function saveCustomProtocolProviderConfig(
	modelsPath: string,
	provider: CustomProtocolProviderId,
	configUpdate: {
		baseUrl: string;
		modelName: string;
		apiKey?: string;
	},
): Promise<{ contextWindow?: number; maxTokens?: number } | null> {
	const trimmedBaseUrl = configUpdate.baseUrl.trim();
	const trimmedModelName = configUpdate.modelName.trim();
	if (!trimmedBaseUrl) {
		throw new Error("Base URL cannot be empty.");
	}
	if (!trimmedModelName) {
		throw new Error("Model name cannot be empty.");
	}

	// Probe for real context window (silently falls back to defaults on failure)
	const probed = await probeModelContextWindow(
		provider,
		trimmedBaseUrl,
		configUpdate.apiKey,
		trimmedModelName,
	);

	const config = readModelsConfig(modelsPath);
	config.providers ??= {};

	config.providers[provider] = {
		...(config.providers[provider] ?? {}),
		baseUrl: trimmedBaseUrl,
		customProviderVersion: CUSTOM_PROVIDER_CONFIG_VERSION,
		models: [createCustomModelDefinition(provider, trimmedModelName, probed ?? undefined)],
	};
	writeModelsConfig(modelsPath, config);
	return probed;
}

export function saveCustomProtocolProviderApiKey(
	authStorage: AuthStorage,
	provider: CustomProtocolProviderId,
	apiKey: string,
): void {
	const trimmedApiKey = apiKey.trim();
	if (!trimmedApiKey) {
		throw new Error("API key cannot be empty.");
	}

	authStorage.set(provider, {
		type: "api_key",
		key: trimmedApiKey,
	});
}
