/**
 * [WHO]: Verifies Catui legacy filesystem migration planning/execution
 * [FROM]: Depends on node:test, node:assert, node:fs, node:os, node:path, MigrationManager
 * [TO]: Guards migration from legacy Pencil/NanoPencil roots into the Catui root
 * [HERE]: test/catui-migration-tool.test.ts - focused migration compatibility coverage
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MigrationManager } from "../core/agent-dir/migration-tool.js";

test("migration copies legacy NanoPencil and Pencil roots into Catui agents", () => {
	const home = mkdtempSync(join(tmpdir(), "catui-migration-"));
	try {
		const nanoAgent = join(home, ".nanopencil", "agent");
		const pencilAgent = join(home, ".pencils", "agents", "mo-yan");
		mkdirSync(nanoAgent, { recursive: true });
		mkdirSync(pencilAgent, { recursive: true });
		writeFileSync(join(nanoAgent, "models.json"), JSON.stringify({ source: "nano" }), "utf-8");
		writeFileSync(join(pencilAgent, "settings.json"), JSON.stringify({ source: "pencil" }), "utf-8");

		const migrated = new MigrationManager(home).runSilent();

		assert.ok(migrated.includes("Global Agent Data"));
		assert.ok(migrated.includes("Catui Agent: mo-yan"));
		const defaultModels = join(home, ".catui", "agents", "default", "models.json");
		const namedSettings = join(home, ".catui", "agents", "mo-yan", "settings.json");
		assert.ok(existsSync(defaultModels), "default Catui agent should be copied from .nanopencil/agent");
		assert.ok(existsSync(namedSettings), "named Catui agent should be copied from .pencils/agents/<id>");
		assert.deepEqual(JSON.parse(readFileSync(defaultModels, "utf-8")), { source: "nano" });
		assert.deepEqual(JSON.parse(readFileSync(namedSettings, "utf-8")), { source: "pencil" });
	} finally {
		rmSync(home, { recursive: true, force: true });
	}
});
