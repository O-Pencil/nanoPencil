/**
 * [WHO]: Extension interface
 * [FROM]: Depends on node:fs, node:module, node:path, node:url, @pencil-agent/tui
 * [TO]: Loaded by core/extensions/loader.ts as extension entry point
 * [HERE]: extensions/defaults/team/index.ts -
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { Box, Container, Spacer, Text, type Component } from "@pencil-agent/tui";
import { Type, type Static } from "@sinclair/typebox";
import type { AgentToolResult, AgentToolUpdateCallback } from "../../../core/extensions/types.js";
import type { ExecResult, ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "../../../core/extensions/types.js";
import { getAgentDir } from "../../../config.js";
import { DefaultResourceLoader } from "../../../core/config/resource-loader.js";
import { SettingsManager } from "../../../core/config/settings-manager.js";
import { createAgentSession } from "../../../core/runtime/sdk.js";
import { SessionManager } from "../../../core/session/session-manager.js";
import { createBashTool, createFindTool, createGrepTool, createLsTool, createReadOnlyTools, createReadTool } from "../../../core/tools/index.js";
import { TeamController } from "./team-controller.js";
import { buildTeamHelp, parseTeamCommand } from "./team-parser.js";
import type {
	TeamCommandMode,
	TeamPlan,
	TeamRunReport,
	TeamRunState,
	TeamWorkerMode,
	TeamWorkerResult,
	TeamWorkerSpec,
} from "./team-types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const TEAM_MESSAGE_TYPE = "team";
const TEAM_STATE_ENTRY = "team_state";
const TEAM_REPORT_ENTRY = "team_report";
const TEAM_PLAN_START = "<team-plan>";
const TEAM_PLAN_END = "</team-plan>";
const TEAM_RESULT_START = "<team-result>";
const TEAM_RESULT_END = "</team-result>";
const AGENT_TEAM_TRIGGER_PATTERNS = [
	/\bagent\s*team(s)?\b/i,
	/\bmulti[\s-]?agent\b/i,
	/\bsub[\s-]?agent(s)?\b/i,
	/\buse\s+agent\s*team(s)?\b/i,
	/\buse\s+multi[\s-]?agent\b/i,
	/multi\s*agent/i,
	/multi-agent/i,
	/multiple agents/i,
	/use\s*agent\s*team/i,
	/use multi-agent/i,
	/agent team/i,
];

const TEAM_TOOL_PARAMS = Type.Object({
	goal: Type.String({ minLength: 1 }),
	mode: Type.Optional(Type.Union([Type.Literal("auto"), Type.Literal("research"), Type.Literal("execute")])),
});

type TeamToolParams = Static<typeof TEAM_TOOL_PARAMS>;

const PLANNER_SYSTEM_PROMPT = `
You are the planning lead inside a coding-agent team.

Return exactly one XML block containing a JSON object:
<team-plan>{"summary":"...","executionMode":"research_only|implement_and_review","researchWorkers":[{"id":"research-1","role":"...","mode":"research","task":"...","writeAccess":false}],"implementationTask":"optional","reviewTask":"optional"}</team-plan>

Rules:
- Return valid JSON only inside the XML block.
- Keep researchWorkers between 1 and 3 items.
- All research workers must be read-only.
- Choose "research_only" when the user mainly needs understanding, architecture, diagnosis, or a migration plan.
- Choose "implement_and_review" when the task clearly asks for code changes or a finished implementation.
- implementationTask and reviewTask are required for "implement_and_review".
- Tasks should be concrete, repo-aware, and non-overlapping.
`.trim();

function workerSystemPrompt(mode: TeamWorkerMode, writeAccess: boolean): string {
	const base = [
		"You are a specialist worker inside a NanoPencil agent team.",
		"Stay within your assigned task and produce a clean handoff for the coordinator.",
		`Write access: ${writeAccess ? "enabled" : "disabled"}.`,
		"Return exactly one XML block containing a JSON object:",
		'<team-result>{"status":"success|blocked|failed","summary":"...","findings":["..."],"changedFiles":["relative/path"],"handoff":"optional next-step guidance"}</team-result>',
		"Rules:",
		"- Return valid JSON only inside the XML block.",
		"- Keep summary concise and factual.",
		"- findings should contain short standalone points with evidence.",
		"- changedFiles must list only files you actually edited.",
		"- Use blocked only when you cannot proceed without external input, permissions, or missing resources.",
	];
	if (mode === "review") {
		base.push("- Focus on regressions, risks, validation gaps, and what still needs attention.");
	}
	if (mode === "implementation") {
		base.push("- Prefer finishing the requested code changes instead of only describing them.");
	}
	return base.join("\n");
}

function createFallbackPlan(goal: string, mode: TeamCommandMode): TeamPlan {
	const trimmedGoal = goal.trim();
	return {
		summary: `Fallback team plan for: ${trimmedGoal}`,
		executionMode: mode === "research" ? "research_only" : "implement_and_review",
		researchWorkers: [
			{
				id: "research-1",
				role: "Architecture Analyst",
				mode: "research",
				task: `Inspect the repository and identify the modules, files, and constraints most relevant to this goal: ${trimmedGoal}`,
				writeAccess: false,
			},
			{
				id: "research-2",
				role: "Risk Analyst",
				mode: "research",
				task: `Review likely edge cases, regressions, testing gaps, and rollout risks for this goal: ${trimmedGoal}`,
				writeAccess: false,
			},
		],
		implementationTask:
			mode === "research"
				? undefined
				: `Implement the requested changes for this goal using the research handoff: ${trimmedGoal}`,
		reviewTask:
			mode === "research"
				? undefined
				: `Review the implementation changes for bugs, regressions, and missing validation for this goal: ${trimmedGoal}`,
	};
}

function findPackageRoot(startDir: string): string | undefined {
	let dir = startDir;
	for (let i = 0; i < 20; i += 1) {
		const pkgPath = join(dir, "package.json");
		if (existsSync(pkgPath)) {
			try {
				const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { name?: string };
				if (pkg.name === "@pencil-agent/nano-pencil" || pkg.name === "nanopencil") {
					return dir;
				}
			} catch {
				return undefined;
			}
		}
		const parent = dirname(dir);
		if (parent === dir) return undefined;
		dir = parent;
	}
	return undefined;
}

function resolveCliLaunch(): { command: string; prefixArgs: string[] } {
	const packageRoot = findPackageRoot(__dirname);
	if (packageRoot) {
		const distCli = join(packageRoot, "dist", "cli.js");
		if (existsSync(distCli)) {
			return { command: process.execPath, prefixArgs: [distCli] };
		}
		try {
			const resolved = require.resolve("@pencil-agent/nano-pencil/dist/cli.js");
			return { command: process.execPath, prefixArgs: [resolved] };
		} catch {
			// ignore and fall through
		}
	}

	if (process.argv[1] && existsSync(process.argv[1])) {
		return { command: process.execPath, prefixArgs: [process.argv[1]] };
	}

	throw new Error("Unable to locate the nanoPencil CLI entry for team workers.");
}

function summarizeGoal(goal: string, maxLength = 80): string {
	const trimmed = goal.trim();
	return trimmed.length <= maxLength ? trimmed : `${trimmed.slice(0, maxLength - 3)}...`;
}

function extractLatestUserRequest(ctx: ExtensionContext): string {
	const entries = ctx.sessionManager.getEntries();
	for (let i = entries.length - 1; i >= 0; i -= 1) {
		const entry = entries[i];
		if (entry.type !== "message" || entry.message.role !== "user") continue;
		const content = entry.message.content;
		if (typeof content === "string") {
			return content;
		}
		if (!Array.isArray(content)) return "";
		return content
			.filter(
				(part): part is { type: "text"; text: string } =>
					typeof part === "object" &&
					part !== null &&
					"type" in part &&
					(part as { type?: unknown }).type === "text" &&
					typeof (part as { text?: unknown }).text === "string",
			)
			.map((part) => part.text)
			.join("\n");
	}
	return "";
}

function isExplicitAgentTeamRequest(text: string): boolean {
	const normalized = text.trim();
	if (!normalized) return false;
	return AGENT_TEAM_TRIGGER_PATTERNS.some((pattern) => pattern.test(normalized));
}

function ensureExplicitTeamTrigger(ctx: ExtensionContext, goal: string): void {
	const latestUserRequest = extractLatestUserRequest(ctx);
	if (isExplicitAgentTeamRequest(latestUserRequest) || isExplicitAgentTeamRequest(goal)) {
		return;
	}

	throw new Error(
		'Agent team can only run when the user explicitly asks for it, such as "/agent team ..." or "Use Agent team for this task."',
	);
}

function renderDashboard(state: TeamRunState): string[] {
	const lines = [
		`Team ${state.id} · ${state.stage}`,
		`${state.mode.toUpperCase()} · ${summarizeGoal(state.goal, 70)}`,
	];
	if (state.plan?.summary) {
		lines.push(`Plan: ${state.plan.summary}`);
	}
	lines.push(`Workers done: ${state.results.length}`);
	if (state.lastWorkerSummary) {
		lines.push(`Latest: ${state.lastWorkerSummary}`);
	}
	if (state.lastError) {
		lines.push(`Error: ${state.lastError}`);
	}
	return lines;
}

function formatTimestamp(timestamp: number): string {
	return new Date(timestamp).toLocaleString();
}

function extractTaggedPayload(output: string, startTag: string, endTag: string): string | undefined {
	const startIndex = output.lastIndexOf(startTag);
	const endIndex = output.lastIndexOf(endTag);
	if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
		return undefined;
	}
	return output.slice(startIndex + startTag.length, endIndex).trim();
}

function parsePlan(output: string): TeamPlan | undefined {
	const payload = extractTaggedPayload(output, TEAM_PLAN_START, TEAM_PLAN_END);
	if (!payload) return undefined;
	try {
		const parsed = JSON.parse(payload) as Partial<TeamPlan>;
		if (!parsed.summary || !Array.isArray(parsed.researchWorkers)) return undefined;
		const executionMode =
			parsed.executionMode === "implement_and_review" ? "implement_and_review" : "research_only";
		const researchWorkers = parsed.researchWorkers
			.filter((worker): worker is TeamWorkerSpec => {
				return Boolean(
					worker &&
						typeof worker.id === "string" &&
						typeof worker.role === "string" &&
						worker.mode === "research" &&
						typeof worker.task === "string",
				);
			})
			.slice(0, 3)
			.map((worker, index) => ({
				...worker,
				id: worker.id || `research-${index + 1}`,
				writeAccess: false,
			}));
		if (researchWorkers.length === 0) return undefined;
		if (executionMode === "implement_and_review" && (!parsed.implementationTask || !parsed.reviewTask)) {
			return undefined;
		}
		return {
			summary: parsed.summary.trim(),
			executionMode,
			researchWorkers,
			implementationTask: parsed.implementationTask?.trim(),
			reviewTask: parsed.reviewTask?.trim(),
		};
	} catch {
		return undefined;
	}
}

function parseWorkerResult(output: string, worker: TeamWorkerSpec): TeamWorkerResult {
	const payload = extractTaggedPayload(output, TEAM_RESULT_START, TEAM_RESULT_END);
	if (!payload) {
		return {
			id: worker.id,
			role: worker.role,
			mode: worker.mode,
			status: "failed",
			summary: "Worker did not return a valid <team-result> block.",
			findings: [],
			changedFiles: [],
			rawOutput: output,
			error: "Missing team-result block",
		};
	}

	try {
		const parsed = JSON.parse(payload) as Partial<TeamWorkerResult>;
		const status =
			parsed.status === "success" || parsed.status === "blocked" || parsed.status === "failed"
				? parsed.status
				: "failed";
		const summary = typeof parsed.summary === "string" && parsed.summary.trim()
			? parsed.summary.trim()
			: "Worker returned no summary.";
		const findings = Array.isArray(parsed.findings)
			? parsed.findings.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
			: [];
		const changedFiles = Array.isArray(parsed.changedFiles)
			? parsed.changedFiles.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
			: [];
		return {
			id: worker.id,
			role: worker.role,
			mode: worker.mode,
			status,
			summary,
			findings,
			changedFiles,
			handoff: typeof parsed.handoff === "string" ? parsed.handoff.trim() : undefined,
			rawOutput: output,
		};
	} catch (error) {
		return {
			id: worker.id,
			role: worker.role,
			mode: worker.mode,
			status: "failed",
			summary: "Worker returned malformed team-result JSON.",
			findings: [],
			changedFiles: [],
			rawOutput: output,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

function extractAssistantTextFromSession(ctx: { messages: Array<{ role?: string; content?: unknown }> }): string {
	const messages = [...ctx.messages].reverse();
	const assistant = messages.find((message) => message.role === "assistant");
	if (!assistant) return "";

	if (typeof assistant.content === "string") {
		return assistant.content;
	}

	if (!Array.isArray(assistant.content)) return "";
	return assistant.content
		.filter(
			(part): part is { type: "text"; text: string } =>
				typeof part === "object" &&
				part !== null &&
				"type" in part &&
				(part as { type?: unknown }).type === "text" &&
				typeof (part as { text?: unknown }).text === "string",
		)
		.map((part) => part.text)
		.join("\n");
}

function formatState(state: TeamRunState): string {
	const lines = [
		`[Team] Active run ${state.id}`,
		`Status: ${state.status}`,
		`Goal: ${state.goal}`,
		`Mode: ${state.mode}`,
		`Stage: ${state.stage}`,
		`Started: ${formatTimestamp(state.startedAt)}`,
		`Updated: ${formatTimestamp(state.updatedAt)}`,
	];
	if (state.plan) {
		lines.push(`Plan: ${state.plan.summary}`);
	}
	if (state.results.length > 0) {
		lines.push(`Completed workers: ${state.results.length}`);
	}
	if (state.lastError) {
		lines.push(`Last error: ${state.lastError}`);
	}
	return lines.join("\n");
}

function createProgressReport(state: TeamRunState): TeamRunReport {
	return {
		id: state.id,
		goal: state.goal,
		mode: state.mode,
		status: state.status,
		startedAt: state.startedAt,
		finishedAt: state.updatedAt,
		plan: state.plan ?? createFallbackPlan(state.goal, state.mode),
		results: [...state.results],
		finalSummary: state.lastWorkerSummary ?? "",
	};
}

function buildProgressUpdate(state: TeamRunState, message?: string): string {
	const lines = [
		`Team run ${state.id} is in stage "${state.stage}".`,
		`Goal: ${summarizeGoal(state.goal, 120)}`,
	];
	if (message) {
		lines.push(`Progress: ${message}`);
	}
	if (state.plan?.summary) {
		lines.push(`Plan: ${state.plan.summary}`);
	}
	if (state.results.length > 0) {
		lines.push(`Completed workers: ${state.results.length}`);
	}
	if (state.lastWorkerSummary) {
		lines.push(`Latest result: ${state.lastWorkerSummary}`);
	}
	if (state.lastError) {
		lines.push(`Last error: ${state.lastError}`);
	}
	return lines.join("\n");
}

function emitProgressUpdate(
	onUpdate: AgentToolUpdateCallback<TeamRunReport> | undefined,
	state: TeamRunState | undefined,
	message?: string,
): void {
	if (!onUpdate || !state) return;
	onUpdate({
		content: [{ type: "text", text: buildProgressUpdate(state, message) }],
		details: createProgressReport(state),
	});
}

function formatReport(report: TeamRunReport): string {
	const lines = [
		`[Team] Run ${report.id}`,
		`Status: ${report.status}`,
		`Goal: ${report.goal}`,
		`Mode: ${report.mode}`,
		`Started: ${formatTimestamp(report.startedAt)}`,
		`Finished: ${formatTimestamp(report.finishedAt)}`,
		`Plan: ${report.plan.summary}`,
		"",
		"Workers:",
	];

	for (const result of report.results) {
		lines.push(`- ${result.id} | ${result.role} | ${result.mode} | ${result.status}`);
		lines.push(`  Summary: ${result.summary}`);
		if (result.findings.length > 0) {
			lines.push(`  Findings: ${result.findings.join(" | ")}`);
		}
		if (result.changedFiles.length > 0) {
			lines.push(`  Changed files: ${result.changedFiles.join(", ")}`);
		}
	}

	lines.push("");
	lines.push("Final summary:");
	lines.push(report.finalSummary);
	if (report.artifactPath) {
		lines.push("");
		lines.push(`Artifact: ${report.artifactPath}`);
	}
	return lines.join("\n");
}

function buildSharedHandoff(goal: string, plan: TeamPlan, results: TeamWorkerResult[]): string {
	const lines = [`Goal: ${goal}`, `Plan summary: ${plan.summary}`];
	for (const result of results) {
		lines.push(`${result.role} (${result.mode}, ${result.status}): ${result.summary}`);
		for (const finding of result.findings.slice(0, 6)) {
			lines.push(`- ${finding}`);
		}
		if (result.handoff) {
			lines.push(`Handoff: ${result.handoff}`);
		}
	}
	return lines.join("\n");
}

function buildPlannerPrompt(goal: string, mode: TeamCommandMode): string {
	return [
		`Goal: ${goal}`,
		`Requested team mode: ${mode}`,
		"Create a practical agent-team plan for this repository task.",
		"Prefer 2 research workers unless a single worker is clearly enough.",
		"If the goal is mainly understanding or diagnosis, choose research_only.",
		"If the goal clearly asks for finished code changes, choose implement_and_review.",
	].join("\n");
}

function buildWorkerPrompt(
	goal: string,
	worker: TeamWorkerSpec,
	plan: TeamPlan,
	previousResults: TeamWorkerResult[],
): string {
	const lines = [
		`Overall goal: ${goal}`,
		`Plan summary: ${plan.summary}`,
		`Assigned role: ${worker.role}`,
		`Assigned mode: ${worker.mode}`,
		`Assigned task: ${worker.task}`,
	];
	if (previousResults.length > 0) {
		lines.push("");
		lines.push("Available handoff from prior workers:");
		lines.push(buildSharedHandoff(goal, plan, previousResults));
	}
	if (worker.mode === "implementation") {
		lines.push("");
		lines.push("Finish the requested repository changes when feasible, then report what you changed.");
	}
	if (worker.mode === "review") {
		lines.push("");
		lines.push("Review the implementation critically. Prioritize correctness, regressions, and missing validation.");
	}
	return lines.join("\n");
}

function buildFinalSummary(report: TeamRunReport): string {
	const completed = report.results.filter((result) => result.status === "success").length;
	const blocked = report.results.filter((result) => result.status === "blocked").length;
	const changedFiles = Array.from(new Set(report.results.flatMap((result) => result.changedFiles)));
	const lines = [
		`Team run ${report.id} finished with status ${report.status}.`,
		`Plan: ${report.plan.summary}`,
		`Successful workers: ${completed}/${report.results.length}.`,
	];
	if (blocked > 0) {
		lines.push(`Blocked workers: ${blocked}.`);
	}
	if (changedFiles.length > 0) {
		lines.push(`Files touched: ${changedFiles.join(", ")}.`);
	}
	const handoffs = report.results
		.map((result) => result.handoff)
		.filter((entry): entry is string => Boolean(entry));
	if (handoffs.length > 0) {
		lines.push(`Key handoff: ${handoffs[handoffs.length - 1]}`);
	}
	return lines.join(" ");
}

function formatDisplaySummary(report: TeamRunReport): string {
	const lines = [
		`Team run ${report.id} finished with status ${report.status}.`,
		report.finalSummary,
	];
	if (report.artifactPath) {
		lines.push(`Artifact: ${report.artifactPath}`);
	}
	return lines.join("\n");
}

function buildReportMarkdown(report: TeamRunReport, cwd: string): string {
	const lines = [
		`# Team Run ${report.id}`,
		"",
		`- Status: ${report.status}`,
		`- Goal: ${report.goal}`,
		`- Mode: ${report.mode}`,
		`- Started: ${formatTimestamp(report.startedAt)}`,
		`- Finished: ${formatTimestamp(report.finishedAt)}`,
		`- Workspace: ${cwd}`,
		"",
		"## Plan",
		"",
		report.plan.summary,
		"",
		"## Workers",
		"",
	];
	for (const result of report.results) {
		lines.push(`### ${result.id} · ${result.role}`);
		lines.push("");
		lines.push(`- Mode: ${result.mode}`);
		lines.push(`- Status: ${result.status}`);
		lines.push(`- Summary: ${result.summary}`);
		if (result.changedFiles.length > 0) {
			lines.push(`- Changed files: ${result.changedFiles.join(", ")}`);
		}
		if (result.findings.length > 0) {
			lines.push("");
			lines.push("Findings:");
			for (const finding of result.findings) {
				lines.push(`- ${finding}`);
			}
		}
		if (result.handoff) {
			lines.push("");
			lines.push(`Handoff: ${result.handoff}`);
		}
		lines.push("");
	}
	lines.push("## Final Summary");
	lines.push("");
	lines.push(report.finalSummary);
	lines.push("");
	return lines.join("\n");
}

function renderTeamMessage(details: unknown, fallbackText: string, theme: (color: string, text: string) => string): Component {
	if (!details || typeof details !== "object" || !("status" in details) || !("id" in details)) {
		const box = new Box(1, 1, (text) => theme("customMessageBg", text));
		box.addChild(new Text(fallbackText, 0, 0));
		return box;
	}

	const report = details as TeamRunReport;
	const container = new Container();
	container.addChild(new Spacer(1));
	const box = new Box(1, 1, (text) => theme("customMessageBg", text));
	container.addChild(box);

	const statusColor =
		report.status === "completed" ? "success" : report.status === "failed" ? "error" : "warning";
	box.addChild(new Text(`\x1b[1m[team]\x1b[22m ${report.id}`, 0, 0));
	box.addChild(new Spacer(1));
	box.addChild(new Text(`Status: ${theme(statusColor, report.status)}`, 0, 0));
	box.addChild(new Text(`Goal: ${report.goal}`, 0, 0));
	box.addChild(new Text(`Plan: ${report.plan.summary}`, 0, 0));
	box.addChild(new Spacer(1));

	for (const result of report.results) {
		const workerColor =
			result.status === "success" ? "success" : result.status === "failed" ? "error" : "warning";
		box.addChild(new Text(`${result.id} · ${result.role} · ${theme(workerColor, result.status)}`, 0, 0));
		box.addChild(new Text(`  ${result.summary}`, 0, 0));
		if (result.changedFiles.length > 0) {
			box.addChild(new Text(`  Files: ${result.changedFiles.join(", ")}`, 0, 0));
		}
		if (result.findings.length > 0) {
			box.addChild(new Text(`  Findings: ${result.findings.slice(0, 3).join(" | ")}`, 0, 0));
		}
	}

	box.addChild(new Spacer(1));
	box.addChild(new Text(`Summary: ${report.finalSummary}`, 0, 0));
	if (report.artifactPath) {
		box.addChild(new Text(`Artifact: ${report.artifactPath}`, 0, 0));
	}

	return container;
}

function writeReportArtifact(report: TeamRunReport, cwd: string): string | undefined {
	const outputDir = join(cwd, ".nanopencil", "team-runs");
	try {
		mkdirSync(outputDir, { recursive: true });
		const outputPath = join(outputDir, `${report.id}.md`);
		writeFileSync(outputPath, buildReportMarkdown(report, cwd), "utf8");
		return outputPath;
	} catch {
		return undefined;
	}
}

function notify(ctx: Pick<ExtensionContext, "ui">, message: string, type: "info" | "warning" | "error" = "info"): void {
	ctx.ui.notify(message, type);
}

function syncRunUi(ctx: ExtensionContext, state: TeamRunState | undefined): void {
	if (!state) {
		ctx.ui.setStatus("team", undefined);
		ctx.ui.setWidget("team", undefined);
		return;
	}

	ctx.ui.setStatus("team", `team ${state.id}: ${state.stage}`);
	ctx.ui.setWidget("team", renderDashboard(state), { placement: "belowEditor" });
}

function persistState(pi: ExtensionAPI, state: TeamRunState): void {
	pi.appendEntry(TEAM_STATE_ENTRY, state);
}

function persistReport(pi: ExtensionAPI, report: TeamRunReport): void {
	pi.appendEntry(TEAM_REPORT_ENTRY, report);
}

function restoreFromSession(pi: ExtensionAPI, ctx: ExtensionContext): { active?: TeamRunState; last?: TeamRunReport } {
	const entries = ctx.sessionManager.getEntries();
	let active: TeamRunState | undefined;
	let last: TeamRunReport | undefined;

	for (const entry of entries) {
		if (entry.type !== "custom") continue;
		if (entry.customType === TEAM_STATE_ENTRY && entry.data && typeof entry.data === "object") {
			active = entry.data as TeamRunState;
		}
		if (entry.customType === TEAM_REPORT_ENTRY && entry.data && typeof entry.data === "object") {
			last = entry.data as TeamRunReport;
		}
	}

	const controller = getController(pi);
	if (last) {
		controller.hydrateLast(last);
	}
	if (active && active.status === "running") {
		controller.hydrateActive(active);
		const interrupted: TeamRunReport = {
			id: active.id,
			goal: active.goal,
			mode: active.mode,
			status: "stopped",
			startedAt: active.startedAt,
			finishedAt: Date.now(),
			plan:
				active.plan ?? {
					summary: "Recovered from interrupted run without a stored plan.",
					executionMode: "research_only",
					researchWorkers: [],
				},
			results: active.results,
			finalSummary: "The previous team run was interrupted because the process ended before completion.",
		};
		controller.finish("stopped", interrupted.finalSummary);
		persistReport(pi, interrupted);
		last = interrupted;
		active = undefined;
	}

	return { active, last };
}

async function runCliWorker(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	worker: TeamWorkerSpec,
	goal: string,
	userPrompt: string,
): Promise<ExecResult> {
	const model = ctx.model;
	if (!model) {
		throw new Error("No active model is selected for team workers.");
	}

	const { command, prefixArgs } = resolveCliLaunch();
	const tools = worker.writeAccess ? "read,bash,edit,write,grep,find,ls" : "read,bash,grep,find,ls";
	const args = [
		...prefixArgs,
		"--cwd",
		ctx.cwd,
		"--provider",
		model.provider,
		"--model",
		model.id,
		"--append-system-prompt",
		workerSystemPrompt(worker.mode, Boolean(worker.writeAccess)),
		"--tools",
		tools,
		"--print",
		"--no-session",
		"--no-extensions",
		"--no-mcp",
		"--disable-soul",
		userPrompt,
	];

	const abortController = new AbortController();
	const teamController = getController(pi);
	teamController.registerAbortController(abortController);
	try {
		return await pi.exec(command, args, {
			cwd: ctx.cwd,
			timeout: worker.mode === "implementation" ? 15 * 60 * 1000 : 10 * 60 * 1000,
			signal: abortController.signal,
		});
	} finally {
		teamController.unregisterAbortController(abortController);
	}
}

async function runNativeWorker(
	ctx: ExtensionContext,
	worker: TeamWorkerSpec,
	userPrompt: string,
): Promise<string> {
	const agentDir = getAgentDir();
	const settingsManager = SettingsManager.create(ctx.cwd, agentDir);
	const resourceLoader = new DefaultResourceLoader({
		cwd: ctx.cwd,
		agentDir,
		settingsManager,
		noExtensions: true,
		appendSystemPrompt: workerSystemPrompt(worker.mode, Boolean(worker.writeAccess)),
	});
	await resourceLoader.reload();

	const tools = worker.writeAccess
		? undefined
		: [
				createReadTool(ctx.cwd),
				createBashTool(ctx.cwd),
				createGrepTool(ctx.cwd),
				createFindTool(ctx.cwd),
				createLsTool(ctx.cwd),
			];

	const { session } = await createAgentSession({
		cwd: ctx.cwd,
		agentDir,
		model: ctx.model,
		modelRegistry: ctx.modelRegistry,
		settingsManager,
		resourceLoader,
		enableMCP: false,
		enableSoul: false,
		sessionManager: SessionManager.inMemory(ctx.cwd),
		tools,
	});

	try {
		await session.prompt(userPrompt, { source: "extension" });
		return extractAssistantTextFromSession(session);
	} finally {
		await session.abort().catch(() => undefined);
	}
}

function plannerWorker(): TeamWorkerSpec {
	return {
		id: "planner",
		role: "Team Planner",
		mode: "plan",
		task: "Create the multi-agent execution plan.",
		writeAccess: false,
	};
}

async function createPlan(pi: ExtensionAPI, ctx: ExtensionContext, goal: string, mode: TeamCommandMode): Promise<TeamPlan> {
	const planner = plannerWorker();
	const result = await runCliWorker(pi, ctx, planner, goal, buildPlannerPrompt(goal, mode));
	const output = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n");
	const parsed = parsePlan(output);
	return parsed ?? createFallbackPlan(goal, mode);
}

async function runWorker(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	goal: string,
	plan: TeamPlan,
	worker: TeamWorkerSpec,
	previousResults: TeamWorkerResult[],
): Promise<TeamWorkerResult> {
	const workerPrompt = buildWorkerPrompt(goal, worker, plan, previousResults);

	try {
		const nativeOutput = await runNativeWorker(ctx, worker, workerPrompt);
		const parsed = parseWorkerResult(nativeOutput, worker);
		if (parsed.status !== "failed" || parsed.error !== "Missing team-result block") {
			return parsed;
		}
	} catch {
		// Fall back to CLI worker execution below.
	}

	const execResult = await runCliWorker(pi, ctx, worker, goal, workerPrompt);
	const output = [execResult.stdout.trim(), execResult.stderr.trim()].filter(Boolean).join("\n");
	const parsed = parseWorkerResult(output, worker);
	if (execResult.code !== 0 && parsed.status === "success") {
		return {
			...parsed,
			status: "failed",
			error: `Worker exited with code ${execResult.code}`,
		};
	}
	return parsed;
}

async function orchestrateTeamRun(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	goal: string,
	mode: TeamCommandMode,
	onUpdate?: AgentToolUpdateCallback<TeamRunReport>,
): Promise<TeamRunReport> {
	const controller = getController(pi);
	const active = controller.getActive();
	if (!active) {
		throw new Error("No active team run state is available.");
	}

	controller.update({ stage: "planning" });
	persistState(pi, controller.getActive()!);
	syncRunUi(ctx, controller.getActive());
	emitProgressUpdate(onUpdate, controller.getActive(), "Creating the team plan.");
	const plan = await createPlan(pi, ctx, goal, mode);
	controller.update({ plan, stage: "parallel research" });
	persistState(pi, controller.getActive()!);
	syncRunUi(ctx, controller.getActive());
	emitProgressUpdate(
		onUpdate,
		controller.getActive(),
		`Plan ready. Launching ${plan.researchWorkers.length} research worker${plan.researchWorkers.length === 1 ? "" : "s"}.`,
	);

	const researchResults = await Promise.all(
		plan.researchWorkers.map(async (worker) => {
			emitProgressUpdate(
				onUpdate,
				controller.getActive(),
				`Started ${worker.role} (${worker.id}).`,
			);
			const result = await runWorker(pi, ctx, goal, plan, worker, []);
			controller.appendResult(result);
			persistState(pi, controller.getActive()!);
			syncRunUi(ctx, controller.getActive());
			emitProgressUpdate(
				onUpdate,
				controller.getActive(),
				`${worker.role} finished with status ${result.status}.`,
			);
			return result;
		}),
	);

	const allResults = [...researchResults];
	const executionMode = mode === "research" ? "research_only" : plan.executionMode;
	if (executionMode === "implement_and_review") {
		const implementationWorker: TeamWorkerSpec = {
			id: "implementer",
			role: "Implementation Worker",
			mode: "implementation",
			task: plan.implementationTask ?? `Implement the requested changes for: ${goal}`,
			writeAccess: mode === "execute",
		};
		controller.update({ stage: "implementation" });
		persistState(pi, controller.getActive()!);
		syncRunUi(ctx, controller.getActive());
		emitProgressUpdate(onUpdate, controller.getActive(), "Starting the implementation worker.");
		const implementationResult = await runWorker(pi, ctx, goal, plan, implementationWorker, allResults);
		controller.appendResult(implementationResult);
		persistState(pi, controller.getActive()!);
		syncRunUi(ctx, controller.getActive());
		emitProgressUpdate(
			onUpdate,
			controller.getActive(),
			`Implementation worker finished with status ${implementationResult.status}.`,
		);
		allResults.push(implementationResult);

		const reviewWorker: TeamWorkerSpec = {
			id: "reviewer",
			role: "Review Worker",
			mode: "review",
			task: plan.reviewTask ?? `Review the implementation changes for: ${goal}`,
			writeAccess: false,
		};
		controller.update({ stage: "review" });
		persistState(pi, controller.getActive()!);
		syncRunUi(ctx, controller.getActive());
		emitProgressUpdate(onUpdate, controller.getActive(), "Starting the review worker.");
		const reviewResult = await runWorker(pi, ctx, goal, plan, reviewWorker, allResults);
		controller.appendResult(reviewResult);
		persistState(pi, controller.getActive()!);
		syncRunUi(ctx, controller.getActive());
		emitProgressUpdate(
			onUpdate,
			controller.getActive(),
			`Review worker finished with status ${reviewResult.status}.`,
		);
		allResults.push(reviewResult);
	}

	const status =
		allResults.some((result) => result.status === "failed")
			? "failed"
			: allResults.some((result) => result.status === "blocked")
				? "stopped"
				: "completed";

	const provisionalReport: TeamRunReport = {
		id: active.id,
		goal,
		mode,
		status,
		startedAt: active.startedAt,
		finishedAt: Date.now(),
		plan,
		results: allResults,
		finalSummary: "",
	};
	const finalSummary = buildFinalSummary(provisionalReport);
	controller.update({
		stage: "finished",
		status,
		lastWorkerSummary: finalSummary,
	});
	persistState(pi, controller.getActive()!);
	syncRunUi(ctx, controller.getActive());
	emitProgressUpdate(onUpdate, controller.getActive(), `Team run finished with status ${status}.`);
	const report = controller.finish(status, finalSummary);
	if (!report) {
		return { ...provisionalReport, finalSummary };
	}
	return report;
}

function getController(pi: ExtensionAPI): TeamController {
	const key = "__teamController";
	const runtime = pi as ExtensionAPI & { [key: string]: TeamController | undefined };
	if (!runtime[key]) {
		runtime[key] = new TeamController();
	}
	return runtime[key]!;
}

async function handleBackgroundRun(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	goal: string,
	mode: TeamCommandMode,
): Promise<void> {
	const controller = getController(pi);
	const state = controller.start(goal, mode);
	persistState(pi, state);
	const shortGoal = summarizeGoal(goal);
	notify(ctx, `[Team] Started ${state.id}: ${shortGoal}`, "info");
	syncRunUi(ctx, state);

	try {
		const report = await orchestrateTeamRun(pi, ctx, goal, mode);
		report.artifactPath = writeReportArtifact(report, ctx.cwd);
		persistReport(pi, report);
		syncRunUi(ctx, undefined);
		const text = formatReport(report);
		pi.sendMessage({
			customType: TEAM_MESSAGE_TYPE,
			content: formatDisplaySummary(report),
			display: true,
			details: report,
		});
		notify(
			ctx,
			report.status === "completed"
				? `[Team] ${report.id} completed`
				: `[Team] ${report.id} finished with status ${report.status}`,
			report.status === "completed" ? "info" : "warning",
		);
	} catch (error) {
		syncRunUi(ctx, undefined);
		const message = error instanceof Error ? error.message : String(error);
		controller.update({ lastError: message, stage: "failed" });
		const report = controller.finish("failed", message);
		if (report) {
			report.artifactPath = writeReportArtifact(report, ctx.cwd);
			persistReport(pi, report);
		}
		const text = report ? formatReport(report) : `[Team] ${message}`;
		pi.sendMessage({
			customType: TEAM_MESSAGE_TYPE,
			content: report ? formatDisplaySummary(report) : text,
			display: true,
			details: report,
		});
		notify(ctx, `[Team] ${message}`, "error");
	}
}

function reportStatus(pi: ExtensionAPI): string {
	const controller = getController(pi);
	const active = controller.getActive();
	if (active) {
		return formatState(active);
	}
	const last = controller.getLast();
	if (!last) {
		return "[Team] No team run has been started in this session.";
	}
	return formatReport(last);
}

export default async function teamExtension(pi: ExtensionAPI) {
	pi.registerMessageRenderer(TEAM_MESSAGE_TYPE, (message, _options, theme) => {
		const fallbackText =
			typeof message.content === "string"
				? message.content
				: message.content
						.filter((part): part is { type: "text"; text: string } => part.type === "text")
						.map((part) => part.text)
						.join("\n");
		// Background colors that should use theme.bg() instead of theme.fg()
		const bgColors = new Set(["selectedBg", "userMessageBg", "customMessageBg", "toolPendingBg", "toolSuccessBg", "toolErrorBg"]);
		const themeFn = (color: string, text: string) => {
			if (bgColors.has(color)) {
				return theme.bg(color as never, text);
			}
			return theme.fg(color as never, text);
		};
		return renderTeamMessage(message.details, fallbackText, themeFn);
	});

	pi.registerTool({
		name: "team_run",
		label: "Team Run",
		description:
			"Delegate a task to a coordinated team of workers, but only when the user explicitly asked for Agent team or multi-agent execution.",
		guidance:
			"Only use team_run when the user explicitly requested Agent team, multi-agent, or subagent execution. Do not call it proactively.",
		parameters: TEAM_TOOL_PARAMS,
		execute: async (
			_toolCallId: string,
			params: TeamToolParams,
			_signal,
			onUpdate,
			ctx: ExtensionContext,
		): Promise<AgentToolResult<TeamRunReport>> => {
			ensureExplicitTeamTrigger(ctx, params.goal);
			const controller = getController(pi);
			const active = controller.start(params.goal, params.mode ?? "auto");
			persistState(pi, active);
			emitProgressUpdate(onUpdate, active, "Team run started.");
			try {
				const report = await orchestrateTeamRun(
					pi,
					ctx,
					params.goal,
					params.mode ?? "auto",
					onUpdate,
				);
				report.artifactPath = writeReportArtifact(report, ctx.cwd);
				persistReport(pi, report);
				return {
					content: [{ type: "text", text: formatReport(report) }],
					details: report,
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				controller.update({ lastError: message, stage: "failed" });
				emitProgressUpdate(onUpdate, controller.getActive(), message);
				const report = controller.finish("failed", message) ?? {
					id: active.id,
					goal: params.goal,
					mode: params.mode ?? "auto",
					status: "failed" as const,
					startedAt: active.startedAt,
					finishedAt: Date.now(),
					plan: createFallbackPlan(params.goal, params.mode ?? "auto"),
					results: [],
					finalSummary: message,
				};
				report.artifactPath = writeReportArtifact(report, ctx.cwd);
				persistReport(pi, report);
				return {
					content: [{ type: "text", text: formatReport(report) }],
					details: report,
				};
			}
		},
	});

	pi.registerCommand("agent", {
		description: "Agent controls. Use '/agent team ...' to run the Agent team workflow.",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const trimmedArgs = args.trim();
			if (!trimmedArgs || trimmedArgs === "help") {
				const text = buildTeamHelp();
				pi.sendMessage({ customType: TEAM_MESSAGE_TYPE, content: text, display: true });
				return;
			}

			const [subcommand, ...rest] = trimmedArgs.split(/\s+/);
			if (subcommand.toLowerCase() !== "team") {
				const text = buildTeamHelp(`Unknown /agent subcommand: ${subcommand}`);
				pi.sendMessage({ customType: TEAM_MESSAGE_TYPE, content: text, display: true });
				return;
			}

			const parsed = parseTeamCommand(rest.join(" "));
			if (parsed.type === "help") {
				const text = buildTeamHelp(parsed.reason);
				pi.sendMessage({ customType: TEAM_MESSAGE_TYPE, content: text, display: true });
				return;
			}

			if (parsed.type === "status") {
				const text = reportStatus(pi);
				pi.sendMessage({ customType: TEAM_MESSAGE_TYPE, content: text, display: true });
				return;
			}

			if (parsed.type === "stop") {
				const stopped = getController(pi).stop();
				syncRunUi(ctx, undefined);
				const text = stopped ? formatReport(stopped) : "[Team] No active team run is running.";
				pi.sendMessage({ customType: TEAM_MESSAGE_TYPE, content: text, display: true, details: stopped });
				return;
			}

			void handleBackgroundRun(pi, ctx, parsed.goal, parsed.mode).catch((error) => {
				const message = error instanceof Error ? error.message : String(error);
				notify(ctx, `[Team] ${message}`, "error");
			});
		},
	});

	pi.on("session_shutdown", (_event, ctx) => {
		const stopped = getController(pi).stop("Stopped because the session is shutting down.");
		if (stopped) {
			syncRunUi(ctx, undefined);
		}
	});

	pi.on("session_start", (_event, ctx) => {
		const restored = restoreFromSession(pi, ctx);
		if (restored.active) {
			syncRunUi(ctx, restored.active);
			return;
		}
		syncRunUi(ctx, undefined);
		if (restored.last?.artifactPath) {
			const relativeArtifact = relative(ctx.cwd, restored.last.artifactPath);
			notify(ctx, `[Team] Last report available at ${relativeArtifact}`, "info");
		}
	});
}
