/**
 * [WHO]: linkWorldExtension - registers link_world_admin/link_world_exec tools, /link-world command, runtime diagnostics, and internet-search skill resources
 * [FROM]: Depends on node:child_process, node:fs, node:path, node:url, @sinclair/typebox, @pencil-agent/tui, core/extensions-host/types
 * [TO]: Loaded by core/extensions-host/loader.ts as extension entry point
 * [HERE]: extensions/builtin/link-world/index.ts - built-in internet access bootstrap, execution bridge, and workspace discovery
 */

import { execFile, execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Type, type Static } from "@sinclair/typebox";
import { Box, Container, Spacer, Text } from "@pencil-agent/tui";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ResourcesDiscoverEvent,
	ResourcesDiscoverResult,
	ToolDefinition,
} from "../../../core/extensions-host/types.js";
import { getLinkWorldWorkspaceDir } from "../../../config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOC_PATH = join(__dirname, "linkworld.md");
const SKILL_PATH = join(__dirname, "internet-search", "internet-search.md");
const AGENT_SKILL_PATH = join(__dirname, "link-world-agent.md");
const NETWORK_ROUTING_SKILL_PATH = join(__dirname, "network-routing", "network-routing.md");
const WORKSPACE_TEMPLATE_PATH = join(__dirname, "agent-workspace");

const LINK_WORLD_CUSTOM_TYPE = "link-world-install";
const DEFAULT_TIMEOUT_SECONDS = 120;
const LINK_WORLD_COMMAND_COMPLETIONS = [
	{ value: "status", label: "status", description: "Show installed internet-access capabilities" },
	{ value: "doctor", label: "doctor", description: "Run agent-reach doctor diagnostics" },
	{ value: "version", label: "version", description: "Show installed agent-reach version" },
	{ value: "install", label: "install", description: "Show bundled installation guidance" },
	{ value: "workspace", label: "workspace", description: "Show the link-world workspace path" },
	{ value: "help", label: "help", description: "Show link-world commands" },
];

const LinkWorldAdminInputSchema = Type.Object(
	{
		action: Type.Union([
			Type.Literal("status"),
			Type.Literal("doctor"),
			Type.Literal("version"),
			Type.Literal("install_help"),
		]),
		timeout: Type.Optional(Type.Number({ description: "Timeout in seconds. Defaults to 120." })),
	},
	{ additionalProperties: false },
);

const LinkWorldExecInputSchema = Type.Object(
	{
		args: Type.Array(Type.String(), {
			description:
				"Arguments passed to the external `agent-reach` CLI, for example [\"search\", \"OpenAI Responses API\"] or [\"doctor\"].",
		}),
		timeout: Type.Optional(Type.Number({ description: "Timeout in seconds. Defaults to 120." })),
	},
	{ additionalProperties: false },
);

const WebSearchInputSchema = Type.Object(
	{
		query: Type.String({ description: "Search query to send through link-world." }),
		provider: Type.Optional(Type.String({ description: "Optional provider or site hint, if the downstream runtime supports it." })),
		limit: Type.Optional(Type.Number({ description: "Optional result count hint, if the downstream runtime supports it." })),
		timeout: Type.Optional(Type.Number({ description: "Timeout in seconds. Defaults to 120." })),
	},
	{ additionalProperties: false },
);

const WebFetchInputSchema = Type.Object(
	{
		url: Type.String({ description: "URL to fetch through link-world." }),
		provider: Type.Optional(Type.String({ description: "Optional provider or site hint, if the downstream runtime supports it." })),
		timeout: Type.Optional(Type.Number({ description: "Timeout in seconds. Defaults to 120." })),
	},
	{ additionalProperties: false },
);

type LinkWorldAdminInput = Static<typeof LinkWorldAdminInputSchema>;
type LinkWorldExecInput = Static<typeof LinkWorldExecInputSchema>;
type WebSearchInput = Static<typeof WebSearchInputSchema>;
type WebFetchInput = Static<typeof WebFetchInputSchema>;

