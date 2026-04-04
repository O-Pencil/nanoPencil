/**
 * [UPSTREAM]: None
 * [SURFACE]: getGitDiff, getFileDiff, getChangedFiles
 * [LOCUS]: Git utilities for simplify extension; diff and file listing
 * [COVENANT]: Update this header on changes and verify against parent CLAUDE.md
 */

import { execSync } from "child_process";

// =============================================================================
// Git Diff Utilities
// =============================================================================

/**
 * Get list of changed files (staged + unstaged)
 *
 * @param cwd - Working directory
 * @returns Array of file paths, or empty array on error
 */
export function getChangedFiles(cwd: string): string[] {
	try {
		const staged = execSync("git diff --cached --name-only", {
			cwd,
			encoding: "utf-8",
		});
		const unstaged = execSync("git diff --name-only", {
			cwd,
			encoding: "utf-8",
		});

		const stagedFiles = staged.split("\n").filter((f) => f.trim());
		const unstagedFiles = unstaged.split("\n").filter((f) => f.trim());

		// Deduplicate
		return [...new Set([...stagedFiles, ...unstagedFiles])];
	} catch {
		return [];
	}
}

/**
 * Get diff for a specific file against HEAD
 *
 * @param cwd - Working directory
 * @param file - File path (relative to cwd)
 * @returns Diff string, or empty string on error
 */
export function getFileDiff(cwd: string, file: string): string {
	try {
		const diff = execSync(`git diff HEAD -- "${file}"`, {
			cwd,
			encoding: "utf-8",
		});
		return diff || "";
	} catch {
		return "";
	}
}

/**
 * Get combined diff string for all changed files
 *
 * @param cwd - Working directory
 * @returns Combined diff string
 */
export function getGitDiff(cwd: string): string {
	try {
		const diff = execSync("git diff HEAD", {
			cwd,
			encoding: "utf-8",
		});
		return diff || "";
	} catch {
		return "";
	}
}

// =============================================================================
// Project Rules Loader
// =============================================================================

/**
 * Load project rules from common config files
 *
 * Checks for:
 * - CLAUDE.md
 * - AGENTS.md
 * - .cursor/rules
 * - .github/copilot-instructions.md
 *
 * @param cwd - Working directory
 * @returns Combined rules string (truncated per file to 2000 chars)
 */
export function loadProjectRules(cwd: string): string {
	const ruleFiles = ["CLAUDE.md", "AGENTS.md", ".cursor/rules", ".github/copilot-instructions.md"];
	const rules: string[] = [];

	for (const file of ruleFiles) {
		const path = `${cwd}/${file}`;
		try {
			const { existsSync, readFileSync } = require("fs");
			if (existsSync(path)) {
				const content = readFileSync(path, "utf-8");
				rules.push(`=== ${file} ===\n${content.slice(0, 2000)}`);
			}
		} catch {
			// ignore
		}
	}

	return rules.join("\n\n");
}
