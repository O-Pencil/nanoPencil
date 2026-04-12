/**
 * [WHO]: UserMessageComponent
 * [FROM]: Depends on @pencil-agent/tui, ../theme/theme.js
 * [TO]: Consumed by modes/interactive/components/index.ts
 * [HERE]: modes/interactive/components/user-message.ts - user message display component
 */

import { Container, Markdown, type MarkdownTheme, Spacer, Text } from "@pencil-agent/tui";
import { getMarkdownTheme, theme } from "../theme/theme.js";

/**
 * Component that renders a user message
 */
export class UserMessageComponent extends Container {
	constructor(text: string, markdownTheme: MarkdownTheme = getMarkdownTheme()) {
		super();
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.fg("userLabel", "▸ " + theme.bold("You")), 1, 0));
		this.addChild(
			new Markdown(text, 1, 1, markdownTheme, {
				bgColor: (text: string) => theme.bg("userMessageBg", text),
				color: (text: string) => theme.fg("userMessageText", text),
			}),
		);
	}
}
