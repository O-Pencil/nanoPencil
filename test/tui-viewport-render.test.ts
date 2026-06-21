/**
 * [WHO]: TUI viewport render regression tests
 * [FROM]: Depends on node:test, core/lib/tui/src/tui.ts, core/lib/tui/test/virtual-terminal.ts
 * [TO]: Consumed by repository test runner
 * [HERE]: test/tui-viewport-render.test.ts - verifies bottom input updates overwrite the same visible row instead of stacking
 */

import assert from "node:assert/strict";
import test from "node:test";
import { Editor } from "../core/lib/tui/src/components/editor.js";
import { CURSOR_MARKER, TUI, type Component } from "../core/lib/tui/src/tui.js";
import { visibleWidth } from "../core/lib/tui/src/utils.js";
import { defaultEditorTheme } from "../core/lib/tui/test/test-themes.js";
import { VirtualTerminal } from "../core/lib/tui/test/virtual-terminal.js";

class TestComponent implements Component {
	public lines: string[] = [];

	render(): string[] {
		return this.lines;
	}

	invalidate(): void {}
}

test("tui bottom input updates overwrite the same visible row while typing", async () => {
	const terminal = new VirtualTerminal(40, 6);
	const tui = new TUI(terminal);
	const component = new TestComponent();
	tui.addChild(component);

	const renderInput = (text: string) => {
		component.lines = Array.from({ length: 12 }, (_, index) => (
			index === 11 ? `${text}${CURSOR_MARKER}` : `L${index}`
		));
	};

	renderInput("");
	tui.start();
	await terminal.flush();

	for (const text of ["现", "现在", "现在几", "现在几点", "现在几点了"]) {
		renderInput(text);
		tui.requestRender();
		await terminal.flush();

		const viewport = terminal.getViewport();
		assert.deepEqual(viewport.slice(0, 5), ["L6", "L7", "L8", "L9", "L10"]);
		assert.equal(viewport[5], text);
	}

	tui.stop();
});

test("tui keeps the bottom input visible while transcript content grows during streaming", async () => {
	const terminal = new VirtualTerminal(40, 6);
	const tui = new TUI(terminal);
	const component = new TestComponent();
	tui.addChild(component);

	const renderStreamingFrame = (count: number, input: string) => {
		component.lines = [
			...Array.from({ length: count }, (_, index) => `stream ${index}`),
			`${input}${CURSOR_MARKER}`,
		];
	};

	renderStreamingFrame(4, "typing");
	tui.start();
	await terminal.flush();

	for (const count of [5, 6, 8, 11, 14]) {
		renderStreamingFrame(count, "typing");
		tui.requestRender();
		await terminal.flush();

		const viewport = terminal.getViewport();
		assert.equal(viewport[5], "typing");
		assert.equal(
			viewport.filter((line) => line.trim() === "typing").length,
			1,
		);
	}

	tui.stop();
});

test("tui keeps a wrapped multi-line editor visible while transcript content grows during typing", async () => {
	const terminal = new VirtualTerminal(28, 8);
	const tui = new TUI(terminal);
	const transcript = new TestComponent();
	const editor = new Editor(tui, defaultEditorTheme, { paddingX: 0 });
	tui.addChild(transcript);
	tui.addChild(editor);
	tui.setFocus(editor);

	transcript.lines = ["stream 0", "stream 1", "stream 2"];
	tui.start();
	await terminal.flush();

	const input = "现在测试一个很长的问题，包含EnglishWordsAnd中文换行，继续打字不要重复渲染";
	let typed = "";

	for (const char of [...input]) {
		typed += char;
		if ([...typed].length % 7 === 0) {
			transcript.lines.push(`stream ${transcript.lines.length}`);
		}
		terminal.sendInput(char);
		await terminal.flush();

		const viewport = terminal.getViewport();
		for (const line of viewport) {
			assert.ok(
				visibleWidth(line) <= terminal.columns,
				`viewport line exceeded terminal width: ${JSON.stringify(line)}`,
			);
		}
		assert.equal(
			viewport.findLast((line) => line.trim() !== ""),
			"────────────────────────────",
		);
		assert.equal(
			viewport.filter((line) => line.includes("重复渲染")).length,
			typed.includes("重复渲染") ? 1 : 0,
		);
	}

	const viewport = terminal.getViewport();
	assert.deepEqual(viewport.slice(-5), [
		"────────────────────────────",
		"现在测试一个很长的问题，包  ",
		"含EnglishWordsAnd中文换行， ",
		"继续打字不要重复渲染        ",
		"────────────────────────────",
	]);

	tui.stop();
});
