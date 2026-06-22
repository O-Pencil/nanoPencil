/**
 * [WHO]: projectKeyForPath() / resolveTokenSaveDataDir() — runtime data path resolution
 * [FROM]: Depends on node:crypto, node:fs/promises, node:os, node:path
 * [TO]: Consumed by tracking.ts, recovery.ts, index.ts (one-shot migration)
 * [HERE]: extensions/builtin/token-save/paths.ts - keeps runtime data out of the project tree
 */
import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface TokenSavePaths {
	projectKey: string;
	dataDir: string;
	historyFile: string;
	rawDir: string;
}

export async function projectKeyForPath(projectPath: string): Promise<string> {
	const resolved = await realpath(projectPath).catch(() => projectPath);
	return createHash("sha1").update(resolved).digest("hex").slice(0, 12);
}

export function dataDirForKey(projectKey: string): string {
	return join(homedir(), ".catui", "token-save", "projects", projectKey);
}

export async function resolveTokenSavePaths(projectPath: string): Promise<TokenSavePaths> {
	const projectKey = await projectKeyForPath(projectPath);
	const dataDir = dataDirForKey(projectKey);
	return {
		projectKey,
		dataDir,
		historyFile: join(dataDir, "history.jsonl"),
		rawDir: join(dataDir, "raw"),
	};
}
