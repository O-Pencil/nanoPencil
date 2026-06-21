import assert from "node:assert/strict";
import test from "node:test";
import { visibleWidth } from "@catui/tui";
import { FooterComponent, renderContextProgressBar } from "../modes/interactive/components/footer.js";
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

test("footer renders through a single width-clamped status line", () => {
	const session = {
		cwd: "/Users/cunyu666/Dev/catui",
		state: {
			model: {
				id: "very-long-model-name-that-must-not-overflow-the-footer",
				provider: "provider",
				contextWindow: 200000,
				reasoning: true,
			},
			thinkingLevel: "high",
		},
		sessionManager: {
			getBranch: () => [
				{
					type: "message",
					message: {
						role: "assistant",
						usage: {
							input: 12345,
							output: 6789,
							cacheRead: 0,
							cacheWrite: 0,
							cost: { total: 0.123 },
						},
					},
				},
			],
			getSessionName: () => "session-with-a-long-name",
		},
		getContextUsage: () => ({ percent: 91.3, tokens: 182600, contextWindow: 200000 }),
		modelRegistry: {
			isUsingOAuth: () => false,
		},
	};
	const footerData = {
		getGitBranch: () => "feature/footer-next",
		getAvailableProviderCount: () => 2,
		getExtensionStatuses: () => new Map([["z", "running"], ["a", "ready"]]),
	};
	const footer = new FooterComponent(session as never, footerData, true);

	const lines = footer.render(48);

	assert.equal(lines.length, 1);
	assert.equal(visibleWidth(lines[0] ?? ""), 48);
});
