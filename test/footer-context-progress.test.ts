import assert from "node:assert/strict";
import test from "node:test";
import { renderContextProgressBar } from "../modes/interactive/components/footer.js";
import { initTheme } from "../modes/interactive/theme/theme.js";

initTheme("dark");

function stripAnsi(text: string): string {
	return text.replace(/\x1b\[[0-9;]*m/g, "");
}

test("context progress bar clamps overflow percentages to bar width", () => {
	assert.equal(stripAnsi(renderContextProgressBar(116.7)), "[████████████]");
});

test("context progress bar clamps underflow and non-finite percentages", () => {
	assert.equal(stripAnsi(renderContextProgressBar(-12)), "[░░░░░░░░░░░░]");
	assert.equal(stripAnsi(renderContextProgressBar(Number.NaN)), "[░░░░░░░░░░░░]");
	assert.equal(stripAnsi(renderContextProgressBar(Number.POSITIVE_INFINITY)), "[░░░░░░░░░░░░]");
});