interface CliResult {
	exitCode: number | null;
	output: string;
}

interface LinkWorldCapabilities {
	search: boolean;
	fetch: boolean;
}

function linkWorldWorkspacePath(): string {
	return getLinkWorldWorkspaceDir();
}

function ensureLinkWorldWorkspace(): string {
	const target = linkWorldWorkspacePath();
	if (!existsSync(target)) {
		mkdirSync(target, { recursive: true });
		if (existsSync(WORKSPACE_TEMPLATE_PATH)) {
			cpSync(WORKSPACE_TEMPLATE_PATH, target, { recursive: true });
		} else {
			mkdirSync(target, { recursive: true });
		}
	}
	return target;
}

function collectMarkdownFiles(root: string): string[] {
	if (!existsSync(root)) {
		return [];
	}

	const out: string[] = [];
	for (const entry of readdirSync(root)) {
		const fullPath = join(root, entry);
		const stats = statSync(fullPath);
		if (stats.isDirectory()) {
			out.push(...collectMarkdownFiles(fullPath));
			continue;
		}
		if (entry.endsWith(".md")) {
			out.push(fullPath);
		}
	}
	return out.sort();
}

function getInstallDoc(): string {
	try {
		return readFileSync(DOC_PATH, "utf-8");
	} catch {
		return "";
	}
}

function isAgentReachInstalled(): boolean {
	try {
		execSync("agent-reach --version", { encoding: "utf-8", stdio: "pipe" });
		return true;
	} catch {
		return false;
	}
}

function getAgentReachHelpText(): string {
	try {
		return execSync("agent-reach --help", { encoding: "utf-8", stdio: "pipe" });
	} catch {
		return "";
	}
}

function getLinkWorldCapabilities(): LinkWorldCapabilities {
	if (!isAgentReachInstalled()) {
		return { search: false, fetch: false };
	}

	const help = getAgentReachHelpText().toLowerCase();
	return {
		search: /\bsearch\b/.test(help),
		fetch: /\bfetch\b/.test(help),
	};
}

function execAgentReach(args: string[], timeoutSeconds: number, signal?: AbortSignal): Promise<CliResult> {
	return new Promise((resolve, reject) => {
		execFile(
			"agent-reach",
			args,
			{
				timeout: timeoutSeconds * 1000,
				windowsHide: true,
				signal,
				maxBuffer: 1024 * 1024,
				encoding: "utf-8",
			},
			(error, stdout, stderr) => {
				const output = [stdout, stderr].filter(Boolean).join("").trim() || "(no output)";
				if (error) {
					const anyError = error as NodeJS.ErrnoException & { code?: string | number };
					if (anyError.code === "ENOENT") {
						reject(new Error("agent-reach is not installed"));
						return;
					}
					resolve({
						exitCode: typeof anyError.code === "number" ? anyError.code : 1,
						output,
					});
					return;
				}

				resolve({
					exitCode: 0,
					output,
				});
			},
		);
	});
}

// ============================================================================
// Native fallback: zero-config web access (no agent-reach needed)
// Tries multiple providers in order: Jina → DuckDuckGo → direct fetch
// ============================================================================

const JINA_READER_BASE = "https://r.jina.ai";
const JINA_SEARCH_BASE = "https://s.jina.ai";
const NATIVE_TIMEOUT_MS = 30_000;

/** Try Jina Reader → direct fetch for page content */
async function nativeWebFetch(url: string, signal?: AbortSignal): Promise<string> {
	const targetUrl = url.startsWith("http") ? url : `https://${url}`;
	const fallbackSignal = signal ?? AbortSignal.timeout(NATIVE_TIMEOUT_MS);

	// 1. Try Jina Reader (returns clean markdown)
	try {
		const res = await fetch(`${JINA_READER_BASE}/${targetUrl}`, {
			signal: fallbackSignal,
			headers: { Accept: "text/markdown" },
		});
		if (res.ok) {
			const text = await res.text();
			if (text.trim()) return text;
		}
	} catch {
		// Jina unavailable, fall through
	}

	// 2. Direct fetch + basic HTML-to-text
	try {
		const res = await fetch(targetUrl, { signal: fallbackSignal });
		if (!res.ok) {
			throw new Error(`HTTP ${res.status}: ${res.statusText}`);
		}
		const html = await res.text();
		return htmlToPlainText(html, targetUrl);
	} catch (err) {
		throw new Error(`Failed to fetch ${targetUrl}: ${err instanceof Error ? err.message : err}`);
	}
}

