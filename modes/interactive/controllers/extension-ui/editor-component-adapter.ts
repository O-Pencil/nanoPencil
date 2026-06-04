/**
 * [WHO]: Provides EditorComponentAdapter, EditorComponentContext — extension editor replacement
 * [FROM]: Depends on @pencil-agent/tui (Component/Container/TUI/EditorComponent/EditorTheme/
 *         CombinedAutocompleteProvider), keybindings (KeybindingsManager), components (CustomEditor), theme
 * [TO]: Consumed by modes/interactive/interactive-mode.ts (held as `this.editorAdapter`; wired into
 *       ExtensionUIContext.setEditorComponent; reset by resetExtensionUI)
 * [HERE]: modes/interactive/controllers/extension-ui/editor-component-adapter.ts — P5 extension-ui rewrite, host 4/4 (UI02, 纯搬)
 *
 * Owns ExtensionUIContext.setEditorComponent: swap the active editor for an extension-provided one
 * (or restore the default), preserving text, submit/change callbacks, appearance, autocomplete, and —
 * for CustomEditor subclasses — the app-level key/action handlers. The active editor reference is
 * mount state, so the adapter reads/writes it through the context (getEditor/setEditor). Behavior is
 * identical to the former InteractiveMode.setCustomEditorComponent (纯搬).
 */

import type {
  CombinedAutocompleteProvider,
  Component,
  Container,
  EditorComponent,
  EditorTheme,
  TUI,
} from "@pencil-agent/tui";
import type { KeybindingsManager } from "../../../../core/platform/keybindings.js";
import type { CustomEditor } from "../../components/custom-editor.js";
import { getEditorTheme } from "../../theme/theme.js";

/** Narrow capability seam: the active-editor reference + editor-shell the adapter swaps. */
export interface EditorComponentContext {
  getEditor(): EditorComponent;
  /** Swap the active editor reference (mount state). */
  setEditor(editor: EditorComponent): void;
  getDefaultEditor(): CustomEditor;
  getEditorContainer(): Container;
  getUi(): TUI;
  getKeybindings(): KeybindingsManager;
  getAutocompleteProvider(): CombinedAutocompleteProvider | undefined;
  remountEditorShell(): void;
}

export class EditorComponentAdapter {
  constructor(private readonly ctx: EditorComponentContext) {}

  /**
   * Set a custom editor component from an extension. Pass undefined to restore the default editor.
   */
  setComponent(
    factory:
      | ((
          tui: TUI,
          theme: EditorTheme,
          keybindings: KeybindingsManager,
        ) => EditorComponent)
      | undefined,
  ): void {
    const ctx = this.ctx;
    // Save text from current editor before switching
    const currentText = ctx.getEditor().getText();

    ctx.getEditorContainer().clear();

    let nextEditor: EditorComponent;

    if (factory) {
      const defaultEditor = ctx.getDefaultEditor();
      // Create the custom editor with tui, theme, and keybindings
      const newEditor = factory(ctx.getUi(), getEditorTheme(), ctx.getKeybindings());

      // Wire up callbacks from the default editor
      newEditor.onSubmit = defaultEditor.onSubmit;
      newEditor.onChange = defaultEditor.onChange;

      // Copy text from previous editor
      newEditor.setText(currentText);

      // Copy appearance settings if supported
      if (newEditor.borderColor !== undefined) {
        newEditor.borderColor = defaultEditor.borderColor;
      }
      if (newEditor.setPaddingX !== undefined) {
        newEditor.setPaddingX(defaultEditor.getPaddingX());
      }

      // Set autocomplete if supported
      const autocompleteProvider = ctx.getAutocompleteProvider();
      if (newEditor.setAutocompleteProvider && autocompleteProvider) {
        newEditor.setAutocompleteProvider(autocompleteProvider);
      }

      // If extending CustomEditor, copy app-level handlers
      // Use duck typing since instanceof fails across jiti module boundaries
      const customEditor = newEditor as unknown as Record<string, unknown>;
      if (
        "actionHandlers" in customEditor &&
        customEditor.actionHandlers instanceof Map
      ) {
        customEditor.onEscape = () => defaultEditor.onEscape?.();
        customEditor.onCtrlD = () => defaultEditor.onCtrlD?.();
        customEditor.onPasteImage = () => defaultEditor.onPasteImage?.();
        customEditor.onExtensionShortcut = (data: string) =>
          defaultEditor.onExtensionShortcut?.(data);
        // Copy action handlers (clear, suspend, model switching, etc.)
        for (const [action, handler] of defaultEditor.actionHandlers) {
          (customEditor.actionHandlers as Map<string, () => void>).set(
            action,
            handler,
          );
        }
      }

      nextEditor = newEditor;
    } else {
      // Restore default editor with text from custom editor
      const defaultEditor = ctx.getDefaultEditor();
      defaultEditor.setText(currentText);
      nextEditor = defaultEditor;
    }

    ctx.setEditor(nextEditor);
    ctx.remountEditorShell();
    ctx.getUi().setFocus(nextEditor as Component);
    ctx.getUi().requestRender();
  }
}
