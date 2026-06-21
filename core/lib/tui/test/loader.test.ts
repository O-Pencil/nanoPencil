import assert from "node:assert/strict";
import test from "node:test";
import type { TUI } from "../src/tui.js";
import { Loader } from "../src/components/loader.js";

test("Loader start is idempotent so repeated starts do not create duplicate render timers", () => {
	const originalSetInterval = globalThis.setInterval;
	const originalClearInterval = globalThis.clearInterval;
	let intervalCount = 0;
	let clearCount = 0;

	(globalThis as unknown as { setInterval: typeof setInterval }).setInterval = ((() => {
		intervalCount += 1;
		return intervalCount;
	}) as unknown) as typeof setInterval;
	(globalThis as unknown as { clearInterval: typeof clearInterval }).clearInterval = ((() => {
		clearCount += 1;
	}) as unknown) as typeof clearInterval;

	try {
		const ui = { requestRender: () => {} } as TUI;
		const loader = new Loader(ui, (value) => value, (value) => value, "Loading...");

		loader.start();
		loader.start();
		loader.stop();

		assert.equal(intervalCount, 1);
		assert.equal(clearCount, 1);
	} finally {
		globalThis.setInterval = originalSetInterval;
		globalThis.clearInterval = originalClearInterval;
	}
});

test("Loader constructor prepares first frame without requesting a render before mount", () => {
	const originalSetInterval = globalThis.setInterval;
	const originalClearInterval = globalThis.clearInterval;
	let renderRequests = 0;

	(globalThis as unknown as { setInterval: typeof setInterval }).setInterval = ((() => 1) as unknown) as typeof setInterval;
	(globalThis as unknown as { clearInterval: typeof clearInterval }).clearInterval = ((() => {}) as unknown) as typeof clearInterval;

	try {
		const ui = { requestRender: () => { renderRequests += 1; } } as TUI;
		const loader = new Loader(ui, (value) => value, (value) => value, "Loading...");

		assert.equal(renderRequests, 0);
		assert.equal(loader.render(40)[1]?.trim(), "⠋ Loading...");
		loader.stop();
	} finally {
		globalThis.setInterval = originalSetInterval;
		globalThis.clearInterval = originalClearInterval;
	}
});
