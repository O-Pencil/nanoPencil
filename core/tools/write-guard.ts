/**
 * [WHO]: Provides createWorkspaceWriteGuard(), isPathWithinRoot()
 * [FROM]: Depends on node:path for absolute path normalization
 * [TO]: Consumed by core/runtime/agent-session.ts and tool-boundary tests
 * [HERE]: core/tools/write-guard.ts - shared filesystem write boundary helpers
 */
import { isAbsolute, resolve } from "node:path";

function normalizePath(path: string): string {
	return resolve(isAbsolute(path) ? path : path);
}

function normalizeForComparison(path: string): string {
	return normalizePath(path).replace(/\\/g, "/").replace(/\/+$/, "");
}

export function isPathWithinRoot(targetPath: string, rootPath: string): boolean {
	const root = normalizeForComparison(rootPath);
	const target = normalizeForComparison(targetPath);
	return target === root || target.startsWith(`${root}/`);
}

export function createWorkspaceWriteGuard(cwd: string): (absolutePath: string) => void {
	const workspaceRoot = normalizePath(cwd);
	return (absolutePath: string) => {
		if (isPathWithinRoot(absolutePath, workspaceRoot)) return;
		throw new Error(
			`Write denied for ${absolutePath}. Main session write tools may only write inside the current workspace: ${workspaceRoot}`,
		);
	};
}
