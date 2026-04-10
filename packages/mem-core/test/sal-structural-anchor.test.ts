import test from "node:test";
import assert from "node:assert/strict";
import { NanoMemEngine } from "../src/engine.js";
import type { BaseMemoryV2 } from "../src/types-v2.js";

test("sal bridge: currentStructuralAnchor reads only the selected anchor", () => {
	const engine = new NanoMemEngine({ structuralWeight: 0.15 });
	(globalThis as any).__salAnchor = {
		modulePath: "core/runtime",
		filePath: "core/runtime/agent-session.ts",
		candidatePaths: [
			"core/runtime",
			"core/runtime/agent-session.ts",
			"core/session",
			"core/session/session-manager.ts",
		],
	};

	try {
		assert.deepEqual((engine as any).currentStructuralAnchor(), {
			modulePath: "core/runtime",
			filePath: "core/runtime/agent-session.ts",
		});
	} finally {
		(globalThis as any).__salAnchor = undefined;
	}
});

test("sal bridge: computeStructuralBoost uses candidatePaths for structural overlap", () => {
	const engine = new NanoMemEngine({ structuralWeight: 0.15 });
	const entry: BaseMemoryV2 = {
		id: "sem:test",
		kind: "semantic",
		accessCount: 0,
		importance: 7,
		salience: 7,
		confidence: 0.9,
		retention: "key-event",
		stability: "stable",
		tags: ["runtime"],
		scope: { project: "demo" },
		createdAt: "2026-04-10T00:00:00.000Z",
		updatedAt: "2026-04-10T00:00:00.000Z",
		structuralAnchor: {
			modulePath: "core/runtime",
			filePath: "core/runtime/sdk.ts",
		},
		evidence: [
			{
				id: "ev-1",
				sourceType: "file",
				filePath: "core/runtime/sdk.ts",
				createdAt: "2026-04-10T00:00:00.000Z",
			},
		],
	};

	(globalThis as any).__salAnchor = {
		modulePath: "core/runtime",
		filePath: "core/runtime/agent-session.ts",
		candidatePaths: ["core/runtime", "core/runtime/agent-session.ts"],
	};

	try {
		assert.equal((engine as any).computeStructuralBoost(entry), 1);
	} finally {
		(globalThis as any).__salAnchor = undefined;
	}
});
