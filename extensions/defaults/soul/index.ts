/**
 * Soul Extension - AI Personality Evolution
 *
 * This extension provides AI personality evolution capabilities for NanoPencil:
 * - Maintains persistent personality state across sessions
 * - Updates expertise based on tool usage patterns
 * - Injects personality into system prompt
 * - Generates memory expression directives
 *
 * This is a DEFAULT extension - automatically loaded with NanoPencil unless disabled.
 */
/**
 * [UPSTREAM]: 
 * [SURFACE]: 
 * [LOCUS]: extensions/defaults/soul/index.ts - 
 * [COVENANT]: Change → update this header
 */

import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname } from "node:path";
import { createRequire } from "node:module";
import type { ExtensionAPI, BeforeAgentStartEvent, BeforeAgentStartEventResult, AgentEndEvent, AgentStartEvent, ExtensionContext } from "../../../core/extensions/types.js";
import { getAgentDir } from "../../../config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Track Soul manager instance
let soulManager: any = null;
let soulInitialized = false;

/**
 * Get bundled Soul candidates
 */
function getBundledSoulCandidates(): string[] {
	return [
		// Bundled path: dist/packages/soul-core (no dist subdirectory)
		join(__dirname, "..", "..", "..", "packages", "soul-core"),
		// From dist/extensions/defaults/soul to dist/packages/soul-core
		join(__dirname, "..", "..", "..", "..", "packages", "soul-core"),
		// Dev workspace runtime (source with dist)
		join(process.cwd(), "packages", "soul-core", "dist"),
	];
}

/**
 * Resolve bundled Soul entry point
 */
function resolveBundledSoulEntry(): string | undefined {
	for (const dir of getBundledSoulCandidates()) {
		const entry = join(dir, "index.js");
		if (existsSync(entry)) return entry;
	}
	return undefined;
}

/**
 * Default Soul configuration for NanoPencil
 */
function getSoulConfig() {
	const envSoulDir = process.env.SOUL_DIR;
	let soulDir = join(getAgentDir(), "soul");

	if (envSoulDir && envSoulDir.trim()) {
		const trimmed = envSoulDir.trim();
		if (trimmed === "~") soulDir = homedir();
		else if (trimmed.startsWith("~/")) soulDir = join(homedir(), trimmed.slice(2));
		else if (trimmed.startsWith("~")) soulDir = join(homedir(), trimmed.slice(1));
		else soulDir = resolve(trimmed);
	}

	return {
		soulDir,
		evolution: {
			natural: 10,
			reflection: 100,
			feedback: 1,
			crisis: 5,
		},
		personalityLimits: {
			maxDelta: 0.05,
			min: 0.1,
			max: 0.9,
		},
		valueLimits: {
			maxDelta: 0.1,
			min: 0.05,
			max: 0.5,
		},
		speakingStyleLimits: {
			maxDelta: 0.05,
			min: 0.1,
			max: 0.9,
		},
		memoryRetention: {
			successes: 500,
			failures: 500,
			patterns: 200,
			decisions: 1000,
		},
	};
}

/**
 * Check if Soul is available
 */
function isSoulAvailable(): boolean {
	// Check bundled version first
	if (resolveBundledSoulEntry()) return true;

	// Fall back to checking node_modules
	try {
		require.resolve("@pencil-agent/soul");
		return true;
	} catch {
		try {
			require.resolve("nanosoul");
			return true;
		} catch {
			return false;
		}
	}
}

/**
 * Initialize Soul manager
 */
async function initSoulManager(): Promise<boolean> {
	if (soulInitialized) return soulManager !== null;

	soulInitialized = true;

	// Try bundled package first
	const bundledEntry = resolveBundledSoulEntry();
	if (bundledEntry) {
		try {
			const bundledUrl = pathToFileURL(bundledEntry).href;
			// @ts-ignore - runtime dynamic import
			const { SoulManager } = await import(bundledUrl);
			soulManager = new SoulManager({ config: getSoulConfig() });
			await soulManager.initialize();
			return true;
		} catch {
			// Continue to node_modules fallback
		}
	}

	// Fall back to node_modules - try @pencil-agent/soul-core first, then @pencil-agent/soul (legacy), then nanosoul
	try {
		// @ts-ignore - runtime dynamic import
		const { SoulManager } = await import("@pencil-agent/soul-core");
		soulManager = new SoulManager({ config: getSoulConfig() });
		await soulManager.initialize();
		return true;
	} catch {
		try {
			// @ts-ignore - runtime dynamic import for backwards compatibility
			const { SoulManager } = await import("@pencil-agent/soul");
			soulManager = new SoulManager({ config: getSoulConfig() });
			await soulManager.initialize();
			return true;
		} catch {
			try {
				// @ts-ignore - runtime dynamic import for backwards compatibility
				const { SoulManager } = await import("nanosoul");
				soulManager = new SoulManager({ config: getSoulConfig() });
				await soulManager.initialize();
				return true;
			} catch {
				return false;
			}
		}
	}
}

/**
 * Convert NanoPencil context to Soul InteractionContext
 */
function toSoulContext(
	project: string,
	tags: string[],
	complexity: number,
	toolUsage: Record<string, number>,
	userFeedback?: { rating?: number; comment?: string },
): any {
	return {
		project,
		tags,
		complexity,
		toolUsage,
		userFeedback: userFeedback
			? {
					rating: userFeedback.rating || 5,
					comment: userFeedback.comment,
				}
			: undefined,
		timestamp: new Date(),
	};
}

/**
 * Extract rich context from recent session messages for Soul injection.
 */
