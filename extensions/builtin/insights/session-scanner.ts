/**
 * [WHO]: scanAllSessions, entriesToSessionMeta, formatTranscriptForFacets, formatTranscriptWithSummarization, load/saveSessionMeta, load/saveFacets
 * [FROM]: Depends on node:fs/promises, core/session/session-manager, core/lib/ai types, core/lib/agent-core types, ./types
 * [TO]: Consumed by ./insights-engine, ./index
 * [HERE]: extensions/builtin/insights/session-scanner.ts - session JSONL scanning, transcript formatting, meta/facets cache
 *
 * Session scanner — adapts Catui session entries to CC's SessionMeta format.
 *
 * Port of Claude Code src/commands/insights.ts data collection functions:
 * - extractToolStats → entriesToToolStats
 * - logToSessionMeta → entriesToSessionMeta
 * - formatTranscriptForFacets → formatTranscriptForFacets
 * - formatTranscriptWithSummarization → formatTranscriptWithSummarization
 * - scanAllSessions → scanAllSessions
 * - loadCachedSessionMeta / saveSessionMeta
 * - loadCachedFacets / saveFacets
 */

import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname } from "node:path";
import type { SessionEntry, SessionMessageEntry, CompactionEntry } from "../../../core/session/session-manager.js";
import type { AssistantMessage, ToolCall, UserMessage, ToolResultMessage } from "../../../core/lib/ai/src/types.js";
import type { AgentMessage } from "../../../core/lib/agent-core/src/types.js";
import type { SessionMeta, SessionFacets, LiteSessionInfo } from "./types.js";

// ============================================================================
// Constants
// ============================================================================

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
	".ts": "TypeScript",
	".tsx": "TypeScript",
	".js": "JavaScript",
	".jsx": "JavaScript",
	".py": "Python",
	".rb": "Ruby",
	".go": "Go",
	".rs": "Rust",
	".java": "Java",
	".md": "Markdown",
	".json": "JSON",
	".yaml": "YAML",
	".yml": "YAML",
	".css": "CSS",
	".html": "HTML",
	".sql": "SQL",
	".sh": "Shell",
	".bash": "Shell",
	".zsh": "Shell",
	".toml": "TOML",
	".xml": "XML",
	".c": "C",
	".cpp": "C++",
	".h": "C/C++ Header",
	".hpp": "C++ Header",
	".swift": "Swift",
	".kt": "Kotlin",
	".scala": "Scala",
	".php": "PHP",
	".lua": "Lua",
	".r": "R",
	".dart": "Dart",
	".vue": "Vue",
	".svelte": "Svelte",
};

// Cache directory
const CACHE_DIR = "usage-data";
const SESSION_META_DIR = "session-meta";
const FACETS_DIR = "facets";

// ============================================================================
// Tool stats extraction
// ============================================================================

type ToolStats = {
	toolCounts: Record<string, number>;
	languages: Record<string, number>;
	gitCommits: number;
	gitPushes: number;
	inputTokens: number;
	outputTokens: number;
	userInterruptions: number;
	userResponseTimes: number[];
	toolErrors: number;
	toolErrorCategories: Record<string, number>;
	usesTaskAgent: boolean;
	usesMcp: boolean;
	usesWebSearch: boolean;
	usesWebFetch: boolean;
	linesAdded: number;
	linesRemoved: number;
	filesModified: Set<string>;
	messageHours: number[];
	userMessageTimestamps: string[];
};

