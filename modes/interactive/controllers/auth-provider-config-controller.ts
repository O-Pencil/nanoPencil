/**
 * [WHO]: Provides AuthProviderConfigController + AuthProviderConfigContext — interactive auth/provider configuration
 * [FROM]: Depends on @pencil-agent/ai OAuth helpers, core/model/custom-providers, config paths, TUI components
 * [TO]: Consumed by modes/interactive/interactive-mode.ts and model-overlay providerConfig port
 * [HERE]: modes/interactive/controllers/auth-provider-config-controller.ts — P5 auth/provider-config slice
 *
 * Owns interactive credential/config prompts and OAuth UI. It does not own model selection overlay;
 * model-overlay consumes this controller through ProviderConfigPort and receives model application
 * callbacks through a narrow bridge.
 */

import { getOAuthProviders, type Model, type OAuthProvider } from "@pencil-agent/ai";
import type { Component, Container, TUI } from "@pencil-agent/tui";
import { getAuthPath, getModelsPath } from "../../../config.js";
import {
  type CustomProtocolProviderId,
  getCustomProtocolProviderBaseUrl,
  getCustomProtocolProviderDefinition,
  getCustomProtocolProviderModelName,
  isCustomProtocolProvider,
  saveCustomProtocolProviderApiKey,
  saveCustomProtocolProviderConfig,
} from "../../../core/model/custom-providers.js";
import type { ModelRegistry } from "../../../core/model-registry.js";
import {
  NANOPENCIL_ALI_TOKEN_PLAN_ANTHROPIC_PROVIDER,
  NANOPENCIL_ALI_TOKEN_PLAN_OPENAI_PROVIDER,
} from "../../../nanopencil-defaults.js";
import { LoginDialogComponent } from "../components/login-dialog.js";
import {
  OAuthSelectorComponent,
  type ProviderSelectorItem,
} from "../components/oauth-selector.js";
import { ProviderSelectorComponent } from "../components/provider-selector.js";

type AnyModel = Model<any>;

export interface AuthProviderConfigSurface {
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
  requestRender(): void;
  getUi(): TUI;
  getEditorContainer(): Container;
  getEditor(): Component;
  remountEditorShell(): void;
}

export interface AuthProviderModelBridge {
  getCurrentModel(): AnyModel | undefined;
  setCurrentModel(model: AnyModel): Promise<void>;
  showModelSelector(initialSearchInput?: string, filterByProvider?: string): void;
  applySelectedModel(model: AnyModel): Promise<void>;
  updateAvailableProviderCount(): Promise<void>;
}

export interface AuthProviderConfigContext {
  modelRegistry: ModelRegistry;
  surface: AuthProviderConfigSurface;
  modelBridge: AuthProviderModelBridge;
}

export class AuthProviderConfigController {
  constructor(private readonly ctx: AuthProviderConfigContext) {}

  async handleApiKeyCommand(): Promise<void> {
    await this.handleProviderCredentialsCommand();
  }

  async handleLoginCommand(text: string): Promise<void> {
    const rawProvider = text.startsWith("/login ") ? text.slice(7).trim() : "";
    if (!rawProvider) {
      this.showOAuthSelector("login");
      return;
    }

    const providerId = this.resolveProviderId(rawProvider);
    if (!providerId) {
      this.ctx.surface.showError(`Unknown provider: ${rawProvider}`);
      return;
    }

    const oauthProvider = getOAuthProviders().find((provider) => provider.id === providerId);
    if (oauthProvider) {
      await this.showLoginDialog(oauthProvider.id);
      return;
    }

    await this.promptForProviderApiKey(providerId, {
      title: `Set API key for ${providerId}`,
    });
  }

  async ensureProviderConfiguredForSelection(model: AnyModel): Promise<boolean> {
    if (isCustomProtocolProvider(model.provider)) {
      return this.configureCustomProtocolProvider(model.provider);
    }

    const hasKey = await this.ctx.modelRegistry.getApiKey(model);
    if (!hasKey && !this.ctx.modelRegistry.isUsingOAuth(model)) {
      return this.promptForProviderApiKey(model.provider, {
        title: `API key for ${model.provider}`,
      });
    }

    return true;
  }

