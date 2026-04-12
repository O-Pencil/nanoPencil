/**
 * [WHO]: AssistantMessageComponent
 * [FROM]: Depends on @pencil-agent/tui, ../theme/theme.js
 * [TO]: Consumed by modes/interactive/components/index.ts
 * [HERE]: modes/interactive/components/assistant-message.ts - assistant message display
 */

import type { AssistantMessage } from "@pencil-agent/ai";
import { Box, Container, Markdown, type MarkdownTheme, Spacer, Text } from "@pencil-agent/tui";
import { getMarkdownTheme, theme } from "../theme/theme.js";

/**
 * Component that renders a complete assistant message
 */
export class AssistantMessageComponent extends Container {
	private contentContainer: Container;
	private hideThinkingBlock: boolean;
	private markdownTheme: MarkdownTheme;
	private lastMessage?: AssistantMessage;

	constructor(
		message?: AssistantMessage,
		hideThinkingBlock = false,
		markdownTheme: MarkdownTheme = getMarkdownTheme(),
	) {
		super();

		this.hideThinkingBlock = hideThinkingBlock;
		this.markdownTheme = markdownTheme;

		// Container for text/thinking content
		this.contentContainer = new Container();
		this.addChild(this.contentContainer);

		if (message) {
			this.updateContent(message);
		}
	}

	override invalidate(): void {
		super.invalidate();
		if (this.lastMessage) {
			this.updateContent(this.lastMessage);
		}
	}

	setHideThinkingBlock(hide: boolean): void {
		this.hideThinkingBlock = hide;
	}

	updateContent(message: AssistantMessage): void {
		this.lastMessage = message;

		// Clear content container
		this.contentContainer.clear();

		const hasVisibleContent = message.content.some(
			(c) => (c.type === "text" && c.text.trim()) || (c.type === "thinking" && c.thinking.trim()),
		);

		let addedAssistantLabelForText = false;
		let seenThinking = false;

		// Render content in order
		for (let i = 0; i < message.content.length; i++) {
			const content = message.content[i];
			if (content.type === "text" && content.text.trim()) {
				if (!addedAssistantLabelForText) {
					// Top spacing before first text when this message did not start with thinking.
					if (!seenThinking) {
						this.contentContainer.addChild(new Spacer(1));
					}
					addedAssistantLabelForText = true;
				}
				const textBox = new Box(1, 1, (text: string) =>
					theme.bg("assistantMessageBg", text),
				);
				textBox.addChild(
					new Markdown(content.text.trim(), 0, 0, this.markdownTheme, {
						color: (text: string) => theme.fg("assistantMessageText", text),
					}),
				);
				this.contentContainer.addChild(textBox);
			} else if (content.type === "thinking" && content.thinking.trim()) {
				seenThinking = true;
				// Add spacing only when another visible assistant content block follows.
				// This avoids a superfluous blank line before separately-rendered tool execution blocks.
				const hasVisibleContentAfter = message.content
					.slice(i + 1)
					.some((c) => (c.type === "text" && c.text.trim()) || (c.type === "thinking" && c.thinking.trim()));

				this.contentContainer.addChild(new Spacer(1));
				const thinkingLabel = new Text(theme.italic(theme.fg("thinkingText", "I'm thinking...")), 1, 0);

				if (this.hideThinkingBlock) {
					this.contentContainer.addChild(thinkingLabel);
					if (hasVisibleContentAfter) {
						this.contentContainer.addChild(new Spacer(1));
					}
				} else {
					this.contentContainer.addChild(thinkingLabel);
					this.contentContainer.addChild(
						new Markdown(content.thinking.trim(), 1, 0, this.markdownTheme, {
							color: (text: string) => theme.fg("thinkingText", text),
							italic: true,
						}),
					);
					if (hasVisibleContentAfter) {
						this.contentContainer.addChild(new Spacer(1));
					}
				}
			}
		}

		// Check if aborted - show after partial content
		// But only if there are no tool calls (tool execution components will show the error)
		const hasToolCalls = message.content.some((c) => c.type === "toolCall");
		if (!hasToolCalls) {
			if (message.stopReason === "aborted") {
				const abortMessage =
					message.errorMessage && message.errorMessage !== "Request was aborted"
						? message.errorMessage
						: "Operation aborted";
				if (hasVisibleContent) {
					this.contentContainer.addChild(new Spacer(1));
				} else {
					this.contentContainer.addChild(new Spacer(1));
				}
				this.contentContainer.addChild(new Text(theme.fg("error", abortMessage), 1, 0));
			} else if (message.stopReason === "error") {
				const errorMsg = message.errorMessage || "Unknown error";
				this.contentContainer.addChild(new Spacer(1));
				this.contentContainer.addChild(new Text(theme.fg("error", `Error: ${errorMsg}`), 1, 0));
			}
		}
	}
}
