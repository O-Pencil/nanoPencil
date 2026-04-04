import test from "node:test";
import assert from "node:assert/strict";

import { reconsolidateV2Memories } from "../src/reconsolidate-v2.js";
import type { EpisodeFacet, EpisodeMemory, ProceduralMemory } from "../src/types-v2.js";

test("reconsolidate-v2: promotes recalled draft procedures and merges duplicates", () => {
	const episodes: EpisodeMemory[] = [
		{
			id: "episode:a",
			kind: "episode",
			sessionId: "a",
			summary: "Fixed MCP transport with SSE fallback",
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
			accessCount: 4,
			importance: 8,
			salience: 8,
			confidence: 0.8,
			retention: "ambient",
			stability: "situational",
			tags: ["mcp", "sse"],
			filesModified: [],
			toolsUsed: {},
			entities: [],
			facetIds: ["facet:a"],
			derivedSemanticIds: [],
			derivedProcedureIds: ["proc:a"],
			scope: { project: "demo" },
		},
	];

	const facets: EpisodeFacet[] = [
		{
			id: "facet:a",
			kind: "facet",
			episodeId: "episode:a",
			facetType: "insight",
			searchText: "Use SSE fallback",
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
			accessCount: 4,
			importance: 7,
			salience: 7,
			confidence: 0.8,
			retention: "ambient",
			stability: "situational",
			tags: ["mcp", "sse"],
			scope: { project: "demo" },
		},
	];

	const procedural: ProceduralMemory[] = [
		{
			id: "proc:a",
			kind: "procedural",
			name: "Fix MCP transport mismatch",
			summary: "Use SSE fallback when stdio transport is unstable",
			searchText: "Fix MCP transport mismatch",
			steps: [{ id: "s1", text: "Use SSE fallback", kind: "step" }],
			status: "draft",
			version: 1,
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
			accessCount: 2,
			importance: 8,
			salience: 8,
			confidence: 0.7,
			retention: "ambient",
			stability: "situational",
			tags: ["mcp", "sse"],
			sourceEpisodeIds: ["episode:a"],
			sourceFacetIds: ["facet:a"],
			scope: { project: "demo" },
		},
		{
			id: "proc:b",
			kind: "procedural",
			name: "Fix MCP transport mismatch",
			summary: "Use SSE fallback when stdio handshake fails",
			searchText: "Fix MCP transport mismatch",
			steps: [{ id: "s2", text: "Validate stdio handshake failure", kind: "warning" }],
			status: "active",
			version: 1,
			createdAt: "2026-01-02T00:00:00.000Z",
			updatedAt: "2026-01-02T00:00:00.000Z",
			accessCount: 1,
			importance: 7,
			salience: 7,
			confidence: 0.8,
			retention: "key-event",
			stability: "stable",
			tags: ["mcp", "sse", "stdio"],
			sourceEpisodeIds: ["episode:a"],
			sourceFacetIds: ["facet:a"],
			scope: { project: "demo" },
		},
	];

	const result = reconsolidateV2Memories(
		episodes,
		facets,
		procedural,
		["episode:a"],
		["facet:a"],
		["proc:a", "proc:b"],
	);

	assert.equal(result.episodes[0]?.retention, "key-event");
	assert.equal(result.facets[0]?.stability, "stable");
	assert.equal(result.procedural.length, 2);
	const activeProcedure = result.procedural.find((entry) => entry.status === "active");
	const supersededProcedure = result.procedural.find((entry) => entry.status === "superseded");
	assert.ok(activeProcedure);
	assert.ok(supersededProcedure);
	assert.ok((activeProcedure.steps.length ?? 0) >= 2);
	assert.ok(activeProcedure.supersedesIds?.includes(supersededProcedure.id));
	assert.equal(supersededProcedure.supersededById, activeProcedure.id);
});