/** Try Jina Search → DuckDuckGo HTML for search results */
async function nativeWebSearch(query: string, limit: number, signal?: AbortSignal): Promise<string> {
	const fallbackSignal = signal ?? AbortSignal.timeout(NATIVE_TIMEOUT_MS);
	// 1. Try Jina Search (returns structured markdown)
	try {
		const params = new URLSearchParams({ q: query });
		if (limit > 0) params.set("num", String(Math.min(limit, 10)));
		const res = await fetch(`${JINA_SEARCH_BASE}?${params}`, {
			signal: fallbackSignal,
			headers: { Accept: "text/markdown" },
		});
		if (res.ok) {
			const text = await res.text();
			if (text.trim()) return text;
		}
	} catch {
		// Jina unavailable, fall through
	}

	// 2. Try DuckDuckGo HTML
	try {
		const params = new URLSearchParams({ q: query });
		const res = await fetch(`https://html.duckduckgo.com/html/?${params}`, {
			signal: fallbackSignal,
			headers: { "User-Agent": "Mozilla/5.0 (compatible; NanoPencil/1.0)" },
		});
		if (res.ok) {
			const html = await res.text();
			const results = parseDuckDuckGoResults(html, limit || 5);
			if (results.length > 0) return results;
		}
	} catch {
		// DDG unavailable, fall through
	}

	// 3. Try DuckDuckGo Instant Answer API
	try {
		const params = new URLSearchParams({ q: query, format: "json", no_html: "1" });
		const res = await fetch(`https://api.duckduckgo.com/?${params}`, { signal: fallbackSignal });
		if (res.ok) {
			const data = (await res.json()) as Record<string, unknown>;
			const abstract = typeof data.AbstractText === "string" ? data.AbstractText : "";
			const source = typeof data.AbstractSource === "string" ? data.AbstractSource : "";
			const url = typeof data.AbstractURL === "string" ? data.AbstractURL : "";
			if (abstract) {
				return [`## ${query}`, "", abstract, source ? `Source: ${source}` : "", url ? `URL: ${url}` : ""].filter(Boolean).join("\n");
			}
		}
	} catch {
		// API unavailable
	}

	throw new Error(`Search failed for "${query}": all providers returned errors. Check your network connection.`);
}

// ============================================================================
// HTML helpers (minimal, no external dependencies)
// ============================================================================

/** Strip HTML tags and decode entities to get readable text */
function htmlToPlainText(html: string, baseUrl: string): string {
	let text = html;
	// Remove script/style/nav/header/footer
	text = text.replace(/<(script|style|nav|header|footer|noscript)[^>]*>[\s\S]*?<\/\1>/gi, "");
	// Remove HTML tags
	text = text.replace(/<[^>]+>/g, " ");
	// Decode common entities
	text = text
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&nbsp;/g, " ");
	// Collapse whitespace
	text = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
	return `# Content from ${baseUrl}\n\n${text}`;
}

/** Extract search results from DuckDuckGo HTML response */
function parseDuckDuckGoResults(html: string, limit: number): string {
	const results: string[] = [];
	const linkRegex = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
	const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

	const links: Array<{ url: string; title: string }> = [];
	const snippets: string[] = [];

	let match;
	while ((match = linkRegex.exec(html)) !== null) {
		const rawUrl = match[1];
		const title = match[2].replace(/<[^>]+>/g, "").trim();
		// DDG wraps URLs in a redirect; extract the actual URL
		const urlMatch = rawUrl.match(/uddg=([^&]+)/);
		const url = urlMatch ? decodeURIComponent(urlMatch[1]) : rawUrl;
		if (title) links.push({ url, title });
	}
	while ((match = snippetRegex.exec(html)) !== null) {
		const snippet = match[1].replace(/<[^>]+>/g, "").trim();
		if (snippet) snippets.push(snippet);
	}

	for (let i = 0; i < Math.min(links.length, limit); i++) {
		const entry = [`### ${links[i].title}`, links[i].url];
		if (snippets[i]) entry.push(snippets[i]);
		results.push(entry.join("\n"));
	}

	return results.length > 0 ? results.join("\n\n") : "";
}

