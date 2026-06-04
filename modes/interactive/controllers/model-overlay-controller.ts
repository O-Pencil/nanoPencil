/**
 * [WHO]: Provides ModelOverlayController + ModelOverlayContext (ModelSessionPort/ModelCatalogPort/
 *        ModelSettingsPort/ProviderConfigPort/ModelOverlaySurface/ModelOverlayFooter) — interactive model selection
 * [FROM]: Depends on @pencil-agent/ai (Model), agent-core (ThinkingLevel), core/runtime/agent-session
 *         (CycleModelError), @pencil-agent/tui (Component/TUI), core/model-resolver (resolveModelScope),
 *         components (Model/Provider/ScopedModels selectors)
 * [TO]: Consumed by modes/interactive/interactive-mode.ts (held as `this.modelOverlay`; /model, cycle keybindings,
 *       /scoped-models delegate here)
 * [HERE]: modes/interactive/controllers/model-overlay-controller.ts — P5 model-overlay slice (UI08, hybrid)
 *
 * Interactive TUI orchestration of model selection (UI08). It DELEGATES the reusable model capability
 * (set/cycle model, thinking level, scoped models) to AgentSession via ModelSessionPort — it does NOT
 * own model switching rules, thinking clamping/persistence, API-key validation, or provider credentials.
 * Provider configuration is consumed through ProviderConfigPort (points to mount during transition,
 * repointed to auth/provider-config later). The context is intentionally the widest P5 controller, but
 * grouped by capability and serving one workflow; it must not keep growing. No InteractiveMode reference.
 */

import type { Model } from "@pencil-agent/ai";
import type { ThinkingLevel } from "@pencil-agent/agent-core";
import { CycleModelError } from "../../../core/runtime/agent-session.js";
import type { Component, TUI } from "@pencil-agent/tui";
import type { ModelRegistry } from "../../../core/model-registry.js";
import { resolveModelScope } from "../../../core/model-resolver.js";
import { ModelSelectorComponent } from "../components/model-selector.js";
import { ProviderSelectorComponent } from "../components/provider-selector.js";
import { ScopedModelsSelectorComponent } from "../components/scoped-models-selector.js";

type AnyModel = Model<any>;
type ScopedModel = { model: AnyModel; thinkingLevel: ThinkingLevel };

/** Reusable model capability — delegated to AgentSession; model-overlay never reimplements it. */
export interface ModelSessionPort {
  getModel(): AnyModel | undefined;
  setModel(model: AnyModel): Promise<void>;
  cycleModel(
    direction: "forward" | "backward",
  ): Promise<{ model: AnyModel; thinkingLevel: ThinkingLevel } | undefined>;
  getThinkingLevel(): string;
  setThinkingLevel(level: ThinkingLevel): void;
  cycleThinkingLevel(): string | undefined;
  getAvailableThinkingLevels(): string[];
  getScopedModels(): ReadonlyArray<ScopedModel>;
  setScopedModels(models: ScopedModel[]): void;
}

/** Registry/catalog access needed by interactive selection. */
export interface ModelCatalogPort {
  refresh(): void;
  getAvailable(): AnyModel[];
  getAll(): AnyModel[];
  find(provider: string, id: string): AnyModel | undefined;
  appendOpenRouterModel(id: string, opts: { name?: string }): void;
  /** Credential type for a provider (to suggest /login on OAuth cycle failures). */
  getCredentialType(provider: string): string | undefined;
  /**
   * The concrete ModelRegistry object — required by ModelSelectorComponent and resolveModelScope,
   * which consume the registry directly. ModelRegistry is the catalog domain object (not AgentSession
   * or InteractiveMode), so exposing it is allowed under UI-G2.
   */
  getRegistry(): ModelRegistry;
}

/** Enabled/default model settings only — not the whole settings surface. */
export interface ModelSettingsPort {
  getEnabledModels(): string[] | undefined;
  setEnabledModels(patterns: string[] | undefined): void;
  setDefaultModelAndProvider(provider: string, id: string): void;
}

/** Provider configuration precondition (points to mount in transition; repointed to auth/provider-config). */
export interface ProviderConfigPort {
  ensureProviderConfiguredForSelection(model: AnyModel): Promise<boolean>;
  handleProviderSelectionFromSelector(
    provider: string,
    done: () => void,
  ): Promise<void>;
}

/** Selector/status/error/prompt/render TUI surface. */
export interface ModelOverlaySurface {
  showSelector(
    create: (done: () => void) => { component: Component; focus: Component },
  ): void;
  showStatus(message: string): void;
  showError(message: string): void;
  promptInput(
    title: string,
    placeholder?: string,
    opts?: { initialValue?: string },
  ): Promise<string | undefined>;
  getUi(): TUI;
}

