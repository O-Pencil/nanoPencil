import assert from "node:assert/strict";
import test from "node:test";
import { createSandboxHook } from "../core/tools/bash.js";

test("bash-sandbox: blocks common write operations", () => {
	const hook = createSandboxHook();

	const blockedCommands = [
		"rm -rf tmp",
		"git add .",
		"git commit -m 'x'",
		"mkdir output",
		"echo hi > file.txt",
		"tee result.txt",
	];

	for (const command of blockedCommands) {
		const result = hook({
			command,
			cwd: "/tmp/project",
			env: {},
		});
		assert.match(result.command, /Write operations are not allowed in sandbox mode/);
	}
});

test("bash-sandbox: allows read-oriented commands", () => {
	const hook = createSandboxHook();

	const allowedCommands = [
		"rg SubAgent src",
		"find . -name '*.ts'",
		"ls -la",
		"git status --short",
		"git diff --stat",
	];

	for (const command of allowedCommands) {
		const result = hook({
			command,
			cwd: "/tmp/project",
			env: {},
		});
		assert.equal(result.command, command);
	}
});
