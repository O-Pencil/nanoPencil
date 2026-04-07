import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { WorktreeManager, type WorkspacePath } from "../core/workspace/index.js";

function createTempDir(prefix: string): string {
	return mkdtempSync(join(tmpdir(), prefix));
}

test("worktree-manager: snapshot workspace tracks changes and applies them back", async () => {
	const sourceDir = createTempDir("nanopencil-workspace-src-");
	const manager = new WorktreeManager();

	try {
		writeFileSync(join(sourceDir, "keep.txt"), "original\n", "utf-8");
		writeFileSync(join(sourceDir, "delete.txt"), "remove me\n", "utf-8");
		await mkdir(join(sourceDir, "nested"), { recursive: true });
		writeFileSync(join(sourceDir, "nested", "old.txt"), "old\n", "utf-8");

		const workspace = await manager.createSnapshotWorkspace(sourceDir);

		writeFileSync(join(workspace.path, "keep.txt"), "updated\n", "utf-8");
		await rm(join(workspace.path, "delete.txt"));
		writeFileSync(join(workspace.path, "nested", "new.txt"), "new\n", "utf-8");

		const changes = await manager.listChanges(workspace);
		assert.deepEqual(
			changes.sort((left, right) => left.path.localeCompare(right.path)),
			[
				{ path: "delete.txt", status: "deleted" },
				{ path: "keep.txt", status: "modified" },
				{ path: "nested/new.txt", status: "added" },
			],
		);

		const patchPath = join(sourceDir, ".nanopencil", "subagent-runs", "snapshot.patch");
		const wrotePatch = await manager.writePatch(workspace, patchPath);
		assert.equal(wrotePatch, true);
		assert.equal(existsSync(patchPath), true);
		assert.match(readFileSync(patchPath, "utf-8"), /diff --git|deleted file mode|new file mode/);

		const applied = await manager.applyChanges(workspace, sourceDir);
		assert.equal(applied.length, 3);
		assert.equal(readFileSync(join(sourceDir, "keep.txt"), "utf-8"), "updated\n");
		assert.equal(existsSync(join(sourceDir, "delete.txt")), false);
		assert.equal(readFileSync(join(sourceDir, "nested", "new.txt"), "utf-8"), "new\n");
	} finally {
		await manager.disposeAll();
		rmSync(sourceDir, { recursive: true, force: true });
	}
});

test("worktree-manager: createGitWorktree falls back to snapshot outside a git repo", async () => {
	const sourceDir = createTempDir("nanopencil-worktree-fallback-");
	const manager = new WorktreeManager();

	try {
		writeFileSync(join(sourceDir, "file.txt"), "hello\n", "utf-8");
		const workspace = await manager.createGitWorktree(undefined, sourceDir);
		assert.equal(workspace.type, "temp");

		writeFileSync(join(workspace.path, "file.txt"), "changed\n", "utf-8");
		const changedFiles = await manager.listChangedFiles(workspace);
		assert.deepEqual(changedFiles, ["file.txt"]);
	} finally {
		await manager.disposeAll();
		rmSync(sourceDir, { recursive: true, force: true });
	}
});

test("worktree-manager: worktree patch generation reads git diff output", async () => {
	const sourceDir = createTempDir("nanopencil-worktree-git-");
	const manager = new WorktreeManager();

	try {
		writeFileSync(join(sourceDir, "tracked.txt"), "base\n", "utf-8");
		await import("node:child_process").then(({ execFileSync }) => {
			execFileSync("git", ["init"], { cwd: sourceDir, stdio: "ignore" });
			execFileSync("git", ["config", "user.name", "Test User"], { cwd: sourceDir, stdio: "ignore" });
			execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: sourceDir, stdio: "ignore" });
			execFileSync("git", ["add", "tracked.txt"], { cwd: sourceDir, stdio: "ignore" });
			execFileSync("git", ["commit", "-m", "init"], { cwd: sourceDir, stdio: "ignore" });
		});

		const workspace = await manager.createGitWorktree(undefined, sourceDir);
		assert.equal(workspace.type, "worktree");

		writeFileSync(join(workspace.path, "tracked.txt"), "updated\n", "utf-8");
		const patchPath = join(sourceDir, "worktree.patch");
		const wrotePatch = await manager.writePatch(workspace as WorkspacePath, patchPath);
		assert.equal(wrotePatch, true);
		assert.match(readFileSync(patchPath, "utf-8"), /tracked\.txt/);
	} finally {
		await manager.disposeAll();
		rmSync(sourceDir, { recursive: true, force: true });
	}
});
