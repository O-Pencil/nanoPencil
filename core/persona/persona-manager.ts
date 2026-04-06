/**
 * [WHO]: PersonaManager class, persona state and path management
 * [FROM]: Depends on node:fs, node:path, config
 * [TO]: Consumed by core/config/resource-loader.ts
 * [HERE]: core/persona/persona-manager.ts - persona management layer
 */
import { existsSync, readdirSync, readFileSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { getAgentDir } from "../../config.js";

type PersonaState = {
	activePersonaId?: string;
};

const PERSONAS_DIR = join(getAgentDir(), "personas");
// active persona state: ~/.nanopencil/agent/persona.json
const ACTIVE_PERSONA_STATE_PATH = join(getAgentDir(), "persona.json");

function ensurePersonasDir(): void {
	if (!existsSync(PERSONAS_DIR)) mkdirSync(PERSONAS_DIR, { recursive: true });
}

function normalizePersonaId(personaId: string): string {
	// Allow alphanumeric, underscore, and hyphen; prevent path traversal
	const trimmed = personaId.trim();
	if (!trimmed) return "general";
	return trimmed.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function getPersonasDir(): string {
	return PERSONAS_DIR;
}

export function getActivePersonaId(): string | undefined {
	try {
		if (!existsSync(ACTIVE_PERSONA_STATE_PATH)) return undefined;
		const raw = readFileSync(ACTIVE_PERSONA_STATE_PATH, "utf-8");
		const parsed = JSON.parse(raw) as PersonaState;
		if (!parsed?.activePersonaId) return undefined;
		return normalizePersonaId(String(parsed.activePersonaId));
	} catch {
		return undefined;
	}
}

export function setActivePersonaId(personaId: string | undefined): void {
	ensurePersonasDir();
	if (!personaId) {
		// Deleting state file means returning to general (disable persona override)
		try {
			writeFileSync(ACTIVE_PERSONA_STATE_PATH, JSON.stringify({}, null, 2), "utf-8");
		} catch {
			// ignore
		}
		return;
	}

	const normalized = normalizePersonaId(personaId);
	const personaDir = getPersonaDir(normalized);
	if (!existsSync(personaDir)) {
		// Ensure path exists to avoid reload failures from user typos
		mkdirSync(personaDir, { recursive: true });
	}
	const state: PersonaState = { activePersonaId: normalized };
	writeFileSync(ACTIVE_PERSONA_STATE_PATH, JSON.stringify(state, null, 2), "utf-8");
}

export function listPersonas(): string[] {
	try {
		ensurePersonasDir();
		return readdirSync(PERSONAS_DIR)
			.map((entry) => normalizePersonaId(entry))
			.filter((id) => {
				const p = getPersonaDir(id);
				try {
					return statSync(p).isDirectory();
				} catch {
					return false;
				}
			})
			.sort((a, b) => a.localeCompare(b));
	} catch {
		return [];
	}
}

export function getPersonaDir(personaId: string): string {
	const normalized = normalizePersonaId(personaId);
	return join(PERSONAS_DIR, normalized);
}

export function getPersonaPencilPath(personaId: string): string {
	return join(getPersonaDir(personaId), "PENCIL.md");
}

export function getPersonaSkillsDir(personaId: string): string {
	return join(getPersonaDir(personaId), "skills");
}

export function getPersonaSoulDir(personaId: string): string {
	return join(getPersonaDir(personaId), "soul");
}

export function getPersonaMemoryDir(personaId: string): string {
	return join(getPersonaDir(personaId), "memory");
}

export function getPersonaMcpConfigPath(personaId: string): string {
	return join(getPersonaDir(personaId), "mcp.json");
}

/**
 * For later environment variable override: resolve path to absolute to avoid relative path issues during reload.
 */
export function toAbsolutePath(p: string): string {
	const trimmed = p.trim();
	if (!trimmed) return trimmed;
	return resolve(trimmed);
}

