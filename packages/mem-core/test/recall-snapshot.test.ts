import test from "node:test";
import assert from "node:assert/strict";
import { NanoMemEngine } from "../src/engine.js";
import { TURN_CONTEXT_GLOBAL_KEY } from "../src/turn-context.js";
import type { MemoryEntry } from "../src/types.js";
import type { EpisodeMemory, ProceduralMemory, SemanticMemory } from "../src/types-v2.js";

function clearTurnContext(): void {
	(globalThis as Record<string, unknown>)[TURN_CONTEXT_GLOBAL_KEY] = {};
}

function makeFacet(id: string): MemoryEntry {
	return {
		id,
		type: "pattern",
		name: "Pattern bridge",
		summary: "Bridge a legacy pattern into the injected context.",
		detail: "Legacy pattern detail",
		tags: ["demo", "runtime"],
		project: "demo",
		importance: 7,
		created: "2026-01-01T00:00:00.000Z",
		accessCount: 1,
		retention: "ambient",
		stability: "stable",
		facetData: {
			kind: "pattern",
			trigger: "runtime drift",
			behavior: "check anchor bridge",
		},
	};
}

function makeEpisode(id: string): EpisodeMemory {
	return {
		id,
		kind: "episode",
		sessionId: "session:test",
		title: "Episode",
		summary: "Episode summary",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		accessCount: 1,
		importance: 8,
		salience: 8,
		confidence: 0.9,
		retention: "key-event",
		stability: "stable",
		tags: ["demo", "runtime"],
		scope: { project: "demo" },
		filesModified: [],
		toolsUsed: {},
		entities: [],
		facetIds: [],
		derivedSemanticIds: [],
		derivedProcedureIds: [],
	};
}

function makeSemantic(id: string): SemanticMemory {
	return {
		id,
		kind: "semantic",
		semanticType: "decision",
		name: "Semantic",
		summary: "Semantic summary",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		accessCount: 1,
		importance: 8,
		salience: 8,
		confidence: 0.9,
		retention: "key-event",
		stability: "stable",
		tags: ["demo", "runtime"],
		scope: { project: "demo" },
	};
}

function makeProcedure(id: string): ProceduralMemory {
	return {
		id,
		kind: "procedural",
		name: "Procedure",
		summary: "Procedure summary",
		searchText: "Procedure search text",
		steps: [{ id: `${id}:1`, text: "Do the thing", kind: "step" }],
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
		tags: ["demo", "runtime"],
		scope: { project: "demo" },
	};
}

test("publishRecallSnapshot marks legacy breakdown unavailable and uses actual injection order", () => {
	const engine = new NanoMemEngine({ structuralWeight: 0.15 });
	const legacyFacet = makeFacet("facet:legacy");
	const episode = makeEpisode("episode:test");
	const semantic = makeSemantic("semantic:test");
	const procedural = makeProcedure("procedural:test");

	const selection = {
		active: {
			knowledge: [],
			lessons: [],
			events: [],
			preferences: [],
			facets: [legacyFacet],
			episodeMemories: [episode],
			episodeFacets: [],
			semanticMemories: [semantic],
			procedural: [procedural],
		},
		cue: {
			knowledge: [],
			lessons: [],
			events: [],
			preferences: [],
			facets: [],
			episodes: [],
			work: [],
			episodeMemories: [],
			episodeFacets: [],
			semanticMemories: [],
			procedural: [],
		},
		allEntries: [],
		graphContext: [],
		injectedActiveKnowledge: [],
		injectedActiveLessons: [],
		injectedActiveEvents: [],
		injectedActivePrefs: [],
		injectedCueKnowledge: [],
		injectedCueLessons: [],
		injectedCueEvents: [],
		injectedCuePrefs: [],
		injectedCueEpisodes: [],
		legacyFacetBridgeActive: [legacyFacet],
		legacyFacetBridgeCue: [],
	};

	clearTurnContext();
	try {
		(engine as any).publishRecallSnapshot(selection, "demo", ["demo", "runtime"]);
		const snapshot = (globalThis as Record<string, any>)[TURN_CONTEXT_GLOBAL_KEY]
			?.memoryRecallSnapshot as Array<Record<string, unknown>>;
		assert.ok(snapshot);

		const byKey = new Map(
			snapshot.map((record) => [`${record.memoryKind}:${record.memoryId}`, record]),
		);

		const legacyRecord = byKey.get("facet:facet:legacy");
		assert.ok(legacyRecord);
		assert.equal(legacyRecord.scoreBreakdownStatus, "unavailable");
		assert.equal(legacyRecord.scoreRecency, undefined);
		assert.equal(legacyRecord.scoreRelevance, undefined);

		assert.equal(byKey.get("facet:facet:legacy")?.injectRank, 1);
		assert.equal(byKey.get("episode:episode:test")?.injectRank, 2);
		assert.equal(byKey.get("semantic:semantic:test")?.injectRank, 3);
		assert.equal(byKey.get("procedural:procedural:test")?.injectRank, 4);
		assert.equal(byKey.get("episode:episode:test")?.scoreBreakdownStatus, "available");
	} finally {
		clearTurnContext();
	}
});