function installHelpText(): string {
	const doc = getInstallDoc();
	if (doc) {
		return [
			"link-world is not bundled yet, so installation still targets the external `agent-reach` runtime.",
			"",
			"Use this document as the source of truth:",
			"",
			doc,
		].join("\n");
	}

	return [
		"link-world is not bundled yet, and the local install guide is missing.",
		"Use the official install document:",
		"https://raw.githubusercontent.com/Panniantong/agent-reach/main/docs/install.md",
	].join("\n");
}

function getStatusText(): string {
	const capabilities = getLinkWorldCapabilities();
	const installed = isAgentReachInstalled();
	const lines = [
		"Link-world status",
		"",
		`agent-reach installed: ${installed ? "yes" : "no (native fallback active)"}`,
		`internet-search skill bundled: ${existsSync(SKILL_PATH) ? "yes" : "no"}`,
		`agent guidance bundled: ${existsSync(AGENT_SKILL_PATH) ? "yes" : "no"}`,
		`web_search: ${capabilities.search ? "agent-reach" : "native (Jina Search)"}`,
		`web_fetch: ${capabilities.fetch ? "agent-reach" : "native (Jina Reader)"}`,
	];

	if (!installed) {
		lines.push("");
		lines.push("Native fallback provides basic search and page fetching without agent-reach.");
		lines.push("For advanced platform channels (Twitter, YouTube, etc.), run `/link-world install`.");
	}

	return lines.join("\n");
}

function createLinkWorldAdminTool(): ToolDefinition<typeof LinkWorldAdminInputSchema> {
	return {
		name: "link_world_admin",
		label: "link-world admin",
		description:
			"Inspect or troubleshoot the built-in link-world integration. Use for install guidance, version checks, and agent-reach doctor/status commands.",
		parameters: LinkWorldAdminInputSchema,
		guidance:
			"Use this before attempting internet tasks if you are unsure whether agent-reach is installed. Prefer action=status or action=doctor for diagnostics.",
		execute: async (_toolCallId, input: LinkWorldAdminInput, signal) => {
			if (input.action === "install_help") {
				return {
					content: [{ type: "text", text: installHelpText() }],
					details: null,
				};
			}

			if (input.action === "status") {
				return {
					content: [{ type: "text", text: getStatusText() }],
					details: null,
				};
			}

			if (!isAgentReachInstalled()) {
				throw new Error(`${getStatusText()}\n\n${installHelpText()}`);
			}

			const cliArgs = input.action === "doctor" ? ["doctor"] : ["--version"];
			const result = await execAgentReach(cliArgs, input.timeout ?? DEFAULT_TIMEOUT_SECONDS, signal);
			if (result.exitCode && result.exitCode !== 0) {
				throw new Error(result.output);
			}

			return {
				content: [{ type: "text", text: result.output }],
				details: { exitCode: result.exitCode },
			};
		},
	};
}

