import test from "node:test";
import assert from "node:assert/strict";

import { cosineSimilarity } from "../src/embedding-index.js";
import { createHashedEmbeddingFn } from "../src/hash-embedding.js";

test("hash embedding: deterministic vectors for same text", async () => {
	const embed = createHashedEmbeddingFn(64);
	const [a, b] = await embed(["NanoMem remembers procedural context", "NanoMem remembers procedural context"]);
	assert.equal(a.length, 64);
	assert.deepEqual(a, b);
});

test("hash embedding: similar text scores higher than unrelated text", async () => {
	const embed = createHashedEmbeddingFn(128);
	const [query, similar, unrelated] = await embed([
		"debug MCP transport issue in project",
		"project MCP transport debugging and issue resolution",
		"cooking recipe for tomato pasta",
	]);

	const similarScore = cosineSimilarity(query, similar);
	const unrelatedScore = cosineSimilarity(query, unrelated);

	assert.ok(similarScore > unrelatedScore);
	assert.ok(similarScore > 0);
});
