/**
 * [WHO]: ModelRegistry class, model definitions, API key resolution
 * [FROM]: Depends on ai, typebox, config modules
 * [TO]: Consumed by index.ts, main.ts, catui-defaults.ts, core/runtime/sdk.ts, core/runtime/agent-session.ts, core/extensions-host/runner.ts, core/extensions-host/types.ts, cli/list-models.ts, modes/interactive/components/model-selector.ts, and test files
 * [HERE]: core/model-registry.ts - model catalog and credential management
 */
import type {
	Api,
	Context,
	KnownProvider,
	Model,
	OpenAICompletionsCompat,
	OpenAIResponsesCompat,
	SimpleStreamOptions,
} from "@catui/ai/types";
import type { AssistantMessageEventStream } from "@catui/ai/events";
import { getModels, getProviders } from "@catui/ai/models";
import { registerOAuthProvider, type OAuthProviderInterface } from "@catui/ai/oauth";
import { registerApiProvider } from "@catui/ai/registry";
import { type Static, Type } from "@sinclair/typebox";
import AjvModule from "ajv";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { getAgentDir } from "../config.js";
import type { AuthStorage } from "./platform/config/auth-storage.js";
import { clearConfigValueCache, resolveConfigValue, resolveHeaders } from "./platform/config/resolve-config-value.js";
import { discoverModels, getDiscoveryProtocol, type DiscoveryResult, type DiscoveredModel } from "./model/discovery.js";
import { DiscoveryCache } from "./model/discovery-cache.js";
import { lookupKnownModel, UNKNOWN_MODEL_DEFAULTS } from "./model/known-models.js";

const Ajv = (AjvModule as any).default || AjvModule;

// Schema for OpenRouter routing preferences
const OpenRouterRoutingSchema = Type.Object({
	only: Type.Optional(Type.Array(Type.String())),
	order: Type.Optional(Type.Array(Type.String())),
});

// Schema for Vercel AI Gateway routing preferences
const VercelGatewayRoutingSchema = Type.Object({
	only: Type.Optional(Type.Array(Type.String())),
	order: Type.Optional(Type.Array(Type.String())),
});

// Schema for OpenAI compatibility settings
const OpenAICompletionsCompatSchema = Type.Object({
	supportsStore: Type.Optional(Type.Boolean()),
	supportsDeveloperRole: Type.Optional(Type.Boolean()),
	supportsReasoningEffort: Type.Optional(Type.Boolean()),
	supportsUsageInStreaming: Type.Optional(Type.Boolean()),
	maxTokensField: Type.Optional(Type.Union([Type.Literal("max_completion_tokens"), Type.Literal("max_tokens")])),
	requiresToolResultName: Type.Optional(Type.Boolean()),
	requiresAssistantAfterToolResult: Type.Optional(Type.Boolean()),
	requiresThinkingAsText: Type.Optional(Type.Boolean()),
	requiresMistralToolIds: Type.Optional(Type.Boolean()),
	thinkingFormat: Type.Optional(Type.Union([Type.Literal("openai"), Type.Literal("zai"), Type.Literal("qwen")])),
	openRouterRouting: Type.Optional(OpenRouterRoutingSchema),
	vercelGatewayRouting: Type.Optional(VercelGatewayRoutingSchema),
});

const OpenAIResponsesCompatSchema = Type.Object({
	// Reserved for future use
});

const OpenAICompatSchema = Type.Union([OpenAICompletionsCompatSchema, OpenAIResponsesCompatSchema]);
const AgentLoopFrameworkSchema = Type.Union([
	Type.Literal("standard"),
	Type.Literal("weak-model-compatible"),
	Type.Literal("high-intelligence"),
	Type.Literal("low-intelligence"),
	Type.Literal("structured-adaptive"),
]);
type AgentLoopFramework = "standard" | "weak-model-compatible";
type AgentLoopFrameworkInput =
	| AgentLoopFramework
	| "high-intelligence"
	| "low-intelligence"
	| "structured-adaptive";
type ModelWithAgentLoop = Omit<Model<Api>, "agentLoopFramework"> & { agentLoopFramework?: AgentLoopFramework };

// Schema for custom model definition
// Most fields are optional with sensible defaults for local models (Ollama, LM Studio, etc.)
const ModelDefinitionSchema = Type.Object({
	id: Type.String({ minLength: 1 }),
	name: Type.Optional(Type.String({ minLength: 1 })),
	api: Type.Optional(Type.String({ minLength: 1 })),
	reasoning: Type.Optional(Type.Boolean()),
	input: Type.Optional(Type.Array(Type.Union([Type.Literal("text"), Type.Literal("image")]))),
	cost: Type.Optional(
		Type.Object({
			input: Type.Number(),
			output: Type.Number(),
			cacheRead: Type.Number(),
			cacheWrite: Type.Number(),
		}),
	),
	contextWindow: Type.Optional(Type.Number()),
	maxTokens: Type.Optional(Type.Number()),
	headers: Type.Optional(Type.Record(Type.String(), Type.String())),
	agentLoopFramework: Type.Optional(AgentLoopFrameworkSchema),
	compat: Type.Optional(OpenAICompatSchema),
});

