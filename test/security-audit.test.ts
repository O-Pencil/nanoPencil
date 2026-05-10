import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import type { ExtensionAPI, ToolCallEvent, ToolCallEventResult } from "../core/extensions/types.js";

const tempAgentDir = mkdtempSync(join(tmpdir(), "nanopencil-security-"));
process.env.NANOPENCIL_AGENT_DIR = tempAgentDir;
process.env.SECURITY_MODE = "strict";

const { default: securityAuditExtension } = await import("../extensions/defaults/security-audit/index.js");

after(() => {
	rmSync(tempAgentDir, { recursive: true, force: true });
});

function createHarness() {
	const handlers = new Map<string, Array<(event: unknown) => unknown>>();
	const messages: string[] = [];

	const api = {
		registerCommand: () => {},
		sendMessage: (message: { content: string }) => messages.push(message.content),
		on: (event: string, handler: (event: unknown) => unknown) => {
			const list = handlers.get(event) ?? [];
			list.push(handler);
			handlers.set(event, list);
		},
	} as unknown as ExtensionAPI;

	const emitToolCall = async (event: ToolCallEvent): Promise<ToolCallEventResult | undefined> => {
		for (const handler of handlers.get("tool_call") ?? []) {
			const result = await handler(event);
			if ((result as ToolCallEventResult | undefined)?.block) {
				return result as ToolCallEventResult;
			}
		}
		return undefined;
	};

	return { api, messages, emitToolCall };
}

test("security-audit blocks dangerous bash commands at tool_call boundary", async () => {
	const harness = createHarness();
	await securityAuditExtension(harness.api);

	const result = await harness.emitToolCall({
		type: "tool_call",
		toolCallId: "call-1",
		toolName: "bash",
		input: { command: "rm -rf tmp" },
	});

	assert.equal(result?.block, true);
	assert.match(result?.reason ?? "", /Security blocked bash command/);
	assert.match(harness.messages[0], /Security blocked bash command/);

	const logPath = join(tempAgentDir, "security-audit.json");
	assert.equal(existsSync(logPath), true);
	const logs = JSON.parse(readFileSync(logPath, "utf-8")) as Array<{ status: string; target: string }>;
	assert.ok(logs.some((entry) => entry.status === "blocked" && entry.target === "rm -rf tmp"));
});

test("security-audit allows safe bash commands", async () => {
	const harness = createHarness();
	await securityAuditExtension(harness.api);

	const result = await harness.emitToolCall({
		type: "tool_call",
		toolCallId: "call-2",
		toolName: "bash",
		input: { command: "git status --short" },
	});

	assert.equal(result, undefined);
	assert.deepEqual(harness.messages, []);
});

test("security-audit blocks sensitive file writes at tool_call boundary", async () => {
	const harness = createHarness();
	await securityAuditExtension(harness.api);

	const result = await harness.emitToolCall({
		type: "tool_call",
		toolCallId: "call-3",
		toolName: "write",
		input: { path: ".env", content: "TOKEN=secret" },
	});

	assert.equal(result?.block, true);
	assert.match(result?.reason ?? "", /Security blocked write/);
	assert.match(harness.messages[0], /Path: `.env`/);
});