/** Footer/editor-border refresh after selection. */
export interface ModelOverlayFooter {
  invalidate(): void;
  setAvailableProviderCount(count: number): void;
  updateEditorBorderColor(): void;
}

export interface ModelOverlayContext {
  modelSession: ModelSessionPort;
  modelCatalog: ModelCatalogPort;
  modelSettings: ModelSettingsPort;
  providerConfig: ProviderConfigPort;
  surface: ModelOverlaySurface;
  footer: ModelOverlayFooter;
  /** Interactive-only side effect after a model is applied (the daxnuts easter egg). */
  playDaxnuts(): void;
}

export class ModelOverlayController {
  constructor(private readonly ctx: ModelOverlayContext) {}

  // ----- thinking -----

  cycleThinkingLevel(): void {
    const newLevel = this.ctx.modelSession.cycleThinkingLevel();
    if (newLevel === undefined) {
      this.ctx.surface.showStatus("Current model does not support thinking");
    } else {
      this.ctx.footer.invalidate();
      this.ctx.footer.updateEditorBorderColor();
      this.ctx.surface.showStatus(`Thinking level: ${newLevel}`);
    }
  }

  handleThinkingCommand(text: string): void {
    const arg = text.slice("/thinking".length).trim().toLowerCase();
    const levels = this.ctx.modelSession.getAvailableThinkingLevels();

    if (!arg) {
      this.ctx.surface.showStatus(
        `Thinking level: ${this.ctx.modelSession.getThinkingLevel()} (available: ${levels.join(", ")})`,
      );
      return;
    }

    if (!levels.includes(arg)) {
      this.ctx.surface.showStatus(
        `Unknown thinking level: ${arg} (available: ${levels.join(", ")})`,
      );
      return;
    }

    this.ctx.modelSession.setThinkingLevel(arg as ThinkingLevel);
    this.ctx.footer.invalidate();
    this.ctx.footer.updateEditorBorderColor();
    this.ctx.surface.showStatus(
      `Thinking level: ${this.ctx.modelSession.getThinkingLevel()}`,
    );
  }

  // ----- model cycle -----

