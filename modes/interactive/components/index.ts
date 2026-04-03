/**
 * [UPSTREAM]: Depends on all component files
 * [SURFACE]: UI component barrel exports
 * [LOCUS]: modes/interactive/components/index.ts - component barrel
 * [COVENANT]: Change components → update this header
 */
// UI Components for extensions
export { ArminComponent } from "./armin.js";
export { AttachmentsBarComponent } from "./attachments-bar.js";
export { AssistantMessageComponent } from "./assistant-message.js";
export { promptForApiKey } from "./apikey-input.js";
export { BashExecutionComponent } from "./bash-execution.js";
export { BorderedLoader } from "./bordered-loader.js";
export { BranchSummaryMessageComponent } from "./branch-summary-message.js";
export { CompactionSummaryMessageComponent } from "./compaction-summary-message.js";
export { CustomEditor } from "./custom-editor.js";
export { CustomMessageComponent } from "./custom-message.js";
export { DaxnutsComponent } from "./daxnuts.js";
export { type RenderDiffOptions, renderDiff } from "./diff.js";
export { DynamicBorder } from "./dynamic-border.js";
export { ExtensionEditorComponent } from "./extension-editor.js";
export { ExtensionInputComponent } from "./extension-input.js";
export { ExtensionSelectorComponent } from "./extension-selector.js";
export { FooterComponent } from "./footer.js";
export {
  appKey,
  appKeyHint,
  editorKey,
  keyHint,
  rawKeyHint,
} from "./keybinding-hints.js";
export { LoginDialogComponent } from "./login-dialog.js";
export { ModelSelectorComponent } from "./model-selector.js";
export { OAuthSelectorComponent } from "./oauth-selector.js";
export { PencilLoader } from "./pencil-loader.js";
export { ProviderSelectorComponent } from "./provider-selector.js";
export {
  type ModelsCallbacks,
  type ModelsConfig,
  ScopedModelsSelectorComponent,
} from "./scoped-models-selector.js";
export { SessionSelectorComponent } from "./session-selector.js";
export {
  type SettingsCallbacks,
  type SettingsConfig,
  SettingsSelectorComponent,
} from "./settings-selector.js";
export { ShowImagesSelectorComponent } from "./show-images-selector.js";
export { SkillInvocationMessageComponent } from "./skill-invocation-message.js";
export { ThemeSelectorComponent } from "./theme-selector.js";
export { ThinkingSelectorComponent } from "./thinking-selector.js";
export {
  ToolExecutionComponent,
  type ToolExecutionOptions,
} from "./tool-execution.js";
export { TreeSelectorComponent } from "./tree-selector.js";
export { UserMessageComponent } from "./user-message.js";
export { UserMessageSelectorComponent } from "./user-message-selector.js";
export {
  truncateToVisualLines,
  type VisualTruncateResult,
} from "./visual-truncate.js";