// Schema for per-model overrides (all fields optional, merged with built-in model)
const ModelOverrideSchema = Type.Object({
	name: Type.Optional(Type.String({ minLength: 1 })),
	reasoning: Type.Optional(Type.Boolean()),
	input: Type.Optional(Type.Array(Type.Union([Type.Literal("text"), Type.Literal("image")]))),
	cost: Type.Optional(
		Type.Object({
			input: Type.Optional(Type.Number()),
			output: Type.Optional(Type.Number()),
			cacheRead: Type.Optional(Type.Number()),
			cacheWrite: Type.Optional(Type.Number()),
		}),
	),
	contextWindow: Type.Optional(Type.Number()),
	maxTokens: Type.Optional(Type.Number()),
	headers: Type.Optional(Type.Record(Type.String(), Type.String())),
	agentLoopFramework: Type.Optional(AgentLoopFrameworkSchema),
	compat: Type.Optional(OpenAICompatSchema),
});

type ModelOverride = Static<typeof ModelOverrideSchema>;

function normalizeAgentLoopFramework(
	value: AgentLoopFrameworkInput | undefined,
): AgentLoopFramework | undefined {
	if (value === "high-intelligence") return "standard";
	if (value === "low-intelligence" || value === "structured-adaptive") return "weak-model-compatible";
	return value;
}

const ProviderConfigSchema = Type.Object({
	baseUrl: Type.Optional(Type.String({ minLength: 1 })),
	apiKey: Type.Optional(Type.String({ minLength: 1 })),
	api: Type.Optional(Type.String({ minLength: 1 })),
	headers: Type.Optional(Type.Record(Type.String(), Type.String())),
	authHeader: Type.Optional(Type.Boolean()),
	models: Type.Optional(Type.Array(ModelDefinitionSchema)),
	modelOverrides: Type.Optional(Type.Record(Type.String(), ModelOverrideSchema)),
	/** Enable remote model discovery from provider's /models endpoint. */
	discovery: Type.Optional(Type.Boolean()),
	/** Cache TTL for discovery results in seconds (default: 86400 = 24h). */
	discoveryCacheTtl: Type.Optional(Type.Number()),
});

const ModelsConfigSchema = Type.Object({
	providers: Type.Record(Type.String(), ProviderConfigSchema),
});

type ModelsConfig = Static<typeof ModelsConfigSchema>;

/** Provider override config (baseUrl, headers, apiKey) without custom models */
interface ProviderOverride {
	baseUrl?: string;
	headers?: Record<string, string>;
	apiKey?: string;
}

/** Result of loading custom models from models.json */
interface CustomModelsResult {
	models: Model<Api>[];
	/** Providers with baseUrl/headers/apiKey overrides for built-in models */
	overrides: Map<string, ProviderOverride>;
	/** Per-model overrides: provider -> modelId -> override */
	modelOverrides: Map<string, Map<string, ModelOverride>>;
	error: string | undefined;
}

function emptyCustomModelsResult(error?: string): CustomModelsResult {
	return { models: [], overrides: new Map(), modelOverrides: new Map(), error };
}

function mergeCompat(
	baseCompat: Model<Api>["compat"],
	overrideCompat: ModelOverride["compat"],
): Model<Api>["compat"] | undefined {
	if (!overrideCompat) return baseCompat;

	const base = baseCompat as OpenAICompletionsCompat | OpenAIResponsesCompat | undefined;
	const override = overrideCompat as OpenAICompletionsCompat | OpenAIResponsesCompat;
	const merged = { ...base, ...override } as OpenAICompletionsCompat | OpenAIResponsesCompat;

	const baseCompletions = base as OpenAICompletionsCompat | undefined;
	const overrideCompletions = override as OpenAICompletionsCompat;
	const mergedCompletions = merged as OpenAICompletionsCompat;

	if (baseCompletions?.openRouterRouting || overrideCompletions.openRouterRouting) {
		mergedCompletions.openRouterRouting = {
			...baseCompletions?.openRouterRouting,
			...overrideCompletions.openRouterRouting,
		};
	}

	if (baseCompletions?.vercelGatewayRouting || overrideCompletions.vercelGatewayRouting) {
		mergedCompletions.vercelGatewayRouting = {
			...baseCompletions?.vercelGatewayRouting,
			...overrideCompletions.vercelGatewayRouting,
		};
	}

	return merged as Model<Api>["compat"];
}

/**
 * Deep merge a model override into a model.
 * Handles nested objects (cost, compat) by merging rather than replacing.
 */
