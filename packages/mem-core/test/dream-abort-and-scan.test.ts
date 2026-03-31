import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, utimes, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NanoMemEngine } from "../src/engine.js";
import { readJson } from "../src/store.js";
import { SessionManager } from "../../../core/session/session-manager.js";

test("consolidateDetailed: aborted signal does not write meta.lastConsolidation", async () => {
	const memoryDir = await mkdtemp(join(tmpdir(), "nanomem-abort-"));
	const engine = new NanoMemEngine(
		{
			memoryDir,
			consolidationThreshold: 1,
		},
	);

	// Create one unconsolidated episode (engine.saveEpisode also bumps meta.totalSessions)
	await engine.saveEpisode({
		sessionId: "s1",
		project: "p",
		date: "2026-01-01",
		summary: "did something",
		filesModified: ["a.ts"],
		toolsUsed: {},
		keyObservations: [],
		errors: [],
		tags: [],
		importance: 8,
		consolidated: false,
	});

	const metaPath = join(memoryDir, "meta.json");
	const metaBefore = await readJson(metaPath, {});
	assert.ok(metaBefore);

	const abort = new AbortController();
	abort.abort();
	await assert.rejects(async () => {
		await engine.consolidateDetailed({ signal: abort.signal });
	}, /AbortError/);

	const metaAfter = JSON.parse(await readFile(metaPath, "utf-8"));
	assert.equal(metaAfter.lastConsolidation, undefined);
});

test("SessionManager.countTouchedSince counts by mtime only", async () => {
	const sessionDir = await mkdtemp(join(tmpdir(), "nanopencil-sessions-"));
	const cwd = "C:\\fake\\cwd";
	const since = Date.now() - 60_000;

	// Make 3 session files, 2 touched after since
	await mkdir(sessionDir, { recursive: true });
	const a = join(sessionDir, "a.jsonl");
	const b = join(sessionDir, "b.jsonl");
	const c = join(sessionDir, "c.jsonl");
	await writeFile(a, "{}", "utf-8");
	await writeFile(b, "{}", "utf-8");
	await writeFile(c, "{}", "utf-8");
	await utimes(a, new Date(since - 10_000), new Date(since - 10_000));
	await utimes(b, new Date(since + 10_000), new Date(since + 10_000));
	await utimes(c, new Date(since + 20_000), new Date(since + 20_000));

	const count = await SessionManager.countTouchedSince(cwd, since, { sessionDir });
	assert.equal(count, 2);

	const countExcluded = await SessionManager.countTouchedSince(cwd, since, { sessionDir, excludeBasename: "b" });
	assert.equal(countExcluded, 1);
});

