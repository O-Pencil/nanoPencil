/**
 * Regression: an over-width rendered line must NOT crash the user's session.
 *
 * A custom component (historically the interactive footer at narrow widths with
 * a long model name) can return a line wider than the terminal. The width check
 * lives in the differential render path (the first render is a full redraw that
 * does not check), so the crash surfaced a moment after launch on the first
 * spinner/footer tick. Previously that threw "Rendered line N exceeds terminal
 * width" and killed the whole TUI in production. Now production clips the line
 * to width and keeps going; the strict opt-in (CATUI_STRICT_RENDER=1 /
 * NODE_ENV=test) still throws so component width bugs surface during dev.
 */

import assert from "node:assert";
import { describe, it } from "node:test";
import { type Component, TUI } from "../src/tui.js";
import { VirtualTerminal } from "./virtual-terminal.js";

class MutableComponent implements Component {
	constructor(public lines: string[]) {}
	render(_width: number): string[] {
		return this.lines;
	}
	invalidate(): void {}
}

// Drive renders synchronously: the public path defers to process.nextTick,
// where a throw would become an uncaught exception. doRender() is synchronous.
function render(tui: TUI): void {
	(tui as unknown as { doRender(): void }).doRender();
}

function withStrictRender(value: string | undefined, fn: () => void): void {
	const prevStrict = process.env.CATUI_STRICT_RENDER;
	const prevNodeEnv = process.env.NODE_ENV;
	// Neutralize NODE_ENV so only CATUI_STRICT_RENDER controls strictness here.
	delete process.env.NODE_ENV;
	if (value === undefined) delete process.env.CATUI_STRICT_RENDER;
	else process.env.CATUI_STRICT_RENDER = value;
	try {
		fn();
	} finally {
		if (prevStrict === undefined) delete process.env.CATUI_STRICT_RENDER;
		else process.env.CATUI_STRICT_RENDER = prevStrict;
		if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
		else process.env.NODE_ENV = prevNodeEnv;
	}
}

const OVER_WIDTH = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123"; // 30 visible chars at width 20

describe("Over-width line handling", () => {
	it("clips an over-width line on a differential update instead of crashing", async () => {
		const prevStrict = process.env.CATUI_STRICT_RENDER;
		const prevNodeEnv = process.env.NODE_ENV;
		delete process.env.CATUI_STRICT_RENDER;
		delete process.env.NODE_ENV; // production-like: graceful clip, no throw
		try {
			const terminal = new VirtualTerminal(20, 6);
			const tui = new TUI(terminal);
			const component = new MutableComponent(["short"]);
			tui.addChild(component);

			tui.start(); // first render: full redraw, no width check
			await terminal.flush();

			// A later update introduces an over-width line -> differential path.
			component.lines = [OVER_WIDTH];
			tui.requestRender();
			await terminal.flush(); // must not throw / crash

			const viewport = terminal.getViewport();
			assert.ok(viewport[0]?.startsWith("ABCDEFGHIJKLMNOPQRST"), `Clipped prefix kept: ${JSON.stringify(viewport[0])}`);
			assert.ok(!viewport[0]?.includes("0123"), `Overflow clipped: ${JSON.stringify(viewport[0])}`);

			tui.stop();
		} finally {
			if (prevStrict === undefined) delete process.env.CATUI_STRICT_RENDER;
			else process.env.CATUI_STRICT_RENDER = prevStrict;
			if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
			else process.env.NODE_ENV = prevNodeEnv;
		}
	});

	it("throws in strict mode so component width bugs surface in dev/test", () => {
		withStrictRender("1", () => {
			const terminal = new VirtualTerminal(20, 6);
			const tui = new TUI(terminal);
			const component = new MutableComponent(["short"]);
			tui.addChild(component);

			render(tui); // first render: full redraw, no width check

			component.lines = [OVER_WIDTH];
			assert.throws(() => render(tui), /exceeds terminal width/, "Strict mode should throw on an over-width line");

			tui.stop();
		});
	});
});