function applyModelOverride(model: Model<Api>, override: ModelOverride): Model<Api> {
	const result: ModelWithAgentLoop = { ...(model as Omit<Model<Api>, "agentLoopFramework">) };

	// Simple field overrides
	if (override.name !== undefined) result.name = override.name;
	if (override.reasoning !== undefined) result.reasoning = override.reasoning;
	if (override.input !== undefined) result.input = override.input as ("text" | "image")[];
	if (override.contextWindow !== undefined) result.contextWindow = override.contextWindow;
	if (override.maxTokens !== undefined) result.maxTokens = override.maxTokens;
	if (override.agentLoopFramework !== undefined) {
		result.agentLoopFramework = normalizeAgentLoopFramework(override.agentLoopFramework);
	}

	// Merge cost (partial override)
	if (override.cost) {
		result.cost = {
			input: override.cost.input ?? model.cost.input,
			output: override.cost.output ?? model.cost.output,
			cacheRead: override.cost.cacheRead ?? model.cost.cacheRead,
			cacheWrite: override.cost.cacheWrite ?? model.cost.cacheWrite,
		};
	}

	// Merge headers
	if (override.headers) {
		const resolvedHeaders = resolveHeaders(override.headers);
		result.headers = resolvedHeaders ? { ...model.headers, ...resolvedHeaders } : model.headers;
	}

	// Deep merge compat
	result.compat = mergeCompat(model.compat, override.compat);

	return result as Model<Api>;
}

/** Clear the config value command cache. Exported for testing. */
export const clearApiKeyCache = clearConfigValueCache;

/**
 * Catui (`useOnlyCustomModels`): only these OpenRouter entries ship from the built-in catalog.
 * OpenRouter exposes hundreds of models; listing all in `/model` is noisy. Users add arbitrary model ids
 * in models.json (same string as on openrouter.ai) — merged with these defaults by provider+id.
 */
const CATUI_OPENROUTER_BUILTIN_MODEL_IDS: readonly string[] = ["openrouter/auto", "openrouter/free"];

/**
 * Model registry - loads and manages models, resolves API keys via AuthStorage.
 */
export interface ModelRegistryOptions {
	/**
	 * When true, only load models from models.json (no full built-in catalog). Used by Catui.
	 * Exception: a small OpenRouter built-in set (`openrouter/auto`, `openrouter/free`) so `/login` and
	 * `/model` work without pasting ids; add any other OpenRouter model id in models.json.
	 */
	useOnlyCustomModels?: boolean;
	/** Provider id(s) for which apiKey is optional in models.json (key stored in auth.json later). Used by Catui. */
	allowOptionalApiKeyForProvider?: string | string[];
}

/** Per-provider discovery configuration extracted from models.json. */
interface DiscoveryProviderConfig {
	provider: string;
	baseUrl: string;
	api: string;
	cacheTtl: number;
}

export class ModelRegistry {
	private models: Model<Api>[] = [];
	private customProviderApiKeys: Map<string, string> = new Map();
	private registeredProviders: Map<string, ProviderConfigInput> = new Map();
	private loadError: string | undefined = undefined;
	private useOnlyCustomModels: boolean;
	private allowOptionalApiKeyForProvider: string | string[] | undefined;
	private discoveryCache: DiscoveryCache;
	private discoveryProviders: Map<string, DiscoveryProviderConfig> = new Map();
	private discoveryRefreshing = false;

	constructor(
		readonly authStorage: AuthStorage,
		private modelsJsonPath: string | undefined = join(getAgentDir(), "models.json"),
		options: ModelRegistryOptions = {},
	) {
		this.useOnlyCustomModels = options.useOnlyCustomModels ?? false;
		this.allowOptionalApiKeyForProvider = options.allowOptionalApiKeyForProvider;

		// Initialize discovery cache
		const agentDir = modelsJsonPath ? dirname(modelsJsonPath) : getAgentDir();
		this.discoveryCache = new DiscoveryCache(join(agentDir, ".cache", "discovery"));

		// Set up fallback resolver for custom provider API keys
		this.authStorage.setFallbackResolver((provider) => {
			const keyConfig = this.customProviderApiKeys.get(provider);
			if (keyConfig) {
				return resolveConfigValue(keyConfig);
			}
			return undefined;
		});

		// Load models
		this.loadModels();
	}

	/**
	 * Reload models from disk (built-in + custom from models.json).
	 */
	refresh(): void {
		this.customProviderApiKeys.clear();
		this.loadError = undefined;
		this.loadModels();

		for (const [providerName, config] of this.registeredProviders.entries()) {
			this.applyProviderConfig(providerName, config);
		}
	}

	/**
	 * Get any error from loading models.json (undefined if no error).
	 */
	getError(): string | undefined {
		return this.loadError;
	}

