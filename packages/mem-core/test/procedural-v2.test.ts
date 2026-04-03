import test from "node:test";
import assert from "node:assert/strict";

import { compileProcedureFromEpisode } from "../src/procedural-v2.js";
import type { EpisodeFacet, EpisodeMemory } from "../src/types-v2.js";

function makeEpisode(): EpisodeMemory {
	return {
		id: "episode:test",
		kind: "episode",
		sessionId: "sess-1",
		title: "Fix MCP transport",
		summary: "We fixed the MCP transport mismatch by falling back to SSE mode.",
		userGoal: "Fix MCP transport mismatch",
		outcome: "completed",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		accessCount: 0,
		importance: 8,
		salience: 8,
		confidence: 0.9,
		retention: "key-event",
		stability: "stable",
		tags: ["mcp", "transport", "sse"],
		filesModified: [],
		toolsUsed: {},
		entities: [],
		facetIds: [],
		derivedSemanticIds: [],
		derivedProcedureIds: [],
		scope: { project: "demo" },
	};
}

function makeFacet(id: string, facetType: EpisodeFacet["facetType"], searchText: string): EpisodeFacet {
	return {
		id,
		kind: "facet",
		episodeId: "episode:test",
		facetType,
		searchText,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		accessCount: 0,
		importance: 7,
		salience: 7,
		confidence: 0.8,
		retention: "ambient",
		stability: "stable",
		tags: ["mcp", "transport"],
		scope: { project: "demo" },
	};
}

test("procedural-v2: compiles procedure from goal + insights + errors", () => {
	const procedure = compileProcedureFromEpisode(makeEpisode(), [
		makeFacet("f1", "goal", "Fix MCP transport mismatch"),
		makeFacet("f2", "insight", "Use SSE fallback when stdio transport is unstable"),
		makeFacet("f3", "error", "stdio transport failed handshake"),
		makeFacet("f4", "outcome", "SSE fallback restored MCP communication"),
	]);

	assert.ok(procedure);
	assert.equal(procedure?.kind, "procedural");
	assert.equal(procedure?.searchText, "Fix MCP transport mismatch");
	assert.ok((procedure?.steps.length ?? 0) >= 3);
	assert.match(procedure?.summary ?? "", /Fix MCP transport mismatch|When working on/i);
});
