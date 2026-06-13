/**
 * [WHO]: Verifies Catui extension loader canonical and legacy import aliases
 * [FROM]: Depends on node:test, node:assert, extension loader test hooks
 * [TO]: Guards extension import compatibility across the Catui rebrand
 * [HERE]: test/extension-loader-catui-aliases.test.ts - focused loader alias contract coverage
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
	__getExtensionAliasesForTest,
	__getExtensionVirtualModulesForTest,
} from "../core/extensions-host/loader.js";

test("extension loader exposes Catui canonical and Pencil legacy imports", async () => {
	const aliases = __getExtensionAliasesForTest();
	assert.equal(aliases["@catui/agent"], aliases["@pencil-agent/nano-pencil"]);

	const virtualModules = await __getExtensionVirtualModulesForTest();
	assert.ok(virtualModules["@catui/agent"]);
	assert.ok(virtualModules["@pencil-agent/nano-pencil"]);
});
