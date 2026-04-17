/**
 * [WHO]: PlanFileManager class, getPlansDirectory(), getPlanFilePath(), getPlan(), getPlanSlug()
 * [FROM]: Depends on node:fs, node:path, node:os, core/extensions/types (EventBus)
 * [TO]: Consumed by plan extension tools, workflow prompts, permission gating
 * [HERE]: extensions/defaults/plan/plan-file-manager.ts - plan file path management and I/O
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import type { PlanSessionState, PlanStateMap } from "./types.js";

// ============================================================================
// Word lists for slug generation
// ============================================================================

const ADJECTIVES = [
	"gentle", "swift", "bright", "calm", "deep", "eager", "fair", "grand",
	"keen", "light", "bold", "warm", "wise", "free", "pure", "rich",
	"safe", "sure", "tall", "vast", "wild", "zany", "noble", "proud",
	"brave", "clever", "daring", "elegant", "fierce", "graceful", "humble",
	"nimble", "rapid", "sharp", "silent", "solid", "steady", "strong",
	"subtle", "super", "vivid", "witty", "active", "agile", "ample",
	"brisk", "cosmic", "curious", "digital", "distant", "divine", "epic",
	"famous", "fancy", "flying", "galactic", "golden", "happy", "holy",
	"huge", "jolly", "jumpy", "lively", "lucky", "magic", "major",
	"merry", "mighty", "modern", "mystic", "native", "orange", "peaceful",
	"perfect", "pink", "polar", "polite", "prime", "purple", "quick",
	"quiet", "random", "rare", "real", "red", "royal", "sacred",
	"shiny", "simple", "sleek", "smart", "smooth", "soft", "sparse",
	"speedy", "stellar", "sunny", "sweet", "tender", "tiny", "top",
	"ultra", "unique", "urban", "vital", "white", "wonder", "young",
];

const NOUNS = [
	"engelbart", "hopper", "lovelace", "turing", "knuth", "dijkstra",
	"pascal", "bayes", "fourier", "gauss", "hilbert", "neumann",
	"boole", "shannon", "pearl", "minsky", "mccarthy", "ritchie",
	"thompson", "torvalds", "berners-lee", "hamilton", "lampson",
	"kay", "gosling", "wall", "matz", "ikea", "nova",
	"echo", "flux", "prism", "orbit", "pulse", "spark",
	"drift", "crest", "peak", "tide", "wave", "breeze",
	"stone", "forge", "bridge", "canyon", "delta", "ember",
	"falcon", "grove", "harbor", "ivory", "jewel", "knot",
	"lunar", "maple", "nexus", "oasis", "phoenix", "quest",
	"raven", "summit", "trail", "unity", "vertex", "willow",
	"atlas", "beacon", "comet", "dusk", "eagle", "flame",
	"globe", "horizon", "iris", "jade", "kite", "lotus",
	"meteor", "nebula", "oak", "panda", "quartz", "reef",
	"star", "tiger", "umbra", "vortex", "wolf", "zenith",
];

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PLANS_DIR = join(homedir(), ".nanopencil", "plans");
const MAX_SLUG_RETRIES = 10;

// ============================================================================
// State management
// ============================================================================

const stateByBus: PlanStateMap = new WeakMap();

export function getPlanSessionState(bus: unknown): PlanSessionState {
	const eventBus = bus as any;
	let state = stateByBus.get(eventBus);
	if (!state) {
		state = {
			state: {
				mode: "default",
				prePlanMode: "default",
				needsPlanModeExitAttachment: false,
				hasExitedPlanModeInSession: false,
				planAttachmentCount: 0,
			},
			planSlugCache: undefined,
		};
		stateByBus.set(eventBus, state);
	}
	return state;
}

// ============================================================================
// Slug generation
// ============================================================================

export function generatePlanSlug(): string {
	const adj1 = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
	const adj2 = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
	const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
	return `${adj1}-${adj2}-${noun}`;
}

// ============================================================================
// Plans directory
// ============================================================================

let cachedPlansDir: string | undefined;

export function getPlansDirectory(settingsPlansDir?: string, cwd?: string): string {
	if (cachedPlansDir) return cachedPlansDir;

	if (settingsPlansDir && cwd) {
		const resolved = resolve(cwd, settingsPlansDir);
		if (!resolved.startsWith(cwd + sep) && resolved !== cwd) {
			// Out of project root, fall back to default
			cachedPlansDir = DEFAULT_PLANS_DIR;
		} else {
			mkdirSync(resolved, { recursive: true });
			cachedPlansDir = resolved;
		}
	} else {
		mkdirSync(DEFAULT_PLANS_DIR, { recursive: true });
		cachedPlansDir = DEFAULT_PLANS_DIR;
	}

	return cachedPlansDir;
}

export function resetPlansDirectoryCache(): void {
	cachedPlansDir = undefined;
}

// ============================================================================
// Plan slug caching (per session)
// ============================================================================

export function getPlanSlug(bus: unknown): string {
	const sessionState = getPlanSessionState(bus);
	if (sessionState.planSlugCache) return sessionState.planSlugCache;

	const plansDir = getPlansDirectory();
	let slug: string;

	for (let i = 0; i < MAX_SLUG_RETRIES; i++) {
		slug = generatePlanSlug();
		const filePath = join(plansDir, `${slug}.md`);
		if (!existsSync(filePath)) break;
	}

	slug = slug!;
	sessionState.planSlugCache = slug;
	return slug;
}

export function setPlanSlug(bus: unknown, slug: string): void {
	const sessionState = getPlanSessionState(bus);
	sessionState.planSlugCache = slug;
}

export function clearPlanSlug(bus: unknown): void {
	const sessionState = getPlanSessionState(bus);
	sessionState.planSlugCache = undefined;
}

// ============================================================================
// Plan file path
// ============================================================================

export function getPlanFilePath(bus: unknown, agentId?: string): string {
	const slug = getPlanSlug(bus);
	const plansDir = getPlansDirectory();

	if (!agentId) {
		return join(plansDir, `${slug}.md`);
	}

	return join(plansDir, `${slug}-agent-${agentId}.md`);
}

// ============================================================================
// Plan file I/O
// ============================================================================

export function getPlan(bus: unknown, agentId?: string): string | null {
	const filePath = getPlanFilePath(bus, agentId);
	try {
		return readFileSync(filePath, "utf-8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		console.error(`Error reading plan file: ${error}`);
		return null;
	}
}

export function writePlan(bus: unknown, content: string, agentId?: string): boolean {
	const filePath = getPlanFilePath(bus, agentId);
	try {
		const dir = dirname(filePath);
		mkdirSync(dir, { recursive: true });
		writeFileSync(filePath, content, "utf-8");
		return true;
	} catch (error) {
		console.error(`Error writing plan file: ${error}`);
		return false;
	}
}

export function planExists(bus: unknown, agentId?: string): boolean {
	return getPlan(bus, agentId) !== null;
}

// ============================================================================
// Plan copy for resume/fork
// ============================================================================

export async function copyPlanForResume(
	sourceBus: unknown,
	targetBus: unknown,
): Promise<boolean> {
	const sourceSlug = getPlanSlug(sourceBus);
	setPlanSlug(targetBus, sourceSlug);

	const content = getPlan(sourceBus);
	if (content !== null) {
		writePlan(targetBus, content);
		return true;
	}

	return false;
}

export async function copyPlanForFork(
	sourceBus: unknown,
	targetBus: unknown,
): Promise<boolean> {
	const content = getPlan(sourceBus);
	if (content === null) return false;

	// Generate a new slug for the forked session to avoid conflicts
	clearPlanSlug(targetBus);
	writePlan(targetBus, content);
	return true;
}