	private loadModels(): void {
		// Load custom models and overrides from models.json
		const {
			models: customModels,
			overrides,
			modelOverrides,
			error,
		} = this.modelsJsonPath ? this.loadCustomModels(this.modelsJsonPath) : emptyCustomModelsResult();

		if (error) {
			this.loadError = error;
			// Keep built-in models even if custom models failed to load
		}

		const builtInModels = this.useOnlyCustomModels
			? this.loadBuiltInModels(
					overrides,
					modelOverrides,
					new Set<string>(["openrouter", "zai"]),
					{
						openrouter: new Set(CATUI_OPENROUTER_BUILTIN_MODEL_IDS),
						// zai not specified = load all zai models
					},
				)
			: this.loadBuiltInModels(overrides, modelOverrides);
		let combined = this.mergeCustomModels(builtInModels, customModels);

		// Merge cached discovery data for all discovery-enabled providers
		for (const [providerName, discConfig] of this.discoveryProviders) {
			const cached = this.discoveryCache.read(providerName, discConfig.cacheTtl);
			if (cached) {
				combined = this.mergeDiscoveredModels(combined, cached.models, providerName, discConfig);
			}
		}

		// Let OAuth providers modify their models (e.g., update baseUrl)
		for (const oauthProvider of this.authStorage.getOAuthProviders()) {
			const cred = this.authStorage.get(oauthProvider.id);
			if (cred?.type === "oauth" && oauthProvider.modifyModels) {
				combined = oauthProvider.modifyModels(combined, cred);
			}
		}

		this.models = combined;
	}

	/** Load built-in models and apply provider/model overrides */
	private loadBuiltInModels(
		overrides: Map<string, ProviderOverride>,
		modelOverrides: Map<string, Map<string, ModelOverride>>,
		restrictToProviders?: Set<string>,
		restrictModelIdsByProvider?: Record<string, Set<string>>,
	): Model<Api>[] {
		const providers = restrictToProviders
			? getProviders().filter((p) => restrictToProviders.has(p))
			: getProviders();
		return providers.flatMap((provider) => {
			const allowedIds = restrictModelIdsByProvider?.[provider];
			const models = (getModels(provider as KnownProvider) as Model<Api>[]).filter(
				(m) => !allowedIds || allowedIds.has(m.id),
			);
			const providerOverride = overrides.get(provider);
			const perModelOverrides = modelOverrides.get(provider);

			return models.map((m) => {
				let model = m;

				// Apply provider-level baseUrl/headers override
				if (providerOverride) {
					const resolvedHeaders = resolveHeaders(providerOverride.headers);
					model = {
						...model,
						baseUrl: providerOverride.baseUrl ?? model.baseUrl,
						headers: resolvedHeaders ? { ...model.headers, ...resolvedHeaders } : model.headers,
					};
				}

				// Apply per-model override
				const modelOverride = perModelOverrides?.get(m.id);
				if (modelOverride) {
					model = applyModelOverride(model, modelOverride);
				}

				return model;
			});
		});
	}

	/** Merge custom models into built-in list by provider+id (custom wins on conflicts). */
	private mergeCustomModels(builtInModels: Model<Api>[], customModels: Model<Api>[]): Model<Api>[] {
		const merged = [...builtInModels];
		for (const customModel of customModels) {
			const existingIndex = merged.findIndex((m) => m.provider === customModel.provider && m.id === customModel.id);
			if (existingIndex >= 0) {
				merged[existingIndex] = customModel;
			} else {
				merged.push(customModel);
			}
		}
		return merged;
	}

	/**
	 * Merge discovered models into the existing model list.
	 * Hand-configured models (by provider+id) are NOT overwritten — they take priority.
	 * Discovered models use known-metadata defaults for fields the /models endpoint doesn't provide.
	 */
	private mergeDiscoveredModels(
		existing: Model<Api>[],
		discovered: DiscoveredModel[],
		providerName: string,
		discConfig: DiscoveryProviderConfig,
	): Model<Api>[] {
		const merged = [...existing];
		const existingIds = new Set(
			existing.filter((m) => m.provider === providerName).map((m) => m.id),
		);

		for (const disc of discovered) {
			if (existingIds.has(disc.id)) continue; // hand-configured wins

			const known = lookupKnownModel(disc.id);
			const fallback = known ?? UNKNOWN_MODEL_DEFAULTS;

			merged.push({
				id: disc.id,
				name: disc.name ?? known?.name ?? disc.id,
				// API comes from provider config first, then known metadata; fallback has no api
				api: (discConfig.api ?? known?.api ?? "openai-completions") as Api,
				provider: providerName,
				baseUrl: discConfig.baseUrl,
				reasoning: fallback.reasoning,
				input: [...fallback.input],
				cost: { ...fallback.cost },
				contextWindow: fallback.contextWindow,
				maxTokens: fallback.maxTokens,
				source: "discovery",
			} as Model<Api>);
		}

		return merged;
	}

