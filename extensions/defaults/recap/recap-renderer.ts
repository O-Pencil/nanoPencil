/**
 * [WHO]: createRecapRenderer() — MessageRenderer for RECAP_MESSAGE_TYPE custom messages
 * [FROM]: Depends on @pencil-agent/tui (Box, Container, Spacer, Text), ./recap-types
 * [TO]: Consumed by extensions/defaults/recap/index.ts via api.registerMessageRenderer
 * [HERE]: extensions/defaults/recap/recap-renderer.ts - ※ recap visual style + inline token/cost accounting badge
 */
import { Box, Container, Spacer, Text, type Component } from "@pencil-agent/tui";
import type { MessageRenderer } from "../../../core/extensions/types.js";
import type { RecapEntry } from "./recap-types.js";

const REFERENCE_MARK = "※"; // U+203B — monospace-friendly meta-message glyph

function formatHeader(entry: RecapEntry): string {
	if (entry.source === "free" || !entry.usage) {
		return `${REFERENCE_MARK} recap · free`;
	}
	const { input, output, cost } = entry.usage;
	const totalCost = cost.total.toFixed(4);
	return `${REFERENCE_MARK} recap · ${input} in / ${output} out · ~$${totalCost}`;
}

function extractContentText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter((part): part is { type: "text"; text: string } =>
			typeof part === "object" && part !== null && (part as { type?: unknown }).type === "text",
		)
		.map((part) => part.text)
		.join("\n");
}

/**
 * Renderer registered via `api.registerMessageRenderer("recap", …)`.
 *
 * Layout:
 *   ※ recap · 412 in / 89 out · ~$0.0021    <- dim header with cost badge
 *   <recap body>                              <- normal-weight body
 *
 * Body uses Text (not Markdown) so we don't have to reach into
 * modes/interactive/theme for getMarkdownTheme — extensions stay
 * mode-agnostic.
 */
export function createRecapRenderer(): MessageRenderer<RecapEntry> {
	return (message, _options, theme): Component => {
		const entry = (message.details ?? { source: "free", trigger: "manual", triggeredAt: Date.now() }) as RecapEntry;
		const body = extractContentText(message.content);

		const box = new Box(1, 1, (t) => theme.bg("customMessageBg", t));
		box.addChild(new Text(theme.fg("dim", formatHeader(entry)), 0, 0));
		box.addChild(new Spacer(1));
		box.addChild(new Text(theme.fg("customMessageText", body), 0, 0));

		const container = new Container();
		container.addChild(new Spacer(1));
		container.addChild(box);
		return container;
	};
}
