import assert from "node:assert/strict";
import test from "node:test";
import {
	getTurnContext,
	resetTurnContext,
	setTurnContext,
} from "../core/runtime/turn-context.js";

test("turn-context reset clears structural anchors and recall snapshots", () => {
	setTurnContext("structuralAnchor", {
		modulePath: "core/runtime",
		filePath: "core/runtime/agent-session.ts",
		candidatePaths: ["core/runtime"],
	});
	setTurnContext("memoryRecallSnapshot", [
		{
			memoryId: "sem:test",
			memoryKind: "semantic",
			scoreBreakdownStatus: "available",
			scoreRecency: 0.9,
			scoreImportance: 0.7,
			scoreRelevance: 0.8,
			scoreStructural: 1,
			scoreFinal: 1.2,
			wasInjected: true,
			injectRank: 1,
		},
	]);

	resetTurnContext();

	assert.equal(getTurnContext("structuralAnchor"), undefined);
	assert.equal(getTurnContext("memoryRecallSnapshot"), undefined);
});