	private loadCustomModels(modelsJsonPath: string): CustomModelsResult {
		if (!existsSync(modelsJsonPath)) {
			return emptyCustomModelsResult();
		}

		try {
			const content = readFileSync(modelsJsonPath, "utf-8");
			const config: ModelsConfig = JSON.parse(content);

			// Validate schema
			const ajv = new Ajv();
			const validate = ajv.compile(ModelsConfigSchema);
			if (!validate(config)) {
				const errors =
					validate.errors?.map((e: any) => `  - ${e.instancePath || "root"}: ${e.message}`).join("\n") ||
					"Unknown schema error";
				return emptyCustomModelsResult(`Invalid models.json schema:\n${errors}\n\nFile: ${modelsJsonPath}`);
			}

			// Additional validation
			this.validateConfig(config);

			const overrides = new Map<string, ProviderOverride>();
			const modelOverrides = new Map<string, Map<string, ModelOverride>>();

			// Reset discovery providers for this load cycle
			this.discoveryProviders.clear();

			for (const [providerName, providerConfig] of Object.entries(config.providers)) {
				// Apply provider-level baseUrl/headers/apiKey override to built-in models when configured.
				if (providerConfig.baseUrl || providerConfig.headers || providerConfig.apiKey) {
					overrides.set(providerName, {
						baseUrl: providerConfig.baseUrl,
						headers: providerConfig.headers,
						apiKey: providerConfig.apiKey,
					});
				}

				// Store API key for fallback resolver.
				if (providerConfig.apiKey) {
					this.customProviderApiKeys.set(providerName, providerConfig.apiKey);
				}

				if (providerConfig.modelOverrides) {
					modelOverrides.set(providerName, new Map(Object.entries(providerConfig.modelOverrides)));
				}

				// Extract discovery configuration
				if (providerConfig.discovery && providerConfig.baseUrl && providerConfig.api) {
					this.discoveryProviders.set(providerName, {
						provider: providerName,
						baseUrl: providerConfig.baseUrl,
						api: providerConfig.api,
						cacheTtl: providerConfig.discoveryCacheTtl ?? 86400,
					});
				}
			}

			return { models: this.parseModels(config), overrides, modelOverrides, error: undefined };
		} catch (error) {
			if (error instanceof SyntaxError) {
				return emptyCustomModelsResult(`Failed to parse models.json: ${error.message}\n\nFile: ${modelsJsonPath}`);
			}
			return emptyCustomModelsResult(
				`Failed to load models.json: ${error instanceof Error ? error.message : error}\n\nFile: ${modelsJsonPath}`,
			);
		}
	}

	private validateConfig(config: ModelsConfig): void {
		for (const [providerName, providerConfig] of Object.entries(config.providers)) {
			const hasProviderApi = !!providerConfig.api;
			const models = providerConfig.models ?? [];
			const hasModelOverrides =
				providerConfig.modelOverrides && Object.keys(providerConfig.modelOverrides).length > 0;

			if (models.length === 0) {
				// Discovery-only config: needs baseUrl + api + discovery
				if (providerConfig.discovery && providerConfig.baseUrl && providerConfig.api) {
					continue; // Valid discovery-only config, skip further validation
				}
				// Override-only config: needs baseUrl OR modelOverrides (or both)
				if (!providerConfig.baseUrl && !hasModelOverrides) {
					throw new Error(`Provider ${providerName}: must specify "baseUrl", "modelOverrides", or "models".`);
				}
			} else {
				// Custom models are merged into provider models and require endpoint + auth.
				if (!providerConfig.baseUrl) {
					throw new Error(`Provider ${providerName}: "baseUrl" is required when defining custom models.`);
				}
				const allowed =
					this.allowOptionalApiKeyForProvider !== undefined &&
					(Array.isArray(this.allowOptionalApiKeyForProvider)
						? this.allowOptionalApiKeyForProvider.includes(providerName)
						: providerName === this.allowOptionalApiKeyForProvider);
				const apiKeyOptional = !!allowed;
				if (!apiKeyOptional && !providerConfig.apiKey) {
					throw new Error(`Provider ${providerName}: "apiKey" is required when defining custom models.`);
				}
			}

			for (const modelDef of models) {
				const hasModelApi = !!modelDef.api;

				if (!hasProviderApi && !hasModelApi) {
					throw new Error(
						`Provider ${providerName}, model ${modelDef.id}: no "api" specified. Set at provider or model level.`,
					);
				}

				if (!modelDef.id) throw new Error(`Provider ${providerName}: model missing "id"`);
				// Validate contextWindow/maxTokens only if provided (they have defaults)
				if (modelDef.contextWindow !== undefined && modelDef.contextWindow <= 0)
					throw new Error(`Provider ${providerName}, model ${modelDef.id}: invalid contextWindow`);
				if (modelDef.maxTokens !== undefined && modelDef.maxTokens <= 0)
					throw new Error(`Provider ${providerName}, model ${modelDef.id}: invalid maxTokens`);
			}
		}
	}