function createLinkWorldExecTool(): ToolDefinition<typeof LinkWorldExecInputSchema> {
	return {
		name: "link_world_exec",
		label: "link-world exec",
		description:
			"Execute the external `agent-reach` CLI through NanoPencil. Use this for actual internet tasks once link-world is installed, instead of going through the bash tool.",
		parameters: LinkWorldExecInputSchema,
		guidance:
			"Use `link_world_admin` first if you are unsure whether agent-reach is installed. Pass explicit CLI arguments, not a shell string. Prefer site or domain skills before inventing new agent-reach commands.",
		execute: async (_toolCallId, input: LinkWorldExecInput, signal) => {
			if (!isAgentReachInstalled()) {
				throw new Error(`${getStatusText()}\n\n${installHelpText()}`);
			}

			if (input.args.length === 0) {
				throw new Error("link_world_exec requires at least one CLI argument");
			}

			const result = await execAgentReach(input.args, input.timeout ?? DEFAULT_TIMEOUT_SECONDS, signal);
			if (result.exitCode && result.exitCode !== 0) {
				throw new Error(result.output);
			}

			return {
				content: [{ type: "text", text: result.output }],
				details: { exitCode: result.exitCode, args: input.args },
			};
		},
	};
}

function createWebSearchTool(): ToolDefinition<typeof WebSearchInputSchema> {
	return {
		name: "web_search",
		label: "web search",
		description:
			"High-level internet search through link-world. Prefer this for normal search tasks instead of constructing raw agent-reach argv yourself.",
		parameters: WebSearchInputSchema,
		guidance:
			"Use this for ordinary web search and lightweight research tasks. Use link_world_exec only when you need a lower-level agent-reach command that this tool does not model.",
		execute: async (_toolCallId, input: WebSearchInput, signal) => {
			// Try agent-reach first if installed with search capability
			if (isAgentReachInstalled() && getLinkWorldCapabilities().search) {
				const args = ["search", input.query];
				if (input.provider) {
					args.push("--provider", input.provider);
				}
				if (typeof input.limit === "number" && Number.isFinite(input.limit)) {
					args.push("--limit", String(input.limit));
				}

				const result = await execAgentReach(args, input.timeout ?? DEFAULT_TIMEOUT_SECONDS, signal);
				if (result.exitCode && result.exitCode !== 0) {
					throw new Error(result.output);
				}

				return {
					content: [{ type: "text", text: result.output }],
					details: { exitCode: result.exitCode, args },
				};
			}

			// Native fallback: Jina Search (zero-config, no dependencies)
			const limit = typeof input.limit === "number" && Number.isFinite(input.limit) ? input.limit : 5;
			const text = await nativeWebSearch(input.query, limit, signal);
			return {
				content: [{ type: "text", text }],
				details: { fallback: "jina", query: input.query },
			};
		},
	};
}

function createWebFetchTool(): ToolDefinition<typeof WebFetchInputSchema> {
	return {
		name: "web_fetch",
		label: "web fetch",
		description:
			"High-level URL fetch through link-world. Prefer this when the user already has a target page or endpoint and needs its content.",
		parameters: WebFetchInputSchema,
		guidance:
			"Use this when the user provides a URL or when a prior search result should be fetched directly. If the task requires page interaction, use the browser tool family instead.",
		execute: async (_toolCallId, input: WebFetchInput, signal) => {
			// Try agent-reach first if installed with fetch capability
			if (isAgentReachInstalled() && getLinkWorldCapabilities().fetch) {
				const args = ["fetch", input.url];
				if (input.provider) {
					args.push("--provider", input.provider);
				}

				const result = await execAgentReach(args, input.timeout ?? DEFAULT_TIMEOUT_SECONDS, signal);
				if (result.exitCode && result.exitCode !== 0) {
					throw new Error(result.output);
				}

				return {
					content: [{ type: "text", text: result.output }],
					details: { exitCode: result.exitCode, args },
				};
			}

			// Native fallback: Jina Reader (zero-config, no dependencies)
			const text = await nativeWebFetch(input.url, signal);
			return {
				content: [{ type: "text", text }],
				details: { fallback: "jina", url: input.url },
			};
		},
	};
}

