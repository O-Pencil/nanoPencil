import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadEntriesFromFile } from "../core/session/session-manager.js";

function createTempDir(prefix: string): string {
	return mkdtempSync(join(tmpdir(), prefix));
}

test("session-manager drops files without a valid session header id", () => {
	const root = createTempDir("catui-session-header-");
	try {
		const file = join(root, "bad.jsonl");
		writeFileSync(
			file,
			`${JSON.stringify({ type: "session", timestamp: new Date().toISOString(), cwd: root })}\n`,
			"utf-8",
		);

		assert.deepEqual(loadEntriesFromFile(file), []);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("session-manager keeps files with a valid session header", () => {
	const root = createTempDir("catui-session-header-");
	try {
		const file = join(root, "good.jsonl");
		const header = {
			type: "session",
			id: "session-1",
			timestamp: new Date().toISOString(),
			cwd: root,
		};
		writeFileSync(file, `${JSON.stringify(header)}\n`, "utf-8");

		assert.deepEqual(loadEntriesFromFile(file), [header]);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
