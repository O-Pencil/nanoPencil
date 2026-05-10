import assert from "node:assert/strict";
import test from "node:test";
import { createFindTool } from "../core/tools/find.js";
import { createGrepTool } from "../core/tools/grep.js";
import { createLsTool } from "../core/tools/ls.js";
import { validateIntegerWindowOption, validatePositiveNumberOption } from "../core/tools/input-validation.js";

test("tool window validation rejects values outside integer bounds", () => {
	assert.doesNotThrow(() => validateIntegerWindowOption({ name: "limit", value: 1, minimum: 1 }));
	assert.doesNotThrow(() => validateIntegerWindowOption({ name: "context", value: 0, minimum: 0 }));
	assert.throws(
		() => validateIntegerWindowOption({ name: "limit", value: 0, minimum: 1 }),
		/limit must be an integer greater than or equal to 1/,
	);
	assert.throws(
		() => validateIntegerWindowOption({ name: "context", value: 0.5, minimum: 0 }),
		/context must be an integer greater than or equal to 0/,
	);
	assert.doesNotThrow(() => validatePositiveNumberOption("timeout", 0.1));
	assert.throws(
		() => validatePositiveNumberOption("timeout", 0),
		/timeout must be a positive number/,
	);
});

test("search tools reject invalid window options before running backends", async () => {
	const cwd = process.cwd();
	await assert.rejects(
		() => createFindTool(cwd).execute("find-limit", { pattern: "*.ts", limit: 0 }),
		/limit must be an integer greater than or equal to 1/,
	);
	await assert.rejects(
		() => createLsTool(cwd).execute("ls-limit", { limit: 1.5 }),
		/limit must be an integer greater than or equal to 1/,
	);
	await assert.rejects(
		() => createGrepTool(cwd).execute("grep-context", { pattern: "needle", context: -1 }),
		/context must be an integer greater than or equal to 0/,
	);
});