export default function linkWorldExtension(api: ExtensionAPI) {
	api.registerMessageRenderer(LINK_WORLD_CUSTOM_TYPE, (message, _options, theme) => {
		const box = new Box(1, 1, (t) => theme.bg("customMessageBg", t));
		const label = theme.fg("customMessageLabel", "\x1b[1m[link-world]\x1b[22m ");
		const text = theme.fg("customMessageText", String(message.content ?? ""));
		box.addChild(new Text(label + text, 0, 0));
		box.addChild(new Spacer(1));
		const container = new Container();
		container.addChild(new Spacer(1));
		container.addChild(box);
		return container;
	});

	api.registerTool(createLinkWorldAdminTool());
	api.registerTool(createLinkWorldExecTool());
	api.registerTool(createWebSearchTool());
	api.registerTool(createWebFetchTool());

	api.on("session_start", (_event, ctx) => {
		ensureLinkWorldWorkspace();
	});

	api.registerCommand("link-world", {
		description: "Set up or inspect internet access tools",
		getArgumentCompletions: (argumentPrefix, context) => {
			if (context && context.tokenIndex > 0) return null;
			const prefix = argumentPrefix.trim().toLowerCase();
			const values = LINK_WORLD_COMMAND_COMPLETIONS.filter((item) => item.value.startsWith(prefix));
			return values.length > 0 ? values : null;
		},
		handler: async (args: string, _ctx: ExtensionCommandContext) => {
			const action = (args.trim().split(/\s+/)[0] || "help").toLowerCase();

			if (action === "help") {
				const mode = isAgentReachInstalled() ? "agent-reach" : "native (Jina)";
				api.sendMessage({
					customType: LINK_WORLD_CUSTOM_TYPE,
					content: [
						"Link-world is NanoPencil's built-in internet access integration point.",
						"",
						`Mode: ${mode}`,
						"",
						"Commands:",
						"/link-world status  - show whether agent-reach is installed and whether skills are bundled",
						"/link-world doctor  - run `agent-reach doctor`",
						"/link-world version - print the installed agent-reach version",
						"/link-world install - show the bundled installation guide",
						"/link-world workspace - show the project-local link-world workspace",
						"",
						"Tools: `web_search`, `web_fetch`, `link_world_admin`, `link_world_exec`",
					].join("\n"),
					display: true,
				});
				return;
			}

			if (action === "workspace") {
				api.sendMessage({
					customType: LINK_WORLD_CUSTOM_TYPE,
					content: `Link-world workspace: ${resolve(ensureLinkWorldWorkspace())}`,
					display: true,
				});
				return;
			}

			if (action === "install") {
				api.sendMessage({
					customType: LINK_WORLD_CUSTOM_TYPE,
					content: installHelpText(),
					display: true,
				});
				return;
			}

			if (action === "status") {
				api.sendMessage({
					customType: LINK_WORLD_CUSTOM_TYPE,
					content: getStatusText(),
					display: true,
				});
				return;
			}

			if (action === "doctor" || action === "version") {
				if (!isAgentReachInstalled()) {
					api.sendMessage({
						customType: LINK_WORLD_CUSTOM_TYPE,
						content: `${getStatusText()}\n\n${installHelpText()}`,
						display: true,
					});
					return;
				}

				const result = await execAgentReach(action === "doctor" ? ["doctor"] : ["--version"], DEFAULT_TIMEOUT_SECONDS);
				api.sendMessage({
					customType: LINK_WORLD_CUSTOM_TYPE,
					content: result.output,
					display: true,
				});
				return;
			}

			api.sendMessage({
				customType: LINK_WORLD_CUSTOM_TYPE,
				content: "Usage: /link-world [help|status|doctor|version|install|workspace]",
				display: true,
			});
		},
	});

	api.on("resources_discover", async (_event: ResourcesDiscoverEvent): Promise<ResourcesDiscoverResult> => {
		const workspace = ensureLinkWorldWorkspace();
		const skillPaths = [
			...new Set([
				NETWORK_ROUTING_SKILL_PATH,
				AGENT_SKILL_PATH,
				SKILL_PATH,
				// DOC_PATH (linkworld.md) is an install guide, not a skill: it has no
				// frontmatter and would fail skill validation if registered here.
				...collectMarkdownFiles(join(workspace, "domain-skills")),
			].filter((path) => existsSync(path))),
		];
		return skillPaths.length ? { skillPaths } : {};
	});
}
