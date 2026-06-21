import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@catui/tui";
import { ToolExecutionComponent } from "../modes/interactive/components/tool-execution.js";
import { initTheme } from "../modes/interactive/theme/theme.js";

initTheme("dark");

const ui = {
	terminal: { columns: 2 },
	requestRender(): void {},
};

test("tool execution keeps every rendered row within terminal width for narrow CJK content", () => {
	const component = new ToolExecutionComponent("read", { path: "/tmp/你好.txt" }, {}, undefined, ui as any);
	component.updateResult({ content: [{ type: "text", text: "你好 world" }], isError: false }, false);

	const lines = component.render(2);

	assert.ok(lines.length > 0);
	for (const line of lines) {
		assert.ok(
			visibleWidth(line) <= 2,
			`Expected tool execution line to fit width 2, got ${visibleWidth(line)} for ${JSON.stringify(line)}`,
		);
	}
});
