/**
 * [WHO]: Provides exportSessionHtml(), getLastAssistantText()
 * [FROM]: Depends on agent-core/ai public message types, export-html, ExtensionRunner, SessionManager, Theme
 * [TO]: Consumed by core/runtime/agent-session.ts facade methods
 * [HERE]: core/runtime/export-bridge.ts - HTML export bridge extracted from AgentSession
 *
 * Extracted from AgentSession (P4.6). This module owns HTML export wiring and last-assistant
 * text extraction. AgentSession remains the public facade and injects the optional Theme.
 */

import type { AgentMessage, AgentState } from "@catui/agent-core";
import type { AssistantMessage } from "@catui/ai/types";
import { exportSessionToHtml } from "../export-html/index.js";
import { createToolHtmlRenderer } from "../export-html/tool-renderer.js";
import type { ExtensionRunner } from "../extensions-host/index.js";
import type { SessionManager } from "../session/session-manager.js";
import type { Theme } from "../theme-contract.js";

export interface ExportSessionHtmlOptions {
  sessionManager: SessionManager;
  state: AgentState;
  outputPath?: string;
  themeName?: string;
  extensionRunner?: ExtensionRunner;
  theme?: Theme;
}

export async function exportSessionHtml(
  options: ExportSessionHtmlOptions,
): Promise<string> {
  const toolRenderer =
    options.extensionRunner && options.theme
      ? createToolHtmlRenderer({
          getToolDefinition: (name) =>
            options.extensionRunner!.getToolDefinition(name),
          theme: options.theme,
        })
      : undefined;

  return await exportSessionToHtml(options.sessionManager, options.state, {
    outputPath: options.outputPath,
    themeName: options.themeName,
    toolRenderer,
  });
}

export function getLastAssistantText(
  messages: ReadonlyArray<AgentMessage>,
): string | undefined {
  const lastAssistant = messages
    .slice()
    .reverse()
    .find((message): message is AssistantMessage => {
      if (message.role !== "assistant") return false;
      if (message.stopReason === "aborted" && message.content.length === 0) {
        return false;
      }
      return true;
    });

  if (!lastAssistant) return undefined;

  let text = "";
  for (const content of lastAssistant.content) {
    if (content.type === "text") {
      text += content.text;
    }
  }

  return text.trim() || undefined;
}
