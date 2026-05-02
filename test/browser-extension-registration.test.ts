import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getBuiltinExtensionPaths } from "../builtin-extensions.ts";

test("builtin extensions include browser harness", () => {
	const paths = getBuiltinExtensionPaths();
	assert.ok(
		paths.some((entry) => entry.includes("extensions") && entry.includes("defaults") && entry.includes("browser")),
		`Expected browser extension in builtin paths, got: ${paths.join(", ")}`,
	);
});

test("published package includes vendored browser harness Python files", () => {
	const packageJson = JSON.parse(readFileSync("package.json", "utf-8")) as { files?: string[] };
	assert.ok(
		packageJson.files?.includes("dist/**/*.py"),
		"Expected npm files whitelist to include dist/**/*.py so browser_harness is published.",
	);
});