  async cycleModel(direction: "forward" | "backward"): Promise<void> {
    try {
      const result = await this.ctx.modelSession.cycleModel(direction);
      if (result === undefined) {
        const msg =
          this.ctx.modelSession.getScopedModels().length > 0
            ? "Only one model in scope"
            : "Only one model available";
        this.ctx.surface.showStatus(msg);
      } else {
        this.ctx.footer.invalidate();
        this.ctx.footer.updateEditorBorderColor();
        const thinkingStr =
          result.model.reasoning && result.thinkingLevel !== "off"
            ? ` (thinking: ${result.thinkingLevel})`
            : "";
        this.ctx.surface.showStatus(
          `Switched to ${result.model.name || result.model.id}${thinkingStr}`,
        );
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (error instanceof CycleModelError && error.provider) {
        const credType = this.ctx.modelCatalog.getCredentialType(error.provider);
        if (credType === "oauth" || error.code === "oauth_expired") {
          this.ctx.surface.showError(
            `${errorMsg}\nUse /login ${error.provider} to re-authenticate.`,
          );
        } else {
          this.ctx.surface.showError(errorMsg);
        }
      } else {
        this.ctx.surface.showError(errorMsg);
      }
    }
  }

  // ----- /model command + selectors -----

  async handleModelCommand(searchTerm?: string): Promise<void> {
    if (!searchTerm) {
      this.showProviderThenModelSelector();
      return;
    }

    const model = await this.findExactModelMatch(searchTerm);
    if (model) {
      await this.selectModelWithProviderEnsure(model);
      return;
    }

    this.showModelSelector(searchTerm);
  }

  showModelSelector(initialSearchInput?: string, filterByProvider?: string): void {
    this.ctx.surface.showSelector((done) => {
      const selector = new ModelSelectorComponent(
        this.ctx.surface.getUi(),
        this.ctx.modelSession.getModel(),
        this.ctx.modelCatalog.getRegistry(),
        this.ctx.modelSession.getScopedModels(),
        async (model) => {
          done();
          await this.selectModelWithProviderEnsure(model);
        },
        () => {
          done();
          this.ctx.surface.getUi().requestRender();
        },
        initialSearchInput,
        filterByProvider,
        () => {
          void (async () => {
            done();
            const modelId = await this.ctx.surface.promptInput(
              "Add OpenRouter model",
              "Model id (e.g. x-ai/grok-4.20)",
            );
            if (!modelId?.trim()) {
              this.showModelSelector(initialSearchInput, filterByProvider);
              return;
            }
            const nameInput = await this.ctx.surface.promptInput(
              "Display name (optional)",
              "Leave empty to use model id",
              { initialValue: modelId.trim() },
            );
            if (nameInput === undefined) {
              this.showModelSelector(initialSearchInput, filterByProvider);
              return;
            }
            try {
              this.ctx.modelCatalog.appendOpenRouterModel(modelId.trim(), {
                name: nameInput.trim() || undefined,
              });
              this.ctx.surface.showStatus(`Added OpenRouter model ${modelId.trim()}`);
            } catch (error) {
              this.ctx.surface.showError(
                error instanceof Error ? error.message : String(error),
              );
            }
            this.showModelSelector(initialSearchInput, filterByProvider);
          })();
        },
      );
      return { component: selector, focus: selector };
    });
  }

  async showProviderThenModelSelector(): Promise<void> {
    this.ctx.modelCatalog.refresh();
    const allModels = this.ctx.modelCatalog.getAll();
    const providers = [...new Set(allModels.map((m) => m.provider))].sort();
    if (providers.length === 0) {
      this.ctx.surface.showStatus("No providers available");
      return;
    }
    if (providers.length === 1) {
      this.showModelSelector(undefined, providers[0]);
      return;
    }
    this.ctx.surface.showSelector((done) => {
      const selector = new ProviderSelectorComponent(
        providers,
        this.ctx.modelSession.getModel()?.provider,
        (provider) => {
          void this.ctx.providerConfig.handleProviderSelectionFromSelector(
            provider,
            done,
          );
        },
        () => {
          done();
          this.ctx.surface.getUi().requestRender();
        },
      );
      return { component: selector, focus: selector };
    });
  }

  async showModelsSelector(): Promise<void> {
    this.ctx.modelCatalog.refresh();
    const allModels = this.ctx.modelCatalog.getAvailable();

    if (allModels.length === 0) {
      this.ctx.surface.showStatus("No models available");
      return;
    }

    const sessionScopedModels = this.ctx.modelSession.getScopedModels();
    const hasSessionScope = sessionScopedModels.length > 0;

    const enabledModelIds = new Set<string>();
    let hasFilter = false;

    if (hasSessionScope) {
      for (const sm of sessionScopedModels) {
        enabledModelIds.add(`${sm.model.provider}/${sm.model.id}`);
      }
      hasFilter = true;
    } else {
      const patterns = this.ctx.modelSettings.getEnabledModels();
      if (patterns !== undefined && patterns.length > 0) {
        hasFilter = true;
        const scopedModels = await resolveModelScope(
          patterns,
          this.ctx.modelCatalog.getRegistry(),
        );
        for (const sm of scopedModels) {
          enabledModelIds.add(`${sm.model.provider}/${sm.model.id}`);
        }
      }
    }

    const currentEnabledIds = new Set(enabledModelIds);
    let currentHasFilter = hasFilter;

    const updateSessionModels = async (enabledIds: Set<string>) => {
      if (enabledIds.size > 0 && enabledIds.size < allModels.length) {
        const currentThinkingLevel = this.ctx.modelSession.getThinkingLevel();
        const newScopedModels = await resolveModelScope(
          Array.from(enabledIds),
          this.ctx.modelCatalog.getRegistry(),
        );
        this.ctx.modelSession.setScopedModels(
          newScopedModels.map((sm) => ({
            model: sm.model,
            thinkingLevel: (sm.thinkingLevel ?? currentThinkingLevel) as ThinkingLevel,
          })),
        );
      } else {
        this.ctx.modelSession.setScopedModels([]);
      }
      await this.updateAvailableProviderCount();
      this.ctx.surface.getUi().requestRender();
    };

    this.ctx.surface.showSelector((done) => {
      const selector = new ScopedModelsSelectorComponent(
        {
          allModels,
          enabledModelIds: currentEnabledIds,
          hasEnabledModelsFilter: currentHasFilter,
        },
        {
          onModelToggle: async (modelId, enabled) => {
            if (enabled) {
              currentEnabledIds.add(modelId);
            } else {
              currentEnabledIds.delete(modelId);
            }
            currentHasFilter = true;
            await updateSessionModels(currentEnabledIds);
          },
          onEnableAll: async (allModelIds) => {
            currentEnabledIds.clear();
            for (const id of allModelIds) {
              currentEnabledIds.add(id);
            }
            currentHasFilter = false;
            await updateSessionModels(currentEnabledIds);
          },
          onClearAll: async () => {
            currentEnabledIds.clear();
            currentHasFilter = true;
            await updateSessionModels(currentEnabledIds);
          },
          onToggleProvider: async (_provider, modelIds, enabled) => {
            for (const id of modelIds) {
              if (enabled) {
                currentEnabledIds.add(id);
              } else {
                currentEnabledIds.delete(id);
              }
            }
            currentHasFilter = true;
            await updateSessionModels(currentEnabledIds);
          },
          onPersist: (enabledIds) => {
            const newPatterns =
              enabledIds.length === allModels.length ? undefined : enabledIds;
            this.ctx.modelSettings.setEnabledModels(newPatterns);
            this.ctx.surface.showStatus("Model selection saved to settings");
          },
          onCancel: () => {
            done();
            this.ctx.surface.getUi().requestRender();
          },
        },
      );
      return { component: selector, focus: selector };
    });
  }

  /** Update the footer's available provider count from current model candidates. */
  async updateAvailableProviderCount(): Promise<void> {
    const models = await this.getModelCandidates();
    const uniqueProviders = new Set(models.map((m) => m.provider));
    this.ctx.footer.setAvailableProviderCount(uniqueProviders.size);
  }

  // ----- private -----

  private async findExactModelMatch(searchTerm: string): Promise<AnyModel | undefined> {
    const term = searchTerm.trim();
    if (!term) return undefined;

    let targetProvider: string | undefined;
    let targetModelId = "";

    if (term.includes("/")) {
      const parts = term.split("/", 2);
      targetProvider = parts[0]?.trim().toLowerCase();
      targetModelId = parts[1]?.trim().toLowerCase() ?? "";
    } else {
      targetModelId = term.toLowerCase();
    }

    if (!targetModelId) return undefined;

    const models = await this.getModelCandidates();
    const exactMatches = models.filter((item) => {
      const idMatch = item.id.toLowerCase() === targetModelId;
      const providerMatch =
        !targetProvider || item.provider.toLowerCase() === targetProvider;
      return idMatch && providerMatch;
    });

    return exactMatches.length === 1 ? exactMatches[0] : undefined;
  }

  private async getModelCandidates(): Promise<AnyModel[]> {
    const scoped = this.ctx.modelSession.getScopedModels();
    if (scoped.length > 0) {
      return scoped.map((s) => s.model);
    }

    this.ctx.modelCatalog.refresh();
    try {
      // Use getAll() so all providers appear in /model selector; user can configure key when selecting.
      return this.ctx.modelCatalog.getAll();
    } catch {
      return [];
    }
  }

  /**
   * Apply a chosen model: persist as default, refresh footer/border, status, daxnuts hook.
   * Public because the provider-config path (mount, future provider-config-controller) applies a
   * model after configuring a custom protocol provider. Selection mutation still goes through the
   * modelSession port (AgentSession), keeping UI08's runtime-owned capability boundary.
   */
  async applySelectedModel(model: AnyModel): Promise<void> {
    await this.ctx.modelSession.setModel(model);
    this.ctx.modelSettings.setDefaultModelAndProvider(model.provider, model.id);
    this.ctx.footer.invalidate();
    this.ctx.footer.updateEditorBorderColor();
    this.ctx.surface.showStatus(`Model: ${model.id}`);
    this.checkDaxnutsEasterEgg(model);
  }

  private async selectModelWithProviderEnsure(model: AnyModel): Promise<void> {
    try {
      const configured =
        await this.ctx.providerConfig.ensureProviderConfiguredForSelection(model);
      if (!configured) {
        this.ctx.surface.showStatus("Configuration cancelled");
        return;
      }

      this.ctx.modelCatalog.refresh();
      const refreshedModel =
        this.ctx.modelCatalog.find(model.provider, model.id) ?? model;
      await this.applySelectedModel(refreshedModel);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (error instanceof CycleModelError && error.provider) {
        this.ctx.surface.showError(
          `${errorMsg}\nUse /login ${error.provider} to re-authenticate.`,
        );
      } else {
        this.ctx.surface.showError(errorMsg);
      }
    }
  }

  private checkDaxnutsEasterEgg(model: { provider: string; id: string }): void {
    if (
      model.provider === "opencode" &&
      model.id.toLowerCase().includes("kimi-k2.5")
    ) {
      this.ctx.playDaxnuts();
    }
  }
}
