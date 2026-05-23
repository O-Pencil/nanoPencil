/**
 * [WHO]: recapExtension — registers /recap command and the ※ recap message renderer
 * [FROM]: Depends on core/extensions/types, ./recap-renderer, ./recap-synthesizer, ./recap-types
 * [TO]: Auto-loaded by builtin-extensions.ts as a default extension
 * [HERE]: extensions/defaults/recap/index.ts - on-demand Smart situational recap for long/complex tasks
 */
import type { ExtensionAPI, ExtensionCommandContext } from "../../../core/extensions/types.js";
import { createRecapRenderer } from "./recap-renderer.js";
import { synthesizeSmartRecap } from "./recap-synthesizer.js";
import { RECAP_DEFAULTS, RECAP_MESSAGE_TYPE, type RecapEntry } from "./recap-types.js";

const RECAP_TIMEOUT_MS = 30_000;

async function handleRecapCommand(args: string, ctx: ExtensionCommandContext, api: ExtensionAPI): Promise<void> {
	const trimmed = args.trim();
	if (trimmed.length > 0 && trimmed !== "--smart") {
		// M1 only ships /recap (Smart by default). Free path (--free), auto mode,
		// status, budget reset — all defer to later milestones. Be explicit so
		// users don't think the flag silently changed behaviour.
		ctx.ui.notify(
			`Unknown /recap argument: ${trimmed}. M1 only supports bare /recap (Smart, default).`,
			"warning",
		);
		return;
	}

	if (!ctx.model) {
		ctx.ui.notify("Recap unavailable: no model is currently selected.", "warning");
		return;
	}

	ctx.ui.notify("Synthesizing recap…", "info");

	try {
		const result = await Promise.race([
			synthesizeSmartRecap(ctx, RECAP_DEFAULTS, "manual"),
			new Promise<{ kind: "timeout" }>((resolve) =>
				setTimeout(() => resolve({ kind: "timeout" }), RECAP_TIMEOUT_MS),
			),
		]);

		if (result.kind === "timeout") {
			ctx.ui.notify("Recap timed out after 30s.", "warning");
			return;
		}
		if (result.kind === "budget_blocked") {
			ctx.ui.notify(result.reason, "warning");
			return;
		}
		if (result.kind === "no_model") {
			ctx.ui.notify("Recap unavailable: no model is currently selected.", "warning");
			return;
		}
		if (result.kind === "no_response") {
			ctx.ui.notify("Recap unavailable: model returned no usable text (check API key).", "warning");
			return;
		}

		const entry: RecapEntry = {
			source: "smart",
			trigger: "manual",
			triggeredAt: Date.now(),
			usage: result.completion.usage,
		};

		api.sendMessage<RecapEntry>({
			customType: RECAP_MESSAGE_TYPE,
			content: result.completion.text.trim(),
			display: true,
			details: entry,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		ctx.ui.notify(`Recap error: ${message}`, "error");
	}
}

export default async function recapExtension(api: ExtensionAPI): Promise<void> {
	api.registerMessageRenderer(RECAP_MESSAGE_TYPE, createRecapRenderer());

	api.registerCommand("recap", {
		description: "Show a brief situational recap of the current task (goal, key facts, next decision)",
		handler: (args, ctx) => handleRecapCommand(args, ctx, api),
	});
}