function extractToolStats(entries: SessionEntry[]): ToolStats {
	const stats: ToolStats = {
		toolCounts: {},
		languages: {},
		gitCommits: 0,
		gitPushes: 0,
		inputTokens: 0,
		outputTokens: 0,
		userInterruptions: 0,
		userResponseTimes: [],
		toolErrors: 0,
		toolErrorCategories: {},
		usesTaskAgent: false,
		usesMcp: false,
		usesWebSearch: false,
		usesWebFetch: false,
		linesAdded: 0,
		linesRemoved: 0,
		filesModified: new Set(),
		messageHours: [],
		userMessageTimestamps: [],
	};

	let lastAssistantTimestamp: number | null = null;

	for (const entry of entries) {
		if (entry.type === "message") {
			const msgEntry = entry as SessionMessageEntry;
			const msg = msgEntry.message;

			if (msg.role === "assistant") {
				const assistant = msg as AssistantMessage;
				// Token usage
				if (assistant.usage) {
					stats.inputTokens += assistant.usage.input || 0;
					stats.outputTokens += assistant.usage.output || 0;
				}
				lastAssistantTimestamp = assistant.timestamp;

				// Tool calls
				if (assistant.content) {
					for (const block of assistant.content) {
						if (block.type === "toolCall") {
							const tc = block as ToolCall;
							const name = tc.name;
							stats.toolCounts[name] = (stats.toolCounts[name] || 0) + 1;

							// Detect special tools (case-insensitive for nP compatibility)
							const nameLower = name.toLowerCase();
							if (nameLower === "agent") stats.usesTaskAgent = true;
							if (name.startsWith("mcp__") || name.startsWith("mcp_")) stats.usesMcp = true;
							if (nameLower === "web_search" || nameLower === "websearch") stats.usesWebSearch = true;
							if (nameLower === "web_fetch" || nameLower === "webfetch") stats.usesWebFetch = true;

							// Extract languages from file paths
							const filePath = tc.arguments?.file_path || tc.arguments?.path || tc.arguments?.command;
							if (filePath && typeof filePath === "string") {
								const ext = extname(filePath).toLowerCase();
								if (ext && EXTENSION_TO_LANGUAGE[ext]) {
									stats.languages[EXTENSION_TO_LANGUAGE[ext]] =
										(stats.languages[EXTENSION_TO_LANGUAGE[ext]] || 0) + 1;
								}
							}

							// Track file modifications (case-insensitive, support nP arg names)
							const editFilePath = tc.arguments?.file_path || tc.arguments?.path;
							if ((nameLower === "edit" || nameLower === "write") && editFilePath) {
								stats.filesModified.add(editFilePath);
							}

							// Count lines added/removed for Edit (nP: oldText/newText, CC: old_string/new_string)
							if (nameLower === "edit" && tc.arguments) {
								const oldStr = tc.arguments.old_string || tc.arguments.oldText || "";
								const newStr = tc.arguments.new_string || tc.arguments.newText || "";
								const oldLines = oldStr.split("\n").length;
								const newLines = newStr.split("\n").length;
								if (newLines > oldLines) stats.linesAdded += newLines - oldLines;
								if (oldLines > newLines) stats.linesRemoved += oldLines - newLines;
							}

							// Count lines added for Write (nP uses 'content' arg)
							if (nameLower === "write" && (tc.arguments?.content || tc.arguments?.file_content)) {
								const content = (tc.arguments.content || tc.arguments.file_content) as string;
								stats.linesAdded += content.split("\n").length;
							}

							// Git operations (case-insensitive)
							if (nameLower === "bash" && tc.arguments?.command) {
								const cmd = tc.arguments.command as string;
								if (/\bgit\s+commit\b/.test(cmd)) stats.gitCommits++;
								if (/\bgit\s+push\b/.test(cmd)) stats.gitPushes++;
							}
						}
					}
				}
			} else if (msg.role === "user") {
				const user = msg as UserMessage;
				// Filter to human messages (not tool_result-only)
				const isHumanMessage =
					typeof user.content === "string"
						? user.content.length > 0
						: user.content.some(
								(c) =>
									c.type === "text" && (c as { text?: string }).text && (c as { text: string }).text.length > 0,
							);

				if (isHumanMessage && user.timestamp) {
					const date = new Date(user.timestamp);
					stats.messageHours.push(date.getHours());
					stats.userMessageTimestamps.push(date.toISOString());

					// Response time (assistant→user gap)
					if (lastAssistantTimestamp) {
						const gapSec = (user.timestamp - lastAssistantTimestamp) / 1000;
						if (gapSec >= 2 && gapSec <= 3600) {
							stats.userResponseTimes.push(gapSec);
						}
					}
				}
			} else if (msg.role === "toolResult") {
				const tr = msg as ToolResultMessage;
				if (tr.isError) {
					stats.toolErrors++;
					// Categorize error
					const errorText = tr.content
						.filter((c): c is { type: "text"; text: string } => c.type === "text")
						.map((c) => c.text)
						.join(" ");
					const category = categorizeError(errorText);
					stats.toolErrorCategories[category] = (stats.toolErrorCategories[category] || 0) + 1;
				}
			}
		}
	}

	return stats;
}

function categorizeError(text: string): string {
	const lower = text.toLowerCase();
	if (lower.includes("permission") || lower.includes("access denied")) return "permission_denied";
	if (lower.includes("not found") || lower.includes("enoent")) return "file_not_found";
	if (lower.includes("syntax") || lower.includes("parse")) return "syntax_error";
	if (lower.includes("timeout") || lower.includes("timed out")) return "timeout";
	if (lower.includes("type error") || lower.includes("typescript")) return "type_error";
	if (lower.includes("network") || lower.includes("fetch")) return "network_error";
	return "other";
}

