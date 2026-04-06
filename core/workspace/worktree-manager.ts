/**
 * [UPSTREAM]: Depends on node:fs/promises, node:path
 * [SURFACE]: WorktreeManager - temporary workspace management
 * [LOCUS]: core/workspace/worktree-manager.ts
 */

import { cp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { join, basename } from "node:path";

export interface WorkspacePath {
  /** Absolute path to the workspace */
  readonly path: string;
  /** Type of workspace */
  readonly type: "temp" | "worktree";
}

/**
 * Manager for creating and disposing workspaces for SubAgents.
 * Provides temporary directories and git worktrees.
 */
export class WorktreeManager {
  private tempDirs: Set<string> = new Set();
  private worktrees: Map<string, string> = new Map(); // workspacePath -> originalCwd

  /**
   * Create a temporary workspace.
   * Copies seed files to a new temp directory.
   * @param seedFiles Files to copy to the temp workspace
   * @param prefix Prefix for the temp directory name
   */
  async createTempWorkspace(
    seedFiles: string[] = [],
    prefix = "pi-subagent",
  ): Promise<WorkspacePath> {
    const tmpDir = await import("node:os").then((m) => m.tmpdir());
    const dirName = `${prefix}-${crypto.randomUUID()}`;
    const workspacePath = join(tmpDir, dirName);

    await mkdir(workspacePath, { recursive: true });
    this.tempDirs.add(workspacePath);

    // Copy seed files
    for (const seedFile of seedFiles) {
      try {
        const fileName = basename(seedFile);
        const destPath = join(workspacePath, fileName);
        await cp(seedFile, destPath);
      } catch {
        // Ignore errors copying individual files
      }
    }

    return {
      path: workspacePath,
      type: "temp",
    };
  }

  /**
   * Create a git worktree for the given branch.
   * @param branch Branch name for the worktree
   * @param cwd Working directory for git operations
   */
  async createGitWorktree(branch?: string, cwd?: string): Promise<WorkspacePath> {
    const worktreeBranch = branch ?? `subagent/${crypto.randomUUID()}`;
    const worktreePath = await this.createTempWorkspace([], `pi-worktree-${worktreeBranch}`);

    // Run git worktree add
    const { execSync } = await import("node:child_process");
    try {
      execSync(
        `git worktree add "${worktreePath.path}" ${worktreeBranch}`,
        { cwd, stdio: "ignore" },
      );
      this.worktrees.set(worktreePath.path, cwd ?? process.cwd());
    } catch {
      // If git worktree fails, just return the temp workspace
      return worktreePath;
    }

    return worktreePath;
  }

  /**
   * Dispose of a workspace.
   * Removes temp directories and worktrees.
   * @param workspace The workspace to dispose
   */
  async dispose(workspace: WorkspacePath): Promise<void> {
    if (workspace.type === "temp") {
      if (this.tempDirs.has(workspace.path)) {
        try {
          await rm(workspace.path, { recursive: true, force: true });
        } catch {
          // Ignore errors during cleanup
        }
        this.tempDirs.delete(workspace.path);
      }
    } else if (workspace.type === "worktree") {
      const originalCwd = this.worktrees.get(workspace.path);
      if (originalCwd) {
        // Try to remove the git worktree first
        const { execSync } = await import("node:child_process");
        try {
          execSync(`git worktree remove "${workspace.path}" --force`, {
            cwd: originalCwd,
            stdio: "ignore",
          });
        } catch {
          // Ignore errors
        }
        this.worktrees.delete(workspace.path);
      }

      // Then remove the directory
      try {
        await rm(workspace.path, { recursive: true, force: true });
      } catch {
        // Ignore errors during cleanup
      }
    }
  }

  /**
   * Get all active temp directories.
   */
  getActiveTempDirs(): string[] {
    return Array.from(this.tempDirs);
  }

  /**
   * Clean up all temp directories.
   */
  async disposeAll(): Promise<void> {
    await Promise.all(
      Array.from(this.tempDirs).map((dir) =>
        rm(dir, { recursive: true, force: true }).catch(() => {}),
      ),
    );
    this.tempDirs.clear();
    this.worktrees.clear();
  }
}

/**
 * Default global worktree manager instance.
 */
export const worktreeManager = new WorktreeManager();
