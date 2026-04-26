/**
 * [WHO]: diagnosticsExtension - diagnostic:event listener, /report-issue command, user-approved issue reporting
 * [FROM]: Depends on core/extensions/types, @pencil-agent/tui, ./diagnostic-buffer, ./reporter, ./types
 * [TO]: Auto-loaded by builtin-extensions.ts as a default extension before diagnostic producers
 * [HERE]: extensions/defaults/diagnostics/index.ts - extension-owned diagnostic buffer, prompt policy, and upload pipeline
 */

import { Box, Container, Spacer, Text, type Component } from "@pencil-agent/tui";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "../../../core/extensions/types.js";
import { coerceDiagnosticEvent, DiagnosticBuffer } from "./diagnostic-buffer.js";
import { reportDiagnostics } from "./reporter.js";
import { DIAGNOSTIC_EVENT_CHANNEL, type DiagnosticRecord } from "./types.js";

const MESSAGE_TYPE = "diagnostics";
const PROMPT_TITLE = "Pencil noticed a background issue";

export default async function diagnosticsExtension(api: ExtensionAPI): Promise<void> {
	const buffer = new DiagnosticBuffer();

	api.registerMessageRenderer(MESSAGE_TYPE, (message, _options, theme): Component => {
		const text = typeof message.content === "string" ? message.content : JSON.stringify(message.content, null, 2);
		const box = new Box(1, 1, (v) => theme.bg("customMessageBg", v));
		box.addChild(new Text(theme.fg("dim", text), 0, 0));
		const container = new Container();
		container.addChild(new Spacer(1));
		container.addChild(box);
		return container;
	});

	api.events.on(DIAGNOSTIC_EVENT_CHANNEL, (payload) => {
		const event = coerceDiagnosticEvent(payload);
		if (!event) return;
		buffer.add(event);
	});

	api.on("agent_end", async (_event, ctx) => {
		const candidate = buffer.findPromptCandidate();
		if (!candidate || !ctx.hasUI) return;
		buffer.markPrompted(candidate.fingerprint);
		const approved = await ctx.ui.confirm(
			PROMPT_TITLE,
			formatPrompt(candidate),
			{ timeout: 30000 },
		);
		if (!approved) return;
		const result = await reportDiagnostics([candidate], undefined, ctx);
		ctx.ui.notify(result.message, result.ok ? "info" : "warning");
	});

	api.registerCommand("report-issue", {
		description: "Report recent diagnostics (/report-issue [last|all|note])",
		handler: (args, ctx) => handleReportIssue(args, ctx, buffer),
	});
}

async function handleReportIssue(
	args: string,
	ctx: ExtensionCommandContext,
	buffer: DiagnosticBuffer,
): Promise<void> {
	const trimmed = args.trim();
	const records = selectRecords(trimmed, buffer);
	if (records.length === 0) {
		ctx.ui.notify("No diagnostics recorded in this session.", "info");
		return;
	}
	const userNote = trimmed && trimmed !== "last" && trimmed !== "all" ? stripQuotes(trimmed) : undefined;
	const result = await reportDiagnostics(records, userNote, ctx);
	ctx.ui.notify(result.message, result.ok ? "info" : "warning");
	if (result.ok) {
		ctx.ui.setStatus("diagnostics", undefined);
	}
}

function selectRecords(args: string, buffer: DiagnosticBuffer): DiagnosticRecord[] {
	if (args === "all") return buffer.all();
	if (args === "last") {
		const last = buffer.last();
		return last ? [last] : [];
	}
	const all = buffer.all();
	return all.length > 0 ? all.slice(0, 5) : [];
}

function formatPrompt(record: DiagnosticRecord): string {
	return [
		`${record.message}`,
		"",
		`Source: ${record.source}`,
		`Category: ${record.category}`,
		`Occurrences: ${record.occurrence_count}`,
		"",
		"Chat continues normally.",
		"",
		"Report this diagnostic to help improve Pencil?",
	].join("\n");
}

function stripQuotes(value: string): string {
	if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
		return value.slice(1, -1);
	}
	return value;
}
