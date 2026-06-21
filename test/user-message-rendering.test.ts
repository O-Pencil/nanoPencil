import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@catui/tui";
import { UserMessageComponent } from "../modes/interactive/components/user-message.js";
import { initTheme } from "../modes/interactive/theme/theme.js";

initTheme("dark");

test("user message keeps every rendered row within terminal width for narrow CJK content", () => {
	const component = new UserMessageComponent("你好 world");

	const lines = component.render(2);

	assert.ok(lines.length > 0);
	for (const line of lines) {
		assert.ok(
			visibleWidth(line) <= 2,
			`Expected user message line to fit width 2, got ${visibleWidth(line)} for ${JSON.stringify(line)}`,
		);
	}
});
