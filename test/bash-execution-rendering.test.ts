import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@catui/tui";
import { BashExecutionComponent } from "../modes/interactive/components/bash-execution.js";
import { initTheme } from "../modes/interactive/theme/theme.js";

initTheme("dark");

const ui = {
	terminal: { columns: 2 },
	requestRender(): void {},
};

test("bash execution keeps every rendered row within terminal width for narrow CJK output", () => {
	const component = new BashExecutionComponent("echo 你好", ui as any);
	component.appendOutput("你好 world");
	component.setComplete(0, false);

	const lines = component.render(2);

	assert.ok(lines.length > 0);
	for (const line of lines) {
		assert.ok(
			visibleWidth(line) <= 2,
			`Expected bash execution line to fit width 2, got ${visibleWidth(line)} for ${JSON.stringify(line)}`,
		);
	}
});