function extractSessionContext(
	messages: any[],
): { tags: string[]; complexity: number; toolUsage: Record<string, number> } {
	const toolUsage: Record<string, number> = {};
	const fileExtensions = new Set<string>();
	let totalToolCalls = 0;
	let userMessageCount = 0;

	// Scan recent messages (last 30 to keep it fast)
	const recent = messages.slice(-30);

	for (const msg of recent) {
		if (msg.role === "user") {
			userMessageCount++;
		}
		if (msg.role === "assistant" && Array.isArray(msg.content)) {
			for (const block of msg.content) {
				if (block.type === "toolUse" || block.type === "tool_call") {
					const name: string = block.toolName || block.name || "unknown";
					toolUsage[name] = (toolUsage[name] || 0) + 1;
					totalToolCalls++;

					// Extract file extensions from tool arguments
					const args = block.args || block.input;
					if (args) {
						const filePath: string | undefined =
							args.file_path || args.filePath || args.path || args.pattern;
						if (typeof filePath === "string") {
							const extMatch = filePath.match(/\.([a-zA-Z0-9]+)$/);
							if (extMatch) fileExtensions.add(extMatch[1].toLowerCase());
						}
					}
				}
			}
		}
	}

	// Derive tags from file extensions
	const extTagMap: Record<string, string> = {
		ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
		py: "python", rs: "rust", go: "golang", java: "java",
		css: "styling", scss: "styling", html: "web",
		json: "config", yaml: "config", yml: "config", toml: "config",
		md: "documentation", sql: "database", prisma: "database",
		test: "testing", spec: "testing",
		sh: "scripting", bash: "scripting",
	};
	const tags = new Set<string>();
	for (const ext of fileExtensions) {
		if (extTagMap[ext]) tags.add(extTagMap[ext]);
	}

	// Infer tags from tool usage patterns
	if (toolUsage["bash"] && toolUsage["bash"] > 2) tags.add("shell-heavy");
	if (toolUsage["edit"] && toolUsage["edit"] > 3) tags.add("refactor");
	if (toolUsage["write"]) tags.add("feature");
	if (toolUsage["grep"] || toolUsage["find"]) tags.add("exploration");

	// Estimate complexity: 0-1 based on message count + tool calls + file diversity
	const complexity = Math.min(
		1,
		(userMessageCount * 0.1 + totalToolCalls * 0.03 + fileExtensions.size * 0.08),
	);

	return {
		tags: Array.from(tags),
		complexity: Math.round(complexity * 100) / 100,
		toolUsage,
	};
}

/**
 * Extension factory function
 */
export default async function soulExtension(pi: ExtensionAPI) {
	// Check if Soul is available
	if (!isSoulAvailable()) {
		console.warn("[soul] Soul not available (soul package not installed). Skipping...");
		return;
	}

	// Initialize Soul manager
	const initialized = await initSoulManager();
	if (!initialized) {
		console.warn("[soul] Failed to initialize Soul manager.");
		return;
	}

	console.error("[soul] Soul extension loaded successfully.");

	// Register event handlers

	// agent_start: Initialize personality
	pi.on("agent_start", async (_event: AgentStartEvent, _ctx) => {
		if (!soulManager) return;

		try {
			await soulManager.onAgentStart?.();
		} catch (error) {
			console.warn(`[soul] Error in agent_start handler: ${error}`);
		}
	});

	// before_agent_start: Inject personality into system prompt
	pi.on("before_agent_start", async (event: BeforeAgentStartEvent, ctx: ExtensionContext): Promise<BeforeAgentStartEventResult | undefined> => {
		if (!soulManager) return;

		try {
			// Use cwd as project identifier
			const project = ctx.cwd.split(/[/\\]/).pop() || "general";

			// Create Soul context with basic info
			const context = toSoulContext(project, [], 0, {});

			// Generate personality injection
			const injection = soulManager.generateInjection?.(context);
			const memoryDirective = soulManager.generateMemoryExpressionDirective?.();

			// Return system prompt additions
			if (injection || memoryDirective) {
				let systemPromptAddition = "";

				if (injection) {
					systemPromptAddition += `\n\n${injection}`;
				}

				if (memoryDirective) {
					systemPromptAddition += `\n\n${memoryDirective}`;
				}

				return {
					systemPrompt: systemPromptAddition,
				};
			}
		} catch (error) {
			console.warn(`[soul] Error in before_agent_start handler: ${error}`);
		}

		return undefined;
	});

	// agent_end: Update expertise based on session outcome
	pi.on("agent_end", async (event: AgentEndEvent, ctx: ExtensionContext) => {
		if (!soulManager) return;

		try {
			// Use cwd as project identifier
			const project = ctx.cwd.split(/[/\\]/).pop() || "general";

			// Extract outcome from messages - use any type to avoid type complexity
			const messages = event.messages as any[];
			let outcome: "success" | "failure" = "success";

			// Check for errors in tool results
			for (const msg of messages) {
				if (msg.role === "toolResult" && msg.content) {
					for (const block of msg.content) {
						if (block.type === "text" && block.text?.toLowerCase().includes("error")) {
							outcome = "failure";
							break;
						}
					}
				}
				if (outcome === "failure") break;
			}

			// Extract context - pass as any to avoid type issues
			const { tags, complexity, toolUsage } = extractSessionContext(messages);

			// Update expertise
			const context = toSoulContext(
				project,
				tags,
				complexity,
				toolUsage,
			);

			await soulManager.updateExpertise?.(context, outcome === "success");

			// Trigger evolution if needed
			await soulManager.evolve?.();
		} catch (error) {
			console.warn(`[soul] Error in agent_end handler: ${error}`);
		}
	});
}