// ============================================================================
// SessionMeta extraction
// ============================================================================

function countUserMessages(entries: SessionEntry[]): number {
	let count = 0;
	for (const entry of entries) {
		if (entry.type === "message") {
			const msg = (entry as SessionMessageEntry).message;
			if (msg.role === "user") {
				const user = msg as UserMessage;
				const isHumanMessage =
					typeof user.content === "string"
						? user.content.length > 0
						: user.content.some(
								(c) =>
									c.type === "text" && (c as { text?: string }).text && (c as { text: string }).text.length > 0,
							);
				if (isHumanMessage) count++;
			}
		}
	}
	return count;
}

function countAssistantMessages(entries: SessionEntry[]): number {
	let count = 0;
	for (const entry of entries) {
		if (entry.type === "message" && (entry as SessionMessageEntry).message.role === "assistant") {
			count++;
		}
	}
	return count;
}

function getFirstPrompt(entries: SessionEntry[]): string {
	for (const entry of entries) {
		if (entry.type === "message") {
			const msg = (entry as SessionMessageEntry).message;
			if (msg.role === "user") {
				const user = msg as UserMessage;
				if (typeof user.content === "string") return user.content.slice(0, 500);
				const textBlock = user.content.find((c) => c.type === "text");
				if (textBlock && "text" in textBlock) return (textBlock as { text: string }).text.slice(0, 500);
			}
		}
	}
	return "";
}

function getSessionSummary(entries: SessionEntry[]): string | undefined {
	// Look for compaction entries with summaries
	for (const entry of entries) {
		if (entry.type === "compaction") {
			return (entry as CompactionEntry).summary.slice(0, 500);
		}
	}
	return undefined;
}