	private parseModels(config: ModelsConfig): Model<Api>[] {
		const models: Model<Api>[] = [];

		for (const [providerName, providerConfig] of Object.entries(config.providers)) {
			const modelDefs = providerConfig.models ?? [];
			if (modelDefs.length === 0) continue; // Override-only, no custom models

			// Store API key config for fallback resolver
			if (providerConfig.apiKey) {
				this.customProviderApiKeys.set(providerName, providerConfig.apiKey);
			}

			for (const modelDef of modelDefs) {
				const api = modelDef.api || providerConfig.api;
				if (!api) continue;

				// Merge headers: provider headers are base, model headers override
				// Resolve env vars and shell commands in header values
				const providerHeaders = resolveHeaders(providerConfig.headers);
				const modelHeaders = resolveHeaders(modelDef.headers);
				let headers = providerHeaders || modelHeaders ? { ...providerHeaders, ...modelHeaders } : undefined;

				// If authHeader is true, add Authorization header with resolved API key
				if (providerConfig.authHeader && providerConfig.apiKey) {
					const resolvedKey = resolveConfigValue(providerConfig.apiKey);
					if (resolvedKey) {
						headers = { ...headers, Authorization: `Bearer ${resolvedKey}` };
					}
				}

				// baseUrl is validated to exist for providers with models
				// Apply defaults for optional fields
				const defaultCost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
				models.push({
					id: modelDef.id,
					name: modelDef.name ?? modelDef.id,
					api: api as Api,
					provider: providerName,
					baseUrl: providerConfig.baseUrl!,
					reasoning: modelDef.reasoning ?? false,
					input: (modelDef.input ?? ["text"]) as ("text" | "image")[],
					cost: modelDef.cost ?? defaultCost,
					contextWindow: modelDef.contextWindow ?? 128000,
					maxTokens: modelDef.maxTokens ?? 16384,
					headers,
					agentLoopFramework: normalizeAgentLoopFramework(modelDef.agentLoopFramework),
					compat: modelDef.compat,
				} as Model<Api>);
			}
		}

		return models;
	}

	/**
	 * Get all models (built-in + custom).
	 * If models.json had errors, returns only built-in models.
	 */
	getAll(): Model<Api>[] {
		return this.models;
	}

	/**
	 * Get only models that have auth configured.
	 * This is a fast check that doesn't refresh OAuth tokens.
	 */
	getAvailable(): Model<Api>[] {
		return this.models.filter((m) => this.authStorage.hasAuth(m.provider));
	}

