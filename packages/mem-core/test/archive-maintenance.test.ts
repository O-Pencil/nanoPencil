import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { NanoMemEngine } from "../src/engine.js";
import { saveEntries, saveWork } from "../src/store.js";
import { saveV2Procedural, saveV2Semantic } from "../src/store-v2.js";
import type { MemoryEntry, WorkEntry } from "../src/types.js";
import type { ProceduralMemory, SemanticMemory } from "../src/types-v2.js";

function makeEntry(id: string, overrides: Partial<MemoryEntry> = {}): MemoryEntry {
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
		...overrides,
	};
}

function makeWork(id: string, overrides: Partial<WorkEntry> = {}): WorkEntry {
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
		...overrides,
	};
}

function makeSemantic(id: string, overrides: Partial<SemanticMemory> = {}): SemanticMemory {
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
		...overrides,
	};
}

function makeProcedural(id: string, overrides: Partial<ProceduralMemory> = {}): ProceduralMemory {
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
		...overrides,
	};
}

test("archive-maintenance: moves stale memories into _archive without losing them", async () => {
	const memoryDir = await mkdtemp(join(tmpdir(), "nanomem-archive-"));
	const engine = new NanoMemEngine({ memoryDir });

	try {
		await saveEntries(join(memoryDir, "knowledge.json"), [makeEntry("fact:old"), makeEntry("fact:keep", { importance: 9, retention: "core" })], Infinity, () => 1);
		await saveWork(join(memoryDir, "work.json"), [makeWork("work:old"), makeWork("work:keep", { importance: 9, accessCount: 3 })], Infinity, () => 1);
		await saveV2Semantic(engine["v2Paths"], [
			makeSemantic("sem:old", { supersededById: "sem:new" }),
			makeSemantic("sem:keep", { importance: 9, retention: "core", stability: "stable" }),
			makeSemantic("sem:revived", { supersededById: "sem:newer", revivedAt: "2026-04-02T00:00:00.000Z" }),
		]);
		await saveV2Procedural(engine["v2Paths"], [
			makeProcedural("proc:old"),
			makeProcedural("proc:keep", { status: "active", importance: 9, retention: "core", stability: "stable" }),
			makeProcedural("proc:revived", { revivedAt: "2026-04-02T00:00:00.000Z" }),
		]);

		const archived = await engine.archiveStaleMemories("2026-04-04T00:00:00.000Z");
		const active = await engine.exportAll();
		const activeV2 = await engine.exportAllV2();
		const archive = await engine.exportArchive();

		assert.equal(archived.total, 4);
		assert.equal(active.knowledge.length, 1);
		assert.equal(active.work.length, 1);
		assert.equal(activeV2.semantic.length, 2);
		assert.equal(activeV2.procedural.length, 2);
		assert.equal(archive.knowledge.length, 1);
		assert.equal(archive.work.length, 1);
		assert.equal(archive.semantic.length, 1);
		assert.equal(archive.procedural.length, 1);
		assert.ok(activeV2.semantic.some((entry) => entry.id === "sem:revived"));
		assert.ok(activeV2.procedural.some((entry) => entry.id === "proc:revived"));
		assert.equal(archive.knowledge[0]?.archiveReason, "stale-ambient-memory");
		assert.equal(archive.work[0]?.archiveReason, "stale-work-memory");
		assert.equal(archive.semantic[0]?.archiveReason, "superseded-semantic-memory");
		assert.equal(archive.procedural[0]?.archiveReason, "stale-procedure-version");
	} finally {
		await rm(memoryDir, { recursive: true, force: true });
	}
});
