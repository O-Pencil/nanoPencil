import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth, type Component } from "@catui/tui";
import { BranchSummaryMessageComponent } from "../modes/interactive/components/branch-summary-message.js";
import { CompactionSummaryMessageComponent } from "../modes/interactive/components/compaction-summary-message.js";
import { CustomMessageComponent } from "../modes/interactive/components/custom-message.js";
import { SkillInvocationMessageComponent } from "../modes/interactive/components/skill-invocation-message.js";
import { initTheme } from "../modes/interactive/theme/theme.js";

initTheme("dark");

function assertFitsWidth(name: string, component: Component, width: number): void {
	const lines = component.render(width);

	assert.ok(lines.length > 0, `${name} should render at least one line`);
	for (const line of lines) {
		assert.ok(
			visibleWidth(line) <= width,
			`Expected ${name} line to fit width ${width}, got ${visibleWidth(line)} for ${JSON.stringify(line)}`,
		);
	}
}

test("system transcript messages keep every rendered row within terminal width for narrow CJK content", () => {
	const skill = new SkillInvocationMessageComponent({
		name: "你好 skill",
		location: "/tmp/skill.md",
		content: "你好 world",
		userMessage: undefined,
	});
	skill.setExpanded(true);

	const compaction = new CompactionSummaryMessageComponent({
		role: "compactionSummary",
		summary: "你好 world",
		tokensBefore: 1234,
		timestamp: 0,
	});
	compaction.setExpanded(true);

	const branch = new BranchSummaryMessageComponent({
		role: "branchSummary",
		summary: "你好 world",
		fromId: "branch-1",
		timestamp: 0,
	});
	branch.setExpanded(true);

	const custom = new CustomMessageComponent({
		role: "custom",
		customType: "你好",
		content: "你好 world",
		display: true,
		timestamp: 0,
	});

	for (const [name, component] of [
		["skill invocation", skill],
		["compaction summary", compaction],
		["branch summary", branch],
		["custom message", custom],
	] as const) {
		assertFitsWidth(name, component, 2);
	}
});
