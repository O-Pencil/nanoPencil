import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { NanoMemEngine } from "../src/engine.js";
import { saveEntries } from "../src/store.js";
import { saveV2Procedural, saveV2Semantic } from "../src/store-v2.js";
import type { MemoryEntry } from "../src/types.js";
import type { ProceduralMemory, SemanticMemory } from "../src/types-v2.js";

function legacyEntry(): MemoryEntry {
	return {
		id: "legacy:fact",
		type: "fact",
		name: "Legacy MCP note",
		summary: "Old V1 note about MCP transport.",
		detail: "Old V1 note about MCP transport.",
		content: "Old V1 note about MCP transport.",
		tags: ["mcp", "transport"],
		project: "demo",
		importance: 6,
		created: "2026-01-01T00:00:00.000Z",
		accessCount: 1,
		retention: "ambient",
		stability: "stable",
	};
}

function semanticEntry(): SemanticMemory {
	return {
		id: "sem:sse",
		kind: "semantic",
		semanticType: "decision",
		name: "Use SSE fallback",
		summary: "Use SSE fallback when MCP stdio transport is unstable.",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		accessCount: 1,
		importance: 8,
		salience: 8,
		confidence: 0.9,
		retention: "key-event",
		stability: "stable",
		tags: ["mcp", "sse", "transport"],
		scope: { project: "demo" },
	};
}

function procedureEntry(): ProceduralMemory {
	return {
		id: "proc:sse",
		kind: "procedural",
		name: "Fix MCP transport mismatch",
		summary: "Switch to SSE fallback when stdio transport is unstable.",
		searchText: "Fix MCP transport mismatch",
		steps: [{ id: "proc:sse:1", text: "Use SSE fallback", kind: "step" }],
		status: "active",
		version: 1,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		accessCount: 1,
		importance: 8,
		salience: 8,
		confidence: 0.9,
		retention: "key-event",
		stability: "stable",
		tags: ["mcp", "sse", "transport"],
		scope: { project: "demo" },
	};
}

test("search-v2-first: prefers V2 results over generic legacy entries", async () => {
	const memoryDir = await mkdtemp(join(tmpdir(), "nanomem-search-v2-"));
	const engine = new NanoMemEngine({ memoryDir });

	try {
		await saveEntries(join(memoryDir, "knowledge.json"), [legacyEntry()], Infinity, () => 1);
		await saveV2Semantic(engine["v2Paths"], [semanticEntry()]);
		await saveV2Procedural(engine["v2Paths"], [procedureEntry()]);

		const results = await engine.searchEntries("Fix MCP transport mismatch with SSE fallback", { project: "demo" });
		const ids = results.map((entry) => entry.id);

		assert.ok(ids.includes("sem:sse"));
		assert.ok(ids.includes("proc:sse"));
		assert.ok(!ids.includes("legacy:fact"));
	} finally {
		await rm(memoryDir, { recursive: true, force: true });
	}
});