export function entriesToSessionMeta(
	entries: SessionEntry[],
	sessionId: string,
	projectPath: string,
): SessionMeta {
	const stats = extractToolStats(entries);
	const userMessageCount = countUserMessages(entries);
	const assistantMessageCount = countAssistantMessages(entries);

	// Compute duration from first to last message timestamp
	let startTime = "";
	let endTime = "";
	for (const entry of entries) {
		if (entry.type === "message") {
			const ts = entry.timestamp;
			if (!startTime) startTime = ts;
			endTime = ts;
		}
	}

	const durationMinutes =
		startTime && endTime
			? (new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000
			: 0;

	return {
		session_id: sessionId,
		project_path: projectPath,
		start_time: startTime || new Date().toISOString(),
		duration_minutes: Math.max(0, durationMinutes),
		user_message_count: userMessageCount,
		assistant_message_count: assistantMessageCount,
		tool_counts: stats.toolCounts,
		languages: stats.languages,
		git_commits: stats.gitCommits,
		git_pushes: stats.gitPushes,
		input_tokens: stats.inputTokens,
		output_tokens: stats.outputTokens,
		first_prompt: getFirstPrompt(entries),
		summary: getSessionSummary(entries),
		user_interruptions: stats.userInterruptions,
		user_response_times: stats.userResponseTimes,
		tool_errors: stats.toolErrors,
		tool_error_categories: stats.toolErrorCategories,
		uses_task_agent: stats.usesTaskAgent,
		uses_mcp: stats.usesMcp,
		uses_web_search: stats.usesWebSearch,
		uses_web_fetch: stats.usesWebFetch,
		lines_added: stats.linesAdded,
		lines_removed: stats.linesRemoved,
		files_modified: stats.filesModified.size,
		message_hours: stats.messageHours,
		user_message_timestamps: stats.userMessageTimestamps,
	};
}

// ============================================================================
// Transcript formatting
// ============================================================================

function extractTextFromContent(
	content: string | Array<{ type: string; text?: string; thinking?: string; name?: string }>,
): string {
	if (typeof content === "string") return content;
	return content
		.filter((c) => c.type === "text" && c.text)
		.map((c) => (c as { text: string }).text)
		.join("\n");
}

export function formatTranscriptForFacets(entries: SessionEntry[]): string {
	const lines: string[] = [];

	for (const entry of entries) {
		if (entry.type !== "message") continue;
		const msg = (entry as SessionMessageEntry).message;

		if (msg.role === "user") {
			const text = extractTextFromContent(msg.content);
			if (text.length > 0) {
				lines.push(`[User]: ${text.slice(0, 500)}`);
			}
		} else if (msg.role === "assistant") {
			const assistant = msg as AssistantMessage;
			const textParts: string[] = [];
			for (const block of assistant.content) {
				if (block.type === "text" && "text" in block) {
					textParts.push((block as { text: string }).text);
				} else if (block.type === "toolCall" && "name" in block) {
					textParts.push(`[Tool: ${(block as ToolCall).name}]`);
				}
			}
			const text = textParts.join(" ").slice(0, 300);
			if (text.length > 0) {
				lines.push(`[Assistant]: ${text}`);
			}
		}
	}

	return lines.join("\n");
}

export async function formatTranscriptWithSummarization(
	entries: SessionEntry[],
	completeFn: (systemPrompt: string, userMessage: string) => Promise<string | undefined>,
): Promise<string> {
	const transcript = formatTranscriptForFacets(entries);
	if (transcript.length <= 30000) return transcript;

	// Split into ~25k chunks and summarize each
	const chunks: string[] = [];
	let current = "";
	for (const line of transcript.split("\n")) {
		if (current.length + line.length > 25000) {
			chunks.push(current);
			current = line;
		} else {
			current += (current ? "\n" : "") + line;
		}
	}
	if (current) chunks.push(current);

	const SUMMARIZE_CHUNK_PROMPT = `Summarize this portion of a Catui session transcript. Focus on:
1. What the user asked for
2. What the agent did (tools used, files modified)
3. Any friction or issues
4. The outcome

Keep it concise - 3-5 sentences. Preserve specific details like file names, error messages, and user feedback.

TRANSCRIPT CHUNK:
`;

	const summaries = await Promise.all(
		chunks.map(async (chunk) => {
			const result = await completeFn(SUMMARIZE_CHUNK_PROMPT, chunk);
			return result || chunk.slice(0, 500);
		}),
	);

	return summaries.join("\n---\n");
}

// ============================================================================
// Session scanning
// ============================================================================

export async function scanAllSessions(sessionsDir: string): Promise<LiteSessionInfo[]> {
	if (!existsSync(sessionsDir)) return [];

	const projectDirs = await readdir(sessionsDir, { withFileTypes: true });
	const results: LiteSessionInfo[] = [];

	for (const dir of projectDirs) {
		if (!dir.isDirectory()) continue;
		const projectDir = join(sessionsDir, dir.name);
		try {
			const files = await readdir(projectDir);
			for (const file of files) {
				if (!file.endsWith(".jsonl")) continue;
				const filePath = join(projectDir, file);
				try {
					const fileStat = await stat(filePath);
					// Extract session ID from filename: <timestamp>_<uuid>.jsonl
					const sessionId = file.replace(/\.jsonl$/, "");
					results.push({
						sessionId,
						path: filePath,
						mtime: fileStat.mtimeMs,
						size: fileStat.size,
					});
				} catch {
					// Skip unreadable files
				}
			}
		} catch {
			// Skip unreadable directories
		}
	}

	results.sort((a, b) => b.mtime - a.mtime);
	return results;
}

// ============================================================================
// Cache layer
// ============================================================================

function getCacheDir(agentDir: string, subdir: string): string {
	return join(agentDir, CACHE_DIR, subdir);
}

export async function loadCachedSessionMeta(
	sessionId: string,
	agentDir: string,
): Promise<SessionMeta | null> {
	const path = join(getCacheDir(agentDir, SESSION_META_DIR), `${sessionId}.json`);
	try {
		const raw = await readFile(path, "utf-8");
		return JSON.parse(raw) as SessionMeta;
	} catch {
		return null;
	}
}

export async function saveSessionMeta(meta: SessionMeta, agentDir: string): Promise<void> {
	const dir = getCacheDir(agentDir, SESSION_META_DIR);
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, `${meta.session_id}.json`), JSON.stringify(meta, null, 2), "utf-8");
}

export async function loadCachedFacets(
	sessionId: string,
	agentDir: string,
): Promise<SessionFacets | null> {
	const path = join(getCacheDir(agentDir, FACETS_DIR), `${sessionId}.json`);
	try {
		const raw = await readFile(path, "utf-8");
		const parsed = JSON.parse(raw) as SessionFacets;
		// Validate basic structure
		if (!parsed.session_id || !parsed.underlying_goal) return null;
		return parsed;
	} catch {
		return null;
	}
}

export async function saveFacets(facets: SessionFacets, agentDir: string): Promise<void> {
	const dir = getCacheDir(agentDir, FACETS_DIR);
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, `${facets.session_id}.json`), JSON.stringify(facets, null, 2), "utf-8");
}
