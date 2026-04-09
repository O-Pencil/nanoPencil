import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { SubAgentHandle, SubAgentResult } from "../core/sub-agent/index.js";
import type { WorkspacePath } from "../core/workspace/index.js";
import { TeamRuntime } from "../extensions/defaults/team/team-runtime.js";

function createTempDir(prefix: string): string {
	return mkdtempSync(join(tmpdir(), prefix));
}

function flushAsyncWork(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
	const start = Date.now();
	while (!predicate()) {
		if (Date.now() - start > timeoutMs) {
			throw new Error("Timed out waiting for async state");
		}
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

function createPendingHandle(id: string) {
	let status: SubAgentHandle["status"] = "running";
	let resolveResult: ((result: SubAgentResult) => void) | undefined;
	const resultPromise = new Promise<SubAgentResult>((resolve) => {
		resolveResult = resolve;
	});

	const handle: SubAgentHandle = {
		id,
		get status() {
			return status;
		},
		async result(): Promise<SubAgentResult> {
			return resultPromise;
		},
		async abort(): Promise<void> {
			status = "aborted";
			resolveResult?.({ success: false, error: "Aborted" });
		},
		async terminate(): Promise<void> {
			status = "aborted";
			resolveResult?.({ success: false, error: "Aborted" });
		},
	};

	return { handle };
}

test("team-runtime: stop keeps teammate in stopped state and records aborted result", async () => {
	const storageDir = createTempDir("nanopencil-team-stop-");
	const runtime = new TeamRuntime({ storageDir });
	const { handle } = createPendingHandle("stop-handle");
	(runtime as any).subAgentRuntime = {
		spawn: async () => handle,
		terminateAll: async () => {},
	};

	try {
		await runtime.spawn({ role: "researcher", name: "scout", baseCwd: process.cwd() });

		const sendPromise = runtime.send("scout", "ping");
		await waitFor(() => Boolean((runtime as any).teammates.get("scout")?.handle));
		assert.equal(await runtime.stop("scout"), true);

		const result = await sendPromise;
		assert.equal(result.success, false);
		assert.equal(result.aborted, true);
		assert.equal(runtime.getTeammate("scout")?.status, "stopped");

		const mailboxTypes = runtime.getMailbox().list().map((message) => message.type);
		assert.deepEqual(mailboxTypes, ["task_request", "task_result"]);

		const teammateId = runtime.getTeammate("scout")?.identity.id;
		assert.ok(teammateId);
		const transcriptPath = join(storageDir, "transcripts", `${teammateId}.jsonl`);
		const transcriptEntries = readFileSync(transcriptPath, "utf-8")
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line) as { kind: string; content: string });
		assert.deepEqual(transcriptEntries.map((entry) => entry.kind), ["leader", "teammate"]);
		assert.equal(transcriptEntries[1]?.content, "Aborted");
	} finally {
		await runtime.terminate("scout").catch(() => {});
		await runtime.dispose();
		rmSync(storageDir, { recursive: true, force: true });
	}
});

test("team-runtime: error path posts task_result and writes transcript", async () => {
	const storageDir = createTempDir("nanopencil-team-error-");
	const runtime = new TeamRuntime({ storageDir });
	const handle: SubAgentHandle = {
		id: "error-handle",
		status: "running",
		async result(): Promise<SubAgentResult> {
			throw new Error("boom");
		},
		async abort(): Promise<void> {},
		async terminate(): Promise<void> {},
	};
	(runtime as any).subAgentRuntime = {
		spawn: async () => handle,
		terminateAll: async () => {},
	};

	try {
		await runtime.spawn({ role: "researcher", name: "reviewer-1", baseCwd: process.cwd() });

		const result = await runtime.send("reviewer-1", "explode");
		assert.equal(result.success, false);
		assert.equal(result.error, "boom");
		assert.equal(runtime.getTeammate("reviewer-1")?.status, "error");

		const mailbox = runtime.getMailbox().list();
		assert.equal(mailbox.length, 2);
		assert.equal(mailbox[1]?.type, "task_result");
		assert.equal(mailbox[1]?.payload.error, "boom");

		const teammateId = runtime.getTeammate("reviewer-1")?.identity.id;
		assert.ok(teammateId);
		const transcriptPath = join(storageDir, "transcripts", `${teammateId}.jsonl`);
		const transcriptEntries = readFileSync(transcriptPath, "utf-8")
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line) as { kind: string; content: string });
		assert.deepEqual(transcriptEntries.map((entry) => entry.kind), ["leader", "teammate"]);
		assert.equal(transcriptEntries[1]?.content, "Error: boom");
	} finally {
		await runtime.terminate("reviewer-1").catch(() => {});
		await runtime.dispose();
		rmSync(storageDir, { recursive: true, force: true });
	}
});

