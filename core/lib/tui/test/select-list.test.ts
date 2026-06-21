import assert from "node:assert";
import { describe, it } from "node:test";
import { SelectList } from "../src/components/select-list.js";
import { visibleWidth } from "../src/utils.js";

const testTheme = {
	selectedPrefix: (text: string) => text,
	selectedText: (text: string) => text,
	description: (text: string) => text,
	scrollInfo: (text: string) => text,
	noMatch: (text: string) => text,
};

describe("SelectList", () => {
	it("normalizes multiline descriptions to single line", () => {
		const items = [
			{
				value: "test",
				label: "test",
				description: "Line one\nLine two\nLine three",
			},
		];

		const list = new SelectList(items, 5, testTheme);
		const rendered = list.render(100);

		assert.ok(rendered.length > 0);
		assert.ok(!rendered[0].includes("\n"));
		assert.ok(rendered[0].includes("Line one Line two Line three"));
	});

	it("keeps no-match output within narrow selector width", () => {
		const list = new SelectList([{ value: "abc", label: "abc" }], 5, testTheme);
		list.setFilter("zzz");

		const rendered = list.render(2);

		assert.ok(rendered.length > 0);
		for (const line of rendered) {
			assert.ok(
				visibleWidth(line) <= 2,
				`Expected no-match line to fit width 2, got ${visibleWidth(line)} for ${JSON.stringify(line)}`,
			);
		}
	});
});
