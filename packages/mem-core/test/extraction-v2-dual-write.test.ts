import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { NanoMemEngine } from "../src/engine.js";

test("extraction-v2-dual-write: extracted items are also written into V2 semantic memory", async () => {
	const memoryDir = await mkdtemp(join(tmpdir(), "nanomem-extract-v2-"));
	const llmFn = async () =>
		JSON.stringify([
			{
				type: "lesson",
				name: "SSE fallback lesson",
				summary: "Use SSE fallback when MCP stdio transport is unstable.",
				detail: "Use SSE fallback when MCP stdio transport is unstable.",
			},
			{
				type: "preference",
				name: "Prefers direct fixes",
				summary: "The user prefers direct fixes over long analysis.",
				detail: "The user prefers direct fixes over long analysis.",
			},
		]);
	const engine = new NanoMemEngine({ memoryDir }, llmFn);

	try {
		const items = await engine.extractAndStore("dummy transcript", "demo");
		const snapshot = await engine.exportAllV2();

		assert.equal(items.length, 2);
		assert.ok(snapshot.semantic.some((entry) => entry.semanticType === "lesson" && entry.name === "SSE fallback lesson"));
		assert.ok(snapshot.semantic.some((entry) => entry.semanticType === "preference" && entry.name === "Prefers direct fixes"));
	} finally {
		await rm(memoryDir, { recursive: true, force: true });
	}
});
