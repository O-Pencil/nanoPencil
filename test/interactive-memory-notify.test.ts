import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InteractiveMode } from "../modes/interactive/interactive-mode.js";
import { SessionManager } from "../core/session/session-manager.js";

test("interactive-memory-notify: NanoMem command notifications remain visible when memory trace is disabled", () => {
	const mode = Object.create(InteractiveMode.prototype) as InteractiveMode & {
		showExtensionNotify: (message: string, type?: "info" | "warning" | "error") => void;
		settingsManager: { getShowMemoryTrace(): boolean };
		showStatus: (message: string) => void;
		showWarning: (message: string) => void;
		showError: (message: string) => void;
	};

	const calls: Array<{ kind: string; message: string }> = [];
	Object.defineProperty(mode, "settingsManager", {
		value: {
			getShowMemoryTrace: () => false,
		},
		configurable: true,
	});
	mode.showStatus = (message: string) => {
		calls.push({ kind: "status", message });
	};
	mode.showWarning = (message: string) => {
		calls.push({ kind: "warning", message });
	};
	mode.showError = (message: string) => {
		calls.push({ kind: "error", message });
	};

	mode.showExtensionNotify("NanoMem: insights report written to /tmp/report.html", "info");

	assert.deepEqual(calls, [
		{
			kind: "status",
			message: "NanoMem: insights report written to /tmp/report.html",
		},
	]);
});

test("session-manager: persists a user-only turn before any assistant reply", () => {
	const rootDir = mkdtempSync(join(tmpdir(), "nanopencil-session-persist-"));
	const sessionDir = join(rootDir, "sessions");
	const manager = SessionManager.create(rootDir, sessionDir);

	try {
		manager.appendMessage({
			role: "user",
			content: [{ type: "text", text: "hello from user-only turn" }],
			timestamp: Date.now(),
		});

		const sessionFile = manager.getSessionFile();
		assert.ok(sessionFile, "expected a persisted session file");

		const rawSession = readFileSync(sessionFile, "utf-8");
		assert.match(rawSession, /"role":"user"/);
		assert.match(rawSession, /hello from user-only turn/);

		const reopened = SessionManager.open(sessionFile, sessionDir);
		const reopenedContext = reopened.buildSessionContext();
		assert.equal(reopenedContext.messages.length, 1);
		assert.equal(reopenedContext.messages[0]?.role, "user");
	} finally {
		rmSync(rootDir, { recursive: true, force: true });
	}
});
