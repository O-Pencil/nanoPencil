/**
 * [INPUT]: personaId（或无）
 * [OUTPUT]: activePersonaId / persona 目录下的关键路径
 * [POS]: Persona 管理层（只负责状态与路径解析，不负责注入/重载）
 */

import { existsSync, readdirSync, readFileSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { getAgentDir } from "../../config.js";

type PersonaState = {
	activePersonaId?: string;
};

const PERSONAS_DIR = join(getAgentDir(), "personas");
// active persona 状态：~/.nanopencil/agent/persona.json
const ACTIVE_PERSONA_STATE_PATH = join(getAgentDir(), "persona.json");

function ensurePersonasDir(): void {
	if (!existsSync(PERSONAS_DIR)) mkdirSync(PERSONAS_DIR, { recursive: true });
}

function normalizePersonaId(personaId: string): string {
	// 允许字母数字下划线短横，但禁止路径穿越
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
		// 删除状态文件表示回到 general（不启用 persona 覆盖）
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
		// 只保证路径存在，避免用户误写导致后续 reload 失败
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
 * 用于后续环境变量覆盖：把路径解析为绝对路径，避免相对路径在 reload 阶段找不到。
 */
export function toAbsolutePath(p: string): string {
	const trimmed = p.trim();
	if (!trimmed) return trimmed;
	return resolve(trimmed);
}

