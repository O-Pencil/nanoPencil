/**
 * [WHO]: Model management exports
 * [FROM]: Depends on model/switcher, model/discovery, model/discovery-cache, model/known-models
 * [TO]: Consumed by core/runtime/agent-session.ts
 * [HERE]: core/model/index.ts - model management barrel exports
 */
export { ModelSwitcher, type ModelCycleResult } from "./switcher.js";
export {
	discoverModels,
	discoverOpenAIModels,
	getDiscoveryProtocol,
	type DiscoveredModel,
	type DiscoveryResult,
	type DiscoveryProtocol,
	DEFAULT_DISCOVERY_TTL_SECONDS,
	DEFAULT_DISCOVERY_TIMEOUT_MS,
} from "./discovery.js";
export { DiscoveryCache } from "./discovery-cache.js";
export {
	KNOWN_MODEL_METADATA,
	lookupKnownModel,
	UNKNOWN_MODEL_DEFAULTS,
	type KnownModelMetadata,
} from "./known-models.js";
