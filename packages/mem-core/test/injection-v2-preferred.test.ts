import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { NanoMemEngine } from "../src/engine.js";
import { saveEntries } from "../src/store.js";
import { saveV2Facets, saveV2Procedural, saveV2Semantic } from "../src/store-v2.js";
import type { MemoryEntry } from "../src/types.js";
import type { EpisodeFacet, ProceduralMemory, SemanticMemory } from "../src/types-v2.js";

function makeLegacyEntry(id: string, overrides: Partial<MemoryEntry> = {}): MemoryEntry {
	return {
		id,
		type: "fact",
		name: id,
		summary: id,
		detail: id,
		tags: ["demo"],
		project: "demo",
		importance: 7,
		created: "2026-01-01T00:00:00.000Z",
		accessCount: 1,
		retention: "ambient",
		stability: "stable",
		...overrides,
	};
}

function makeSemantic(id: string): SemanticMemory {
	return {
		id,
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

function makeProcedure(id: string): ProceduralMemory {
	return {
		id,
		kind: "procedural",
		name: "Fix MCP transport mismatch",
		summary: "Switch to SSE fallback when stdio transport is unstable.",
		searchText: "Fix MCP transport mismatch",
		steps: [{ id: `${id}:1`, text: "Use SSE fallback", kind: "step" }],
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

function makeV2Facet(id: string): EpisodeFacet {
	return {
		id,
		kind: "facet",
		episodeId: "episode:test",
		facetType: "insight",
		searchText: "Use SSE fallback when stdio transport is unstable",
		summary: "Use SSE fallback when stdio transport is unstable",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		accessCount: 1,
		importance: 7,
		salience: 7,
		confidence: 0.8,
		retention: "key-event",
		stability: "stable",
		tags: ["mcp", "sse", "transport"],
		scope: { project: "demo" },
	};
}

test("injection-v2-preferred: prefers V2 recall while keeping legacy pattern bridge", async () => {
	const memoryDir = await mkdtemp(join(tmpdir(), "nanomem-injection-v2-"));
	const engine = new NanoMemEngine({ memoryDir });

	try {
		await saveEntries(
			join(memoryDir, "knowledge.json"),
			[
				makeLegacyEntry("legacy:fact", {
					name: "Legacy MCP note",
					summary: "Old V1 note about MCP transport.",
					detail: "Legacy MCP note should stay out of injection when V2 is present.",
					tags: ["mcp", "transport"],
				}),
			],
			Infinity,
			() => 1,
		);
		await saveEntries(
			join(memoryDir, "facets.json"),
			[
				makeLegacyEntry("legacy:pattern", {
					type: "pattern",
					name: "Checks transport fallback",
					summary: "When MCP transport breaks, check fallback strategy.",
					detail: "Pattern bridge should still be visible.",
					facetData: { kind: "pattern", trigger: "MCP transport breaks", behavior: "check fallback strategy" },
				}),
			],
			Infinity,
			() => 1,
		);
		await saveV2Semantic(engine["v2Paths"], [makeSemantic("sem:sse")]);
		await saveV2Procedural(engine["v2Paths"], [makeProcedure("proc:sse")]);
		await saveV2Facets(engine["v2Paths"], [makeV2Facet("facet:sse")]);

		const injection = await engine.getMemoryInjection("demo", ["mcp", "sse", "transport"], { project: "demo" });

		assert.match(injection, /Semantic Abstractions/);
		assert.match(injection, /Procedures/);
		assert.match(injection, /Checks transport fallback/);
		assert.doesNotMatch(injection, /Legacy MCP note/);
	} finally {
		await rm(memoryDir, { recursive: true, force: true });
	}
});
