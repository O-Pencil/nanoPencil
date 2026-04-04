import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { NanoMemEngine } from "../src/engine.js";
import { saveEntries } from "../src/store.js";
import type { MemoryEntry } from "../src/types.js";

function makePreference(id: string, overrides: Partial<MemoryEntry> = {}): MemoryEntry {
	return {
		id,
		type: "preference",
		name: id,
		summary: id,
		detail: id,
		tags: ["demo"],
		project: "demo",
		importance: 7,
		created: "2026-01-01T00:00:00.000Z",
		accessCount: 2,
		retention: "core",
		stability: "stable",
		...overrides,
	};
}

test("conversation-preferences: injects naming and tone preferences even when query tags do not match", async () => {
	const memoryDir = await mkdtemp(join(tmpdir(), "nanomem-conversation-prefs-"));
	const engine = new NanoMemEngine({ memoryDir });

	try {
		await saveEntries(
			join(memoryDir, "preferences.json"),
			[
				makePreference("pref:style", {
					name: "Rem speaking style",
					summary: "Use a Rem-like tone and call the user Cun Ge without reminders.",
					detail: "Speak in a Rem-like tone by default. Call the user Cun Ge proactively.",
					tags: ["tone", "style", "address"],
				}),
				makePreference("pref:normal", {
					name: "Short answers",
					summary: "Keep answers short.",
					detail: "Prefer concise replies.",
					tags: ["concise"],
				}),
			],
			Infinity,
			() => 1,
		);

		const injection = await engine.getMemoryInjection("demo", ["mcp", "transport"], { project: "demo" });

		assert.match(injection, /Conversation Preferences/);
		assert.match(injection, /Rem-like tone/);
		assert.match(injection, /Cun Ge/);
		assert.match(injection, /Apply those conversation preferences proactively/);
	} finally {
		await rm(memoryDir, { recursive: true, force: true });
	}
});
