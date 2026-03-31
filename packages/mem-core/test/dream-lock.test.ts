import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readDreamLockMtimeMs, rollbackDreamLock, stampDreamLock, tryAcquireDreamLock } from "../src/dream-lock.js";

test("dream lock: acquire contended and rollback prior=0", async () => {
	const dir = await mkdtemp(join(tmpdir(), "nanomem-dream-lock-"));
	const lockPath = join(dir, ".dream-lock");

	const prior = await tryAcquireDreamLock(lockPath, 60_000);
	assert.equal(prior, 0);
	assert.equal((await readFile(lockPath, "utf-8")).trim(), String(process.pid));

	// Fresh lock held by current PID should be contended
	const contended = await tryAcquireDreamLock(lockPath, 60_000);
	assert.equal(contended, null);

	await rollbackDreamLock(lockPath, 0);
	assert.equal(await readDreamLockMtimeMs(lockPath), 0);
});

test("dream lock: reclaim stale and rollback restores mtime", async () => {
	const dir = await mkdtemp(join(tmpdir(), "nanomem-dream-lock-"));
	const lockPath = join(dir, ".dream-lock");

	// Create a stale lock with a dead pid and an old mtime
	await writeFile(lockPath, "999999", "utf-8");
	const old = Date.now() - 2 * 60_000;
	await utimes(lockPath, new Date(old), new Date(old));
	const before = await stat(lockPath);

	const prior = await tryAcquireDreamLock(lockPath, 60_000);
	assert.equal(typeof prior, "number");
	assert.equal(prior, before.mtimeMs);
	assert.equal((await readFile(lockPath, "utf-8")).trim(), String(process.pid));

	await rollbackDreamLock(lockPath, prior!);
	const after = await stat(lockPath);
	assert.equal(after.mtimeMs, before.mtimeMs);
});

test("dream lock: stamp updates mtime", async () => {
	const dir = await mkdtemp(join(tmpdir(), "nanomem-dream-lock-"));
	const lockPath = join(dir, ".dream-lock");

	const before = await readDreamLockMtimeMs(lockPath);
	assert.equal(before, 0);

	await stampDreamLock(lockPath);
	const after = await readDreamLockMtimeMs(lockPath);
	assert.ok(after > 0);
});