	/**
	 * Get models with valid API keys (async, validates OAuth tokens).
	 * This checks and refreshes OAuth tokens, filtering out expired ones.
	 */
	async getAvailableAsync(): Promise<Model<Api>[]> {
		const result: Model<Api>[] = [];
		for (const model of this.models) {
			const apiKey = await this.authStorage.getApiKey(model.provider);
			if (apiKey) {
				result.push(model);
			}
		}
		return result;
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Model Discovery
	// ─────────────────────────────────────────────────────────────────────────

	/**
	 * Fetch models from remote /models endpoints for all discovery-enabled providers.
	 *
	 * This is an async, non-blocking operation:
	 * - Fetches all providers in parallel (Promise.allSettled)
	 * - Updates the discovery cache with fresh results
	 * - Re-runs loadModels() to merge fresh data
	 *
	 * Use this for:
	 * - Fire-and-forget on startup
	 * - Manual refresh from /model selector (Ctrl+R)
	 * - CLI --list-models --refresh
	 */
	async refreshWithDiscovery(): Promise<{ discovered: number; errors: string[] }> {
		if (this.discoveryRefreshing) return { discovered: 0, errors: [] };
		this.discoveryRefreshing = true;

		try {
			const results = await Promise.allSettled(
				Array.from(this.discoveryProviders.keys()).map((name) => this.discoverProvider(name)),
			);

			let discovered = 0;
			const errors: string[] = [];

			for (const result of results) {
				if (result.status === "rejected") {
					errors.push(result.reason?.message ?? "Unknown discovery error");
					continue;
				}
				discovered += result.value.models.length;
				if (result.value.error) {
					errors.push(`${result.value.provider}: ${result.value.error}`);
				}
			}

			// Reload models to merge fresh discovery data
			this.loadModels();

			// Re-apply registered provider configs
			for (const [providerName, config] of this.registeredProviders.entries()) {
				this.applyProviderConfig(providerName, config);
			}

			return { discovered, errors };
		} finally {
			this.discoveryRefreshing = false;
		}
	}

	/**
	 * Discover models for a single provider.
	 * Fetches from remote, updates cache, returns result.
	 */
	async discoverProvider(providerName: string): Promise<DiscoveryResult> {
		const discConfig = this.discoveryProviders.get(providerName);
		if (!discConfig) {
			return {
				provider: providerName,
				models: [],
				fetchedAt: Date.now(),
				ttl: 0,
				error: `Provider "${providerName}" does not have discovery enabled`,
			};
		}

		const protocol = getDiscoveryProtocol(discConfig.api);
		if (protocol === "unsupported") {
			return {
				provider: providerName,
				models: [],
				fetchedAt: Date.now(),
				ttl: 0,
				error: `Discovery not supported for API type "${discConfig.api}"`,
			};
		}

		const apiKey = await this.authStorage.getApiKey(providerName);
		const result = await discoverModels(
			providerName,
			discConfig.baseUrl,
			discConfig.api,
			apiKey,
		);

		// Update cache with fresh result
		if (result.models.length > 0 || !result.error) {
			this.discoveryCache.write(result);
		}

		return result;
	}

	/**
	 * Get discovery status for a provider.
	 * Useful for debugging and UI indicators.
	 */
	getDiscoveryStatus(providerName: string): {
		enabled: boolean;
		cached: boolean;
		lastFetched?: number;
		modelCount: number;
	} {
		const discConfig = this.discoveryProviders.get(providerName);
		if (!discConfig) {
			return { enabled: false, cached: false, modelCount: 0 };
		}

		const cached = this.discoveryCache.read(providerName, discConfig.cacheTtl);
		return {
			enabled: true,
			cached: cached !== undefined,
			lastFetched: cached?.fetchedAt,
			modelCount: cached?.models.length ?? 0,
		};
	}

	/**
	 * Check if a provider has discovery enabled.
	 */
	isDiscoveryEnabled(providerName: string): boolean {
		return this.discoveryProviders.has(providerName);
	}

	/**
	 * Clear all discovery cache data.
	 */
	clearDiscoveryCache(): void {
		this.discoveryCache.clear();
	}

	/**
	 * Find a model by provider and ID.
	 */
	find(provider: string, modelId: string): Model<Api> | undefined {
		return this.models.find((m) => m.provider === provider && m.id === modelId);
	}

	/**
	 * Get API key for a model.
	 */
	async getApiKey(model: Model<Api>): Promise<string | undefined> {
		return this.authStorage.getApiKey(model.provider);
	}

	/**
	 * Get API key for a provider.
	 */
	async getApiKeyForProvider(provider: string): Promise<string | undefined> {
		return this.authStorage.getApiKey(provider);
	}

	/**
	 * Check if a model is using OAuth credentials (subscription).
	 */
	isUsingOAuth(model: Model<Api>): boolean {
		const cred = this.authStorage.get(model.provider);
		return cred?.type === "oauth";
	}

	/**
	 * Register a provider dynamically (from extensions).
	 *
	 * If provider has models: replaces all existing models for this provider.
	 * If provider has only baseUrl/headers: overrides existing models' URLs.
	 * If provider has oauth: registers OAuth provider for /login support.
	 */
	registerProvider(providerName: string, config: ProviderConfigInput): void {
		this.registeredProviders.set(providerName, config);
		this.applyProviderConfig(providerName, config);
	}

	private applyProviderConfig(providerName: string, config: ProviderConfigInput): void {
		// Register OAuth provider if provided
		if (config.oauth) {
			// Ensure the OAuth provider ID matches the provider name
			const oauthProvider: OAuthProviderInterface = {
				...config.oauth,
				id: providerName,
			};
			registerOAuthProvider(oauthProvider);
		}

		if (config.streamSimple) {
			if (!config.api) {
				throw new Error(`Provider ${providerName}: "api" is required when registering streamSimple.`);
			}
			const streamSimple = config.streamSimple;
			registerApiProvider({
				api: config.api,
				stream: (model, context, options) => streamSimple(model, context, options as SimpleStreamOptions),
				streamSimple,
			});
		}

		// Store API key for auth resolution
		if (config.apiKey) {
			this.customProviderApiKeys.set(providerName, config.apiKey);
		}

		if (config.models && config.models.length > 0) {
			// Full replacement: remove existing models for this provider
			this.models = this.models.filter((m) => m.provider !== providerName);

			// Validate required fields
			if (!config.baseUrl) {
				throw new Error(`Provider ${providerName}: "baseUrl" is required when defining models.`);
			}
			if (!config.apiKey && !config.oauth) {
				throw new Error(`Provider ${providerName}: "apiKey" or "oauth" is required when defining models.`);
			}

			// Parse and add new models
			for (const modelDef of config.models) {
				const api = modelDef.api || config.api;
				if (!api) {
					throw new Error(`Provider ${providerName}, model ${modelDef.id}: no "api" specified.`);
				}

				// Merge headers
				const providerHeaders = resolveHeaders(config.headers);
				const modelHeaders = resolveHeaders(modelDef.headers);
				let headers = providerHeaders || modelHeaders ? { ...providerHeaders, ...modelHeaders } : undefined;

				// If authHeader is true, add Authorization header
				if (config.authHeader && config.apiKey) {
					const resolvedKey = resolveConfigValue(config.apiKey);
					if (resolvedKey) {
						headers = { ...headers, Authorization: `Bearer ${resolvedKey}` };
					}
				}

				this.models.push({
					id: modelDef.id,
					name: modelDef.name,
					api: api as Api,
					provider: providerName,
					baseUrl: config.baseUrl,
					reasoning: modelDef.reasoning,
					input: modelDef.input as ("text" | "image")[],
					cost: modelDef.cost,
					contextWindow: modelDef.contextWindow,
					maxTokens: modelDef.maxTokens,
					headers,
					agentLoopFramework: normalizeAgentLoopFramework(modelDef.agentLoopFramework),
					compat: modelDef.compat,
				} as Model<Api>);
			}

			// Apply OAuth modifyModels if credentials exist (e.g., to update baseUrl)
			if (config.oauth?.modifyModels) {
				const cred = this.authStorage.get(providerName);
				if (cred?.type === "oauth") {
					this.models = config.oauth.modifyModels(this.models, cred);
				}
			}
		} else if (config.baseUrl) {
			// Override-only: update baseUrl/headers for existing models
			const resolvedHeaders = resolveHeaders(config.headers);
			this.models = this.models.map((m) => {
				if (m.provider !== providerName) return m;
				return {
					...m,
					baseUrl: config.baseUrl ?? m.baseUrl,
					headers: resolvedHeaders ? { ...m.headers, ...resolvedHeaders } : m.headers,
				};
			});
		}
	}

	private static readonly OPENROUTER_JSON_BASE = "https://openrouter.ai/api/v1";
	private static readonly OPENROUTER_JSON_API = "openai-completions";

	/**
	 * Append an OpenRouter model to models.json by id (same string as on openrouter.ai, e.g. x-ai/grok-4.20).
	 * API key is not written; use /login openrouter or OPENROUTER_API_KEY.
	 */
	appendOpenRouterModel(modelId: string, options?: { name?: string }): void {
		const providerKey = "openrouter";
		const trimmed = modelId.trim();
		if (!trimmed) {
			throw new Error("OpenRouter model id cannot be empty");
		}
		const modelsPath = this.modelsJsonPath;
		if (!modelsPath) {
			throw new Error("models.json path is not configured");
		}

		type ProviderJson = {
			baseUrl?: string;
			api?: string;
			models?: Array<Record<string, unknown>>;
			[key: string]: unknown;
		};

		let data: { providers: Record<string, ProviderJson> };
		if (existsSync(modelsPath)) {
			const raw = readFileSync(modelsPath, "utf-8");
			data = JSON.parse(raw) as { providers: Record<string, ProviderJson> };
		} else {
			data = { providers: {} };
		}
		if (!data.providers || typeof data.providers !== "object") {
			data.providers = {};
		}

		const existing = data.providers[providerKey] ?? {};
		const prevModels = Array.isArray(existing.models) ? [...existing.models] : [];
		if (prevModels.some((m) => m && typeof m === "object" && (m as { id?: string }).id === trimmed)) {
			throw new Error(`OpenRouter model "${trimmed}" already exists in models.json`);
		}

		const displayName = options?.name?.trim() || trimmed;
		prevModels.push({
			id: trimmed,
			name: displayName,
			input: ["text"],
			contextWindow: 256000,
			maxTokens: 8192,
		});

		data.providers[providerKey] = {
			...existing,
			baseUrl: existing.baseUrl ?? ModelRegistry.OPENROUTER_JSON_BASE,
			api: (existing.api as string | undefined) ?? ModelRegistry.OPENROUTER_JSON_API,
			models: prevModels,
		};

		mkdirSync(dirname(modelsPath), { recursive: true });
		writeFileSync(modelsPath, JSON.stringify(data, null, 2), "utf-8");
		this.refresh();
	}
}

/**
 * Input type for registerProvider API.
 */
export interface ProviderConfigInput {
	baseUrl?: string;
	apiKey?: string;
	api?: Api;
	streamSimple?: (model: Model<Api>, context: Context, options?: SimpleStreamOptions) => AssistantMessageEventStream;
	headers?: Record<string, string>;
	authHeader?: boolean;
	/** OAuth provider for /login support */
	oauth?: Omit<OAuthProviderInterface, "id">;
	models?: Array<{
		id: string;
		name: string;
		api?: Api;
		reasoning: boolean;
		input: ("text" | "image")[];
		cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
		contextWindow: number;
		maxTokens: number;
		headers?: Record<string, string>;
		agentLoopFramework?: AgentLoopFrameworkInput;
		compat?: Model<Api>["compat"];
	}>;
}
