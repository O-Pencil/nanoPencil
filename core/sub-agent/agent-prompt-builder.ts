/**
 * [WHO]: buildNotesSystemPrompt, buildWorktreeNotes — system prompt building per CC §X (Z18)
 * [FROM]: Depends on ./agent-definition for AgentSystemPromptContext
 * [TO]: Consumed by ./agent-tool
 * [HERE]: core/sub-agent/agent-prompt-builder.ts - System prompt Notes injection per CC §X (Z18)
 * [COVENANT]: Change prompt structure → update agent-tool handler
 */

/**
 * Build the "Notes:" system prompt section that lists working directories.
 * Matches CC's Z18() function exactly.
 *
 * Per CC §10.3:
 * - Z18() prepends a "Notes:" section listing all working directories
 * - Used when sub-agent has worktree/cwd override
 * - The section starts with "Notes:" then lists all dirs
 *
 * Example output:
 *   Notes:
 *   - Working directory: /path/to/worktree
 *   - Working directory: /path/to/original/project
 */
export function buildNotesSystemPrompt(additionalWorkingDirs: string[]): string {
  if (!additionalWorkingDirs.length) {
    return "";
  }

  const lines = [
    "Notes:",
    ...additionalWorkingDirs.map((dir) => `- Working directory: ${dir}`),
  ];

  return lines.join("\n");
}

/**
 * Build worktree-specific notes.
 * Per CC §10.3: when isolation === "worktree" or cwd is overridden,
 * Z18 injects working directory notes into the system prompt.
 *
 * The worktree path is the primary working dir.
 * The original project root is listed as an additional reference dir.
 */
export function buildWorktreeNotes(
  worktreePath: string,
  originalProjectRoot?: string,
): string {
  const dirs = [worktreePath];
  if (originalProjectRoot && originalProjectRoot !== worktreePath) {
    dirs.push(originalProjectRoot);
  }
  return buildNotesSystemPrompt(dirs);
}

/**
 * Build cwd override notes.
 * Per CC §10.3: when cwd is overridden (not worktree),
 * Z18 injects the override cwd as a working directory note.
 */
export function buildCwdOverrideNotes(overrideCwd: string, originalCwd?: string): string {
  const dirs = [overrideCwd];
  if (originalCwd && originalCwd !== overrideCwd) {
    dirs.push(originalCwd);
  }
  return buildNotesSystemPrompt(dirs);
}
