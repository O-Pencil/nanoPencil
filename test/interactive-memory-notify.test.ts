import test from "node:test";
import assert from "node:assert/strict";
import { InteractiveMode } from "../modes/interactive/interactive-mode.js";

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
