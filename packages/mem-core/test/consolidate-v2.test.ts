import test from "node:test";
import assert from "node:assert/strict";

import { getConfig } from "../src/config.js";
import { consolidateV2Memories } from "../src/consolidate-v2.js";
import type { EpisodeFacet, EpisodeMemory, ProceduralMemory } from "../src/types-v2.js";

const cfg = getConfig({ memoryDir: "/tmp/nanomem-test" });

const episode: EpisodeMemory = {
	id: "episode:test",
	kind: "episode",
	sessionId: "sess-1",
	title: "Fix MCP transport",
	summary: "We fixed the MCP transport mismatch by switching to SSE fallback.",
	userGoal: "Fix MCP transport mismatch",
	outcome: "completed",
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
	accessCount: 0,
	importance: 9,
	salience: 9,
	confidence: 0.9,
	retention: "key-event",
	stability: "stable",
	tags: ["mcp", "transport", "sse"],
	filesModified: [],
	toolsUsed: {},
	entities: [],
	facetIds: ["f1", "f2"],
	derivedSemanticIds: [],
	derivedProcedureIds: ["p1"],
	scope: { project: "demo" },
};

const facets: EpisodeFacet[] = [
	{
		id: "f1",
		kind: "facet",
		episodeId: "episode:test",
		facetType: "error",
		searchText: "stdio transport failed handshake",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		accessCount: 0,
		importance: 7,
		salience: 7,
		confidence: 0.7,
		retention: "ambient",
		stability: "situational",
		tags: ["mcp", "stdio"],
		scope: { project: "demo" },
	},
	{
		id: "f2",
		kind: "facet",
		episodeId: "episode:test",
		facetType: "insight",
		searchText: "Use SSE fallback when stdio transport is unstable",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		accessCount: 0,
		importance: 7,
		salience: 7,
		confidence: 0.8,
		retention: "ambient",
		stability: "stable",
		tags: ["mcp", "sse"],
		scope: { project: "demo" },
	},
];

const procedural: ProceduralMemory[] = [
	{
		id: "p1",
		kind: "procedural",
		name: "Fix MCP transport mismatch",
		summary: "Switch to SSE fallback when stdio transport is unstable.",
		searchText: "Fix MCP transport mismatch",
		steps: [{ id: "s1", text: "Use SSE fallback", kind: "step" }],
		status: "active",
		version: 1,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		accessCount: 0,
		importance: 8,
		salience: 8,
		confidence: 0.8,
		retention: "key-event",
		stability: "stable",
		tags: ["mcp", "sse"],
		sourceEpisodeIds: ["episode:test"],
		scope: { project: "demo" },
	},
];

test("consolidate-v2: produces legacy entries and v2 semantic memories", () => {
	const result = consolidateV2Memories([episode], facets, procedural, cfg);

	assert.ok(result.entries.length >= 3);
	assert.ok(result.semantic.length >= 3);
	assert.ok(result.episodeSemanticMap.get("episode:test")?.length);
	assert.ok(result.entries.some((entry) => entry.type === "lesson"));
	assert.ok(result.semantic.some((entry) => entry.semanticType === "decision"));
});
