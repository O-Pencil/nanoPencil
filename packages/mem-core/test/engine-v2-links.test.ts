import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { NanoMemEngine } from "../src/engine.js";
import { getV2Paths, saveV2Links, saveV2Procedural, saveV2Semantic } from "../src/store-v2.js";
import type { MemoryLink, ProceduralMemory, SemanticMemory } from "../src/types-v2.js";

function makeProcedural(id: string, overrides: Partial<ProceduralMemory> = {}): ProceduralMemory {
	return {
		id,
		kind: "procedural",
		name: "Fix MCP transport mismatch",
		summary: "Use SSE fallback when stdio transport is unstable.",
		searchText: "Fix MCP transport mismatch",
		steps: [{ id: `${id}:step:1`, text: "Use SSE fallback", kind: "step" }],
		status: "active",
		version: 1,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		accessCount: 2,
		importance: 8,
		salience: 8,
		confidence: 0.82,
		retention: "key-event",
		stability: "stable",
		tags: ["mcp", "sse", "transport"],
		sourceEpisodeIds: ["episode:a"],
		sourceFacetIds: ["facet:a"],
		scope: { project: "demo" },
		...overrides,
	};
}

function makeSemantic(id: string, overrides: Partial<SemanticMemory> = {}): SemanticMemory {
	return {
		id,
		kind: "semantic",
		semanticType: "decision",
		name: `Semantic ${id}`,
		summary: "Prefer SSE fallback when stdio transport is unstable.",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		accessCount: 1,
		importance: 7,
		salience: 7,
		confidence: 0.8,
		retention: "ambient",
		stability: "situational",
		tags: ["mcp", "sse"],
		scope: { project: "demo" },
		...overrides,
	};
}

test("engine-v2-links: materializes supersede and conflict links without dropping manual links", async () => {
	const memoryDir = await mkdtemp(join(tmpdir(), "nanomem-links-"));
	const engine = new NanoMemEngine({ memoryDir });
	const paths = getV2Paths(memoryDir);

	const procedural: ProceduralMemory[] = [
		makeProcedural("proc:new", {
			version: 3,
			supersedesIds: ["proc:old"],
			boundaries: "Use for unstable stdio transport only.",
		}),
		makeProcedural("proc:old", {
			status: "superseded",
			version: 1,
			supersededById: "proc:new",
			boundaries: "Legacy guidance for any MCP issue.",
		}),
		makeProcedural("proc:conflict", {
			boundaries: "Use only when SSE is unavailable.",
			contextText: "Applies in locked-down CI environments.",
		}),
	];
	const semantic: SemanticMemory[] = [
		makeSemantic("sem:a", { conflictWithIds: ["sem:b"] }),
		makeSemantic("sem:b", { conflictWithIds: ["sem:a"] }),
	];
	const manualLinks: MemoryLink[] = [
		{
			id: "episode:a->facet:a",
			fromId: "episode:a",
			toId: "facet:a",
			type: "has-facet",
			weight: 1,
			explicit: true,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
			evidence: [],
		},
	];

	try {
		await saveV2Procedural(paths, procedural);
		await saveV2Semantic(paths, semantic);
		await saveV2Links(paths, manualLinks);

		const result = await engine.rebuildV2Links();
		const snapshot = await engine.exportAllV2();
		const inspect = await engine.inspectV2Memory("demo");

		assert.ok(result.total >= 4);
		assert.ok(result.auto >= 3);
		assert.ok(snapshot.links.some((link) => link.id === "episode:a->facet:a"));
		assert.ok(snapshot.links.some((link) => link.type === "supersedes" && link.fromId === "proc:new" && link.toId === "proc:old"));
		assert.ok(snapshot.links.some((link) => link.type === "conflicts-with" && [link.fromId, link.toId].includes("proc:new") && [link.fromId, link.toId].includes("proc:conflict")));
		assert.ok(snapshot.links.some((link) => link.type === "conflicts-with" && [link.fromId, link.toId].includes("sem:a") && [link.fromId, link.toId].includes("sem:b")));
		assert.equal(inspect.counts.procedureChains, 1);
		assert.equal(inspect.counts.proceduralConflicts, 1);
		assert.equal(inspect.counts.semanticConflicts, 1);
	} finally {
		await rm(memoryDir, { recursive: true, force: true });
	}
});