test("team-runtime: execute approval emits permission response and mode change", async () => {
	const storageDir = createTempDir("nanopencil-team-approve-");
	const runtime = new TeamRuntime({ storageDir });
	const implementerWorkspace = createTempDir("nanopencil-team-worktree-");
	(runtime as any).worktreeManager = {
		createGitWorktree: async (): Promise<WorkspacePath> => ({
			path: implementerWorkspace,
			type: "temp",
		}),
		dispose: async (): Promise<void> => {},
	};

	try {
		await runtime.spawn({ role: "implementer", name: "builder", baseCwd: process.cwd() });
		const modeChange = await runtime.setMode("builder", "execute");
		assert.ok(modeChange.pending);

		assert.equal(runtime.approvePermission(modeChange.pending!.requestId), true);
		await waitFor(() => runtime.getMailbox().list().length === 3);

		assert.equal(runtime.getTeammate("builder")?.mode, "execute");
		assert.deepEqual(
			runtime.getMailbox().list().map((message) => message.type),
			["permission_request", "permission_response", "mode_change"],
		);
	} finally {
		await runtime.terminate("builder").catch(() => {});
		await runtime.dispose();
		rmSync(implementerWorkspace, { recursive: true, force: true });
		rmSync(storageDir, { recursive: true, force: true });
	}
});

test("team-runtime: auto-generated names remain unique after reload", async () => {
	const storageDir = createTempDir("nanopencil-team-names-");
	const firstRuntime = new TeamRuntime({ storageDir });

	try {
		const first = await firstRuntime.spawn({ role: "researcher", baseCwd: process.cwd() });
		assert.equal(first.identity.name, "researcher-1");
		await firstRuntime.dispose();

		const secondRuntime = new TeamRuntime({ storageDir });
		try {
			await secondRuntime.load();
			const second = await secondRuntime.spawn({ role: "researcher", baseCwd: process.cwd() });
			assert.equal(second.identity.name, "researcher-2");
			assert.notEqual(second.identity.name, first.identity.name);

			await secondRuntime.terminate(first.identity.name);
			await secondRuntime.terminate(second.identity.name);
		} finally {
			await secondRuntime.dispose();
		}
	} finally {
		rmSync(storageDir, { recursive: true, force: true });
	}
});

test("team-runtime: recovered implementer worktree can be terminated after reload", async () => {
	const repoDir = createTempDir("nanopencil-team-recover-repo-");
	const storageDir = createTempDir("nanopencil-team-recover-state-");

	try {
		writeFileSync(join(repoDir, "tracked.txt"), "base\n", "utf-8");
		await mkdir(join(repoDir, "nested"), { recursive: true });
		execFileSync("git", ["init"], { cwd: repoDir, stdio: "ignore" });
		execFileSync("git", ["config", "user.name", "Test User"], { cwd: repoDir, stdio: "ignore" });
		execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repoDir, stdio: "ignore" });
		execFileSync("git", ["add", "tracked.txt"], { cwd: repoDir, stdio: "ignore" });
		execFileSync("git", ["commit", "-m", "init"], { cwd: repoDir, stdio: "ignore" });

		const firstRuntime = new TeamRuntime({ storageDir });
		const builder = await firstRuntime.spawn({ role: "implementer", name: "builder", baseCwd: repoDir });
		assert.ok(builder.worktreePath);
		assert.equal(existsSync(builder.worktreePath!), true);
		await firstRuntime.dispose();

		const secondRuntime = new TeamRuntime({ storageDir });
		try {
			await secondRuntime.load();
			assert.equal(await secondRuntime.terminate("builder"), true);
		} finally {
			await secondRuntime.dispose();
		}

		assert.equal(existsSync(builder.worktreePath!), false);
		const worktreeList = execFileSync("git", ["worktree", "list", "--porcelain"], {
			cwd: repoDir,
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "ignore"],
		});
		assert.equal(worktreeList.includes(builder.worktreePath!), false);
	} finally {
		rmSync(repoDir, { recursive: true, force: true });
		rmSync(storageDir, { recursive: true, force: true });
	}
});
