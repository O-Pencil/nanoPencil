import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { NanoMemEngine } from "../src/engine.js";
import { saveEntries, saveWork } from "../src/store.js";
import { getV2Paths, saveV2Procedural, saveV2Semantic } from "../src/store-v2.js";
import type { MemoryEntry, WorkEntry } from "../src/types.js";
import type { ProceduralMemory, SemanticMemory } from "../src/types-v2.js";

function makeArchivedEntry(id: string): MemoryEntry {
	return {
		id,
		type: "fact",
		name: id,
		summary: id,
		detail: id,
		tags: ["demo"],
		project: "demo",
		importance: 4,
		created: "2026-01-01T00:00:00.000Z",
		accessCount: 0,
		retention: "ambient",
		stability: "situational",
		archivedAt: "2026-04-04T00:00:00.000Z",
		archiveReason: "stale-ambient-memory",
	};
}

function makeArchivedWork(id: string): WorkEntry {
	return {
		id,
		goal: id,
		summary: id,
		detail: id,
		project: "demo",
		tags: ["demo"],
		importance: 4,
		created: "2026-01-01T00:00:00.000Z",
		accessCount: 0,
		archivedAt: "2026-04-04T00:00:00.000Z",
		archiveReason: "stale-work-memory",
	};
}

function makeArchivedSemantic(id: string): SemanticMemory {
	return {
		id,
		kind: "semantic",
		semanticType: "decision",
		name: id,
		summary: id,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		accessCount: 0,
		importance: 4,
		salience: 4,
		confidence: 0.7,
		retention: "ambient",
		stability: "situational",
		tags: ["demo"],
		scope: { project: "demo" },
		archivedAt: "2026-04-04T00:00:00.000Z",
		archiveReason: "superseded-semantic-memory",
	};
}

function makeArchivedProcedural(id: string): ProceduralMemory {
	return {
		id,
		kind: "procedural",
		name: id,
		summary: id,
		searchText: id,
		steps: [{ id: `${id}:1`, text: "step", kind: "step" }],
		status: "superseded",
		version: 1,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		accessCount: 0,
		importance: 4,
		salience: 4,
		confidence: 0.7,
		retention: "ambient",
		stability: "situational",
		tags: ["demo"],
		scope: { project: "demo" },
		archivedAt: "2026-04-04T00:00:00.000Z",
		archiveReason: "stale-procedure-version",
	};
}

test("archive-restore: restores archived entries back to active stores", async () => {
	const memoryDir = await mkdtemp(join(tmpdir(), "nanomem-restore-"));
	const engine = new NanoMemEngine({ memoryDir });
	const archiveV2Paths = getV2Paths(join(memoryDir, "_archive"));

	try {
		await saveEntries(join(memoryDir, "_archive", "knowledge.json"), [makeArchivedEntry("fact:archived")], Infinity, () => 1);
		await saveWork(join(memoryDir, "_archive", "work.json"), [makeArchivedWork("work:archived")], Infinity, () => 1);
		await saveV2Semantic(archiveV2Paths, [makeArchivedSemantic("sem:archived")]);
		await saveV2Procedural(archiveV2Paths, [makeArchivedProcedural("proc:archived")]);

		assert.deepEqual(await engine.restoreArchivedEntry("missing:id"), { ok: false });

		assert.deepEqual(await engine.restoreArchivedEntry("fact:archived"), { ok: true, location: "knowledge" });
		assert.deepEqual(await engine.restoreArchivedEntry("work:archived"), { ok: true, location: "work" });
		assert.deepEqual(await engine.restoreArchivedEntry("sem:archived"), { ok: true, location: "semantic" });
		assert.deepEqual(await engine.restoreArchivedEntry("proc:archived"), { ok: true, location: "procedural" });

		const active = await engine.exportAll();
		const activeV2 = await engine.exportAllV2();
		const archive = await engine.exportArchive();

		assert.equal(active.knowledge.length, 1);
		assert.equal(active.knowledge[0]?.archivedAt, undefined);
		assert.equal(active.work.length, 1);
		assert.equal(active.work[0]?.archivedAt, undefined);
		assert.equal(activeV2.semantic.length, 1);
		assert.equal(activeV2.semantic[0]?.archivedAt, undefined);
		assert.equal(activeV2.procedural.length, 1);
		assert.equal(activeV2.procedural[0]?.archivedAt, undefined);
		assert.equal(archive.knowledge.length, 0);
		assert.equal(archive.work.length, 0);
		assert.equal(archive.semantic.length, 0);
		assert.equal(archive.procedural.length, 0);
	} finally {
		await rm(memoryDir, { recursive: true, force: true });
	}
});

test("archive-restore: auto revive restores strong archive matches for explicit queries", async () => {
	const memoryDir = await mkdtemp(join(tmpdir(), "nanomem-auto-revive-"));
	const engine = new NanoMemEngine({ memoryDir });
	const archiveV2Paths = getV2Paths(join(memoryDir, "_archive"));

	try {
		await saveEntries(join(memoryDir, "_archive", "knowledge.json"), [
			{
				...makeArchivedEntry("fact:sse"),
				name: "Fix MCP transport mismatch",
				summary: "Use SSE fallback when stdio transport is unstable.",
				detail: "Use SSE fallback when stdio transport is unstable.",
				content: "Use SSE fallback when stdio transport is unstable.",
				tags: ["mcp", "transport", "sse"],
				project: "demo",
			},
		], Infinity, () => 1);
		await saveV2Procedural(archiveV2Paths, [
			{
				...makeArchivedProcedural("proc:sse"),
				name: "Fix MCP transport mismatch",
				summary: "Use SSE fallback when stdio transport is unstable.",
				searchText: "Fix MCP transport mismatch",
				tags: ["mcp", "transport", "sse"],
				scope: { project: "demo" },
			},
		]);

		const revived = await engine.autoReviveRelevantArchive("Fix MCP transport mismatch with SSE fallback", { project: "demo" });
		const active = await engine.exportAll();
		const activeV2 = await engine.exportAllV2();
		const archive = await engine.exportArchive();

		assert.equal(revived.length, 2);
		assert.ok(revived.some((item) => item.id === "fact:sse" && item.location === "knowledge"));
		assert.ok(revived.some((item) => item.id === "proc:sse" && item.location === "procedural"));
		assert.equal(active.knowledge.length, 1);
		assert.equal(activeV2.procedural.length, 1);
		assert.equal(archive.knowledge.length, 0);
		assert.equal(archive.procedural.length, 0);
	} finally {
		await rm(memoryDir, { recursive: true, force: true });
	}
});