  async handleProviderSelectionFromSelector(
    provider: string,
    done: () => void,
  ): Promise<void> {
    done();
    this.ctx.surface.requestRender();

    if (!isCustomProtocolProvider(provider)) {
      this.ctx.modelBridge.showModelSelector(undefined, provider);
      return;
    }

    try {
      const configured = await this.configureCustomProtocolProvider(provider, {
        force: true,
      });
      if (!configured) {
        this.ctx.surface.showStatus("Configuration cancelled");
        return;
      }

      await this.selectConfiguredCustomProvider(provider);
    } catch (error) {
      this.ctx.surface.showError(error instanceof Error ? error.message : String(error));
    }
  }

  async showOAuthSelector(mode: "login" | "logout"): Promise<void> {
    const providers = this.getLoginSelectorProviders(mode);
    if (providers.length === 0) {
      this.ctx.surface.showStatus(
        mode === "login"
          ? "No providers available."
          : "No providers logged in. Use /login first.",
      );
      return;
    }

    this.ctx.surface.showSelector((done) => {
      const selector = new OAuthSelectorComponent(
        mode,
        providers,
        async (providerId: string) => {
          done();

          if (mode === "login") {
            const oauthProvider = getOAuthProviders().find(
              (p) => p.id === providerId,
            );
            if (oauthProvider) {
              await this.showLoginDialog(providerId);
            } else {
              await this.promptForProviderApiKey(providerId, {
                title: `Set API key for ${providerId}`,
              });
            }
          } else {
            const providerInfo = getOAuthProviders().find(
              (p) => p.id === providerId,
            );
            const providerName = providerInfo?.name || providerId;

            try {
              this.ctx.modelRegistry.authStorage.logout(providerId);
              this.ctx.modelRegistry.refresh();
              await this.ctx.modelBridge.updateAvailableProviderCount();
              this.ctx.surface.showStatus(`Logged out of ${providerName}`);
            } catch (error: unknown) {
              this.ctx.surface.showError(
                `Logout failed: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }
        },
        () => {
          done();
          this.ctx.surface.requestRender();
        },
        {
          title:
            mode === "login"
              ? "Select provider to login or configure:"
              : "Select provider to logout:",
        },
      );
      return { component: selector, focus: selector };
    });
  }

  getLoginSelectorProviders(mode: "login" | "logout"): ProviderSelectorItem[] {
    const oauthProviders: ProviderSelectorItem[] = getOAuthProviders().map(
      (provider) => ({
        id: provider.id,
        name: provider.name,
        authType: "oauth",
        loggedIn:
          this.ctx.modelRegistry.authStorage.get(provider.id)?.type === "oauth",
      }),
    );

    if (mode === "logout") {
      return oauthProviders.filter((provider) => provider.loggedIn);
    }

    const items = [...oauthProviders];
    const providerIds = new Set(items.map((provider) => provider.id));
    const apiKeyProviders = [{ id: "openrouter", name: "OpenRouter" }];

    for (const provider of apiKeyProviders) {
      if (providerIds.has(provider.id)) continue;
      items.push({
        id: provider.id,
        name: provider.name,
        authType: "api_key",
        loggedIn: !!this.getStoredApiKey(provider.id),
      });
    }

    return items;
  }

  private getStoredApiKey(provider: string): string | undefined {
    const credential = this.ctx.modelRegistry.authStorage.get(provider);
    return credential?.type === "api_key" ? credential.key : undefined;
  }

  private resolveProviderId(input: string): string | undefined {
    const normalized = input.trim().toLowerCase();
    if (!normalized) return undefined;

    const providerMap = new Map<string, string>();
    for (const model of this.ctx.modelRegistry.getAll()) {
      providerMap.set(model.provider.toLowerCase(), model.provider);
    }
    for (const provider of getOAuthProviders()) {
      providerMap.set(provider.id.toLowerCase(), provider.id);
    }

    return providerMap.get(normalized);
  }

  private async promptForProviderApiKey(
    provider: string,
    options: { title?: string } = {},
  ): Promise<boolean> {
    const currentApiKey = this.getStoredApiKey(provider);
    const title = options.title ?? `Update API key for ${provider}`;
    const apiKey = await this.ctx.surface.promptInput(title, "API key", {
      initialValue: currentApiKey,
    });
    if (apiKey === undefined) {
      this.ctx.surface.showStatus("Configuration cancelled");
      return false;
    }

    const trimmedApiKey = apiKey.trim();
    if (!trimmedApiKey) {
      this.ctx.surface.showStatus("Configuration cancelled");
      return false;
    }

    this.ctx.modelRegistry.authStorage.set(provider, {
      type: "api_key",
      key: trimmedApiKey,
    });
    if (provider === NANOPENCIL_ALI_TOKEN_PLAN_OPENAI_PROVIDER) {
      this.ctx.modelRegistry.authStorage.set(
        NANOPENCIL_ALI_TOKEN_PLAN_ANTHROPIC_PROVIDER,
        {
          type: "api_key",
          key: trimmedApiKey,
        },
      );
    } else if (provider === NANOPENCIL_ALI_TOKEN_PLAN_ANTHROPIC_PROVIDER) {
      this.ctx.modelRegistry.authStorage.set(
        NANOPENCIL_ALI_TOKEN_PLAN_OPENAI_PROVIDER,
        {
          type: "api_key",
          key: trimmedApiKey,
        },
      );
    }
    this.ctx.modelRegistry.refresh();
    this.ctx.surface.showStatus(`Updated API key for ${provider}`);
    return true;
  }

  private async handleProviderCredentialsCommand(): Promise<void> {
    const currentModel = this.ctx.modelBridge.getCurrentModel();

    if (!currentModel) {
      this.ctx.modelRegistry.refresh();
      const allModels = this.ctx.modelRegistry.getAll();
      const providers = [...new Set(allModels.map((m) => m.provider))].sort();
      if (providers.length === 0) {
        this.ctx.surface.showStatus("No providers available");
        return;
      }
      this.ctx.surface.showSelector((done) => {
        const selector = new ProviderSelectorComponent(
          providers,
          undefined,
          (provider) => {
            done();
            void (async () => {
              await this.promptForProviderApiKey(provider, {
                title: `Set API key for ${provider}`,
              });
              this.ctx.modelRegistry.refresh();
              this.ctx.modelBridge.showModelSelector(undefined, provider);
            })();
          },
          () => {
            done();
            this.ctx.surface.requestRender();
          },
        );
        return { component: selector, focus: selector };
      });
      return;
    }

    const provider = currentModel.provider;

    try {
      if (isCustomProtocolProvider(provider)) {
        const updated = await this.configureCustomProtocolProvider(provider, {
          force: true,
        });
        if (!updated) {
          this.ctx.surface.showStatus("Configuration cancelled");
        }
        return;
      }

      await this.promptForProviderApiKey(provider);
    } catch (error) {
      this.ctx.surface.showError(error instanceof Error ? error.message : String(error));
    }
  }

  private async configureCustomProtocolProvider(
    provider: CustomProtocolProviderId,
    options: { force?: boolean } = {},
  ): Promise<boolean> {
    const definition = getCustomProtocolProviderDefinition(provider);
    const modelsPath = getModelsPath();
    const authStorage = this.ctx.modelRegistry.authStorage;
    const currentBaseUrl =
      getCustomProtocolProviderBaseUrl(modelsPath, provider) ??
      definition.defaultBaseUrl;
    const currentModelName =
      getCustomProtocolProviderModelName(modelsPath, provider) ??
      "custom-model";
    const currentApiKey = this.getStoredApiKey(provider) ?? "";
    const hasExistingApiKey = authStorage.has(provider);

    if (
      !options.force &&
      hasExistingApiKey &&
      currentBaseUrl.trim() &&
      currentModelName.trim()
    ) {
      return true;
    }

    const baseUrl = await this.ctx.surface.promptInput(
      `${definition.label} base URL`,
      definition.defaultBaseUrl,
      { initialValue: currentBaseUrl },
    );
    if (baseUrl === undefined) {
      return false;
    }

    const trimmedBaseUrl = baseUrl.trim();
    if (!trimmedBaseUrl) {
      this.ctx.surface.showError("Base URL cannot be empty.");
      return false;
    }

    const apiKeyInput = await this.ctx.surface.promptInput(
      `${definition.label} API key`,
      hasExistingApiKey && options.force
        ? "Leave empty to keep the current API key"
        : "API key",
      { initialValue: currentApiKey },
    );
    if (apiKeyInput === undefined) {
      return false;
    }

    const trimmedApiKey = apiKeyInput.trim();
    if (!trimmedApiKey && !hasExistingApiKey) {
      this.ctx.surface.showError("API key cannot be empty.");
      return false;
    }

    const modelNameInput = await this.ctx.surface.promptInput(
      `${definition.label} model name`,
      "Model name",
      { initialValue: currentModelName },
    );
    if (modelNameInput === undefined) {
      return false;
    }

    const trimmedModelName = modelNameInput.trim();
    if (!trimmedModelName) {
      this.ctx.surface.showError("Model name cannot be empty.");
      return false;
    }

    saveCustomProtocolProviderConfig(modelsPath, provider, {
      baseUrl: trimmedBaseUrl,
      modelName: trimmedModelName,
    });
    if (trimmedApiKey) {
      saveCustomProtocolProviderApiKey(authStorage, provider, trimmedApiKey);
    }

    this.ctx.modelRegistry.refresh();
    await this.refreshCurrentModelForProvider(provider, trimmedModelName);
    this.ctx.surface.showStatus(`Saved ${definition.label} configuration`);
    return true;
  }

  private async refreshCurrentModelForProvider(
    provider: string,
    preferredModelId?: string,
  ): Promise<void> {
    const currentModel = this.ctx.modelBridge.getCurrentModel();
    if (!currentModel || currentModel.provider !== provider) {
      return;
    }

    const updatedModel =
      (preferredModelId
        ? this.ctx.modelRegistry.find(currentModel.provider, preferredModelId)
        : undefined) ??
      this.ctx.modelRegistry.find(currentModel.provider, currentModel.id);
    if (!updatedModel) {
      return;
    }

    await this.ctx.modelBridge.setCurrentModel(updatedModel);
  }

  private async selectConfiguredCustomProvider(
    provider: CustomProtocolProviderId,
  ): Promise<void> {
    this.ctx.modelRegistry.refresh();
    const modelName = getCustomProtocolProviderModelName(getModelsPath(), provider);
    if (!modelName) {
      this.ctx.surface.showError(`No model configured for ${provider}`);
      return;
    }

    const model = this.ctx.modelRegistry.find(provider, modelName);
    if (!model) {
      this.ctx.surface.showError(`Configured model not found for ${provider}`);
      return;
    }

    await this.ctx.modelBridge.applySelectedModel(model);
  }

  private async showLoginDialog(providerId: string): Promise<void> {
    const providerInfo = getOAuthProviders().find((p) => p.id === providerId);
    const providerName = providerInfo?.name || providerId;
    const usesCallbackServer = providerInfo?.usesCallbackServer ?? false;

    const dialog = new LoginDialogComponent(
      this.ctx.surface.getUi(),
      providerId,
      (_success, _message) => {
        // Completion handled below.
      },
    );

    const editorContainer = this.ctx.surface.getEditorContainer();
    editorContainer.clear();
    editorContainer.addChild(dialog);
    this.ctx.surface.getUi().setFocus(dialog);
    this.ctx.surface.requestRender();

    let manualCodeResolve: ((code: string) => void) | undefined;
    let manualCodeReject: ((err: Error) => void) | undefined;
    const manualCodePromise = new Promise<string>((resolve, reject) => {
      manualCodeResolve = resolve;
      manualCodeReject = reject;
    });

    const restoreEditor = () => {
      this.ctx.surface.remountEditorShell();
      this.ctx.surface.getUi().setFocus(this.ctx.surface.getEditor());
      this.ctx.surface.requestRender();
    };

    try {
      await this.ctx.modelRegistry.authStorage.login(
        providerId as OAuthProvider,
        {
          onAuth: (info: { url: string; instructions?: string }) => {
            dialog.showAuth(info.url, info.instructions);

            if (usesCallbackServer) {
              dialog
                .showManualInput(
                  "Paste redirect URL below, or complete login in browser:",
                )
                .then((value) => {
                  if (value && manualCodeResolve) {
                    manualCodeResolve(value);
                    manualCodeResolve = undefined;
                  }
                })
                .catch(() => {
                  if (manualCodeReject) {
                    manualCodeReject(new Error("Login cancelled"));
                    manualCodeReject = undefined;
                  }
                });
            } else if (providerId === "github-copilot") {
              dialog.showWaiting("Waiting for browser authentication...");
            }
          },

          onPrompt: async (prompt: {
            message: string;
            placeholder?: string;
          }) => {
            return dialog.showPrompt(prompt.message, prompt.placeholder);
          },

          onProgress: (message: string) => {
            dialog.showProgress(message);
          },

          onManualCodeInput: () => manualCodePromise,

          signal: dialog.signal,
        },
      );

      restoreEditor();
      this.ctx.modelRegistry.refresh();
      await this.ctx.modelBridge.updateAvailableProviderCount();
      this.ctx.surface.showStatus(
        `Logged in to ${providerName}. Credentials saved to ${getAuthPath()}`,
      );
    } catch (error: unknown) {
      restoreEditor();
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg !== "Login cancelled") {
        this.ctx.surface.showError(`Failed to login to ${providerName}: ${errorMsg}`);
      }
    }
  }
}
