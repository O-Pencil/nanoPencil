/**
 * [WHO]: Provides ScopedModel, ModelSelectPayload, ModelControllerContext runtime controller contracts
 * [FROM]: Depends on agent-core and ai public types plus auth-storage credential type
 * [TO]: Consumed by core/runtime/model-controller.ts and implemented by AgentSession composition wiring
 * [HERE]: core/runtime/session-context.ts - S2 seam: narrow capability contracts for runtime controllers
 *
 * Controllers depend on capability functions rather than AgentSession, Agent, SessionManager,
 * SettingsManager, ModelRegistry, or ExtensionRunner objects. This keeps extraction from turning
 * into a service locator while preserving one-directional imports.
 */

import type { AgentLoopFrameworkInput, AgentLoopPolicyOptions, ThinkingLevel } from "@pencil-agent/agent-core";
import type { Model } from "@pencil-agent/ai";
import type { AuthCredential } from "../platform/config/auth-storage.js";

/** Scoped model entry (from --models): a model plus its preferred thinking level. */
export interface ScopedModel {
  model: Model<any>;
  thinkingLevel: ThinkingLevel;
}

export interface ModelSelectPayload {
  model: Model<any>;
  previousModel?: Model<any>;
  source: "set" | "cycle" | "restore";
}

/** Narrow capability surface for ModelController. */
export interface ModelControllerContext {
  getModel(): Model<any> | undefined;
  getThinkingLevel(): ThinkingLevel;
  getScopedModels(): ReadonlyArray<ScopedModel>;
  setAgentModel(model: Model<any>): void;
  setAgentThinkingLevel(level: ThinkingLevel): void;
  setAgentLoopFramework(framework: AgentLoopFrameworkInput | undefined): void;
  setLoopPolicy(options: Partial<AgentLoopPolicyOptions>): void;
  getApiKey(model: Model<any>): Promise<string | undefined>;
  getApiKeyForProvider(provider: string): Promise<string | undefined>;
  getAvailableModels(): Promise<Model<any>[]>;
  getAuthCredential(provider: string): AuthCredential | undefined;
  appendModelChange(provider: string, modelId: string): void;
  appendThinkingLevelChange(level: ThinkingLevel): void;
  setDefaultModelAndProvider(provider: string, modelId: string): void;
  setDefaultThinkingLevel(level: ThinkingLevel): void;
  emitModelSelect(payload: ModelSelectPayload): Promise<void>;
}
