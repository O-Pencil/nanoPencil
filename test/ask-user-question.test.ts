import assert from "node:assert/strict";
import test from "node:test";
import { createAskUserQuestionTool } from "../extensions/builtin/ask-user-question/ask-user-question-tool.js";
import { validateUniqueness } from "../extensions/builtin/ask-user-question/types.js";

// ============================================================================
// Test helpers
// ============================================================================

function createMockContext(overrides: Record<string, unknown> = {}) {
	return {
		hasUI: true,
		cwd: "/tmp/test",
		ui: {
			select: async () => undefined as string | undefined,
			confirm: async () => false,
			input: async () => undefined as string | undefined,
			notify: () => {},
			...overrides,
		},
	} as any;
}

// ============================================================================
// Schema validation
// ============================================================================

test("validateUniqueness rejects duplicate question texts", () => {
	const result = validateUniqueness([
		{ question: "Same question?", header: "Q1", options: [{ label: "A", description: "desc" }, { label: "B", description: "desc" }] },
		{ question: "Same question?", header: "Q2", options: [{ label: "C", description: "desc" }, { label: "D", description: "desc" }] },
	]);
	assert.ok(result !== null);
	assert.match(result!, /unique/i);
});

test("validateUniqueness rejects duplicate option labels within a question", () => {
	const result = validateUniqueness([
		{
			question: "Which one?",
			header: "Pick",
			options: [
				{ label: "Same", description: "first" },
				{ label: "Same", description: "second" },
			],
		},
	]);
	assert.ok(result !== null);
	assert.match(result!, /unique/i);
});

test("validateUniqueness passes for valid questions", () => {
	const result = validateUniqueness([
		{
			question: "Which library?",
			header: "Library",
			options: [
				{ label: "React", description: "UI framework" },
				{ label: "Vue", description: "Progressive framework" },
			],
		},
		{
			question: "Which bundler?",
			header: "Bundler",
			options: [
				{ label: "Vite", description: "Fast dev server" },
				{ label: "Webpack", description: "Mature bundler" },
			],
		},
	]);
	assert.equal(result, null);
});

test("validateInput on tool rejects duplicate questions", () => {
	const tool = createAskUserQuestionTool();
	const result = tool.validateInput!({
		questions: [
			{ question: "Same?", header: "A", options: [{ label: "X", description: "d" }, { label: "Y", description: "d" }] },
			{ question: "Same?", header: "B", options: [{ label: "Z", description: "d" }, { label: "W", description: "d" }] },
		],
	});
	assert.ok(typeof result === "string");
	assert.match(result, /unique/i);
});

// ============================================================================
// Single-select flow
// ============================================================================

test("single-select: returns selected label as answer", async () => {
	const tool = createAskUserQuestionTool();
	const selectCalls: Array<{ title: string; options: string[] }> = [];

	const ctx = createMockContext({
		select: async (title: string, options: string[]) => {
			selectCalls.push({ title, options });
			return "React — UI framework";
		},
	});

	const result = await tool.execute("call-1", {
		questions: [{
			question: "Which library?",
			header: "Library",
			options: [
				{ label: "React", description: "UI framework" },
				{ label: "Vue", description: "Progressive framework" },
			],
		}],
	}, undefined, undefined, ctx);

	assert.equal(selectCalls.length, 1);
	assert.match(selectCalls[0].title, /Library/);
	assert.match(selectCalls[0].title, /Which library/);
	assert.ok(selectCalls[0].options.includes("React — UI framework"));
	assert.ok(selectCalls[0].options.includes("Vue — Progressive framework"));
	assert.ok(selectCalls[0].options.includes("Other (custom answer)"));

	const answers = result.details.answers;
	assert.equal(answers["Which library?"], "React");
	assert.match(result.content[0].text, /"Which library\?"="React"/);
});

test("single-select: Other option triggers custom input", async () => {
	const tool = createAskUserQuestionTool();

	const ctx = createMockContext({
		select: async () => "Other (custom answer)",
		input: async () => "Svelte",
	});

	const result = await tool.execute("call-1", {
		questions: [{
			question: "Which library?",
			header: "Library",
			options: [
				{ label: "React", description: "UI framework" },
				{ label: "Vue", description: "Progressive framework" },
			],
		}],
	}, undefined, undefined, ctx);

	assert.equal(result.details.answers["Which library?"], "Svelte");
	assert.match(result.content[0].text, /"Which library\?"="Svelte"/);
});

// ============================================================================
// Cancel handling
// ============================================================================

test("single-select: undefined selection throws error", async () => {
	const tool = createAskUserQuestionTool();

	const ctx = createMockContext({
		select: async () => undefined,
	});

	await assert.rejects(
		tool.execute("call-1", {
			questions: [{
				question: "Which one?",
				header: "Pick",
				options: [
					{ label: "A", description: "first" },
					{ label: "B", description: "second" },
				],
			}],
		}, undefined, undefined, ctx),
		/declined/i,
	);
});

test("single-select: Other with undefined input throws error", async () => {
	const tool = createAskUserQuestionTool();

	const ctx = createMockContext({
		select: async () => "Other (custom answer)",
		input: async () => undefined,
	});

	await assert.rejects(
		tool.execute("call-1", {
			questions: [{
				question: "Which one?",
				header: "Pick",
				options: [
					{ label: "A", description: "first" },
					{ label: "B", description: "second" },
				],
			}],
		}, undefined, undefined, ctx),
		/declined/i,
	);
});

// ============================================================================
// Multi-select flow
// ============================================================================

test("multi-select: confirm loop returns comma-separated answers", async () => {
	const tool = createAskUserQuestionTool();
	const confirmCalls: Array<{ title: string; message: string }> = [];
	let confirmIndex = 0;
	const confirmResults = [true, false, true]; // A=yes, B=no, C=yes

	const ctx = createMockContext({
		confirm: async (title: string, message: string) => {
			confirmCalls.push({ title, message });
			return confirmResults[confirmIndex++];
		},
	});

	const result = await tool.execute("call-1", {
		questions: [{
			question: "Which features?",
			header: "Features",
			options: [
				{ label: "Auth", description: "Authentication" },
				{ label: "Cache", description: "Caching layer" },
				{ label: "Log", description: "Logging" },
			],
			multiSelect: true,
		}],
	}, undefined, undefined, ctx);

	assert.equal(confirmCalls.length, 4); // 3 options + "Add custom?" prompt
	assert.match(confirmCalls[0].message, /Auth/);
	assert.match(confirmCalls[1].message, /Cache/);
	assert.match(confirmCalls[2].message, /Log/);

	const answer = result.details.answers["Which features?"];
	assert.ok(answer.includes("Auth"));
	assert.ok(!answer.includes("Cache"));
	assert.ok(answer.includes("Log"));
});

test("multi-select: no selections and no custom throws error", async () => {
	const tool = createAskUserQuestionTool();

	const ctx = createMockContext({
		confirm: async () => false,
	});

	await assert.rejects(
		tool.execute("call-1", {
			questions: [{
				question: "Which features?",
				header: "Features",
				options: [
					{ label: "A", description: "first" },
					{ label: "B", description: "second" },
				],
				multiSelect: true,
			}],
		}, undefined, undefined, ctx),
		/declined/i,
	);
});

// ============================================================================
// Non-UI mode
// ============================================================================

test("non-UI context throws error", async () => {
	const tool = createAskUserQuestionTool();

	const ctx = createMockContext();
	ctx.hasUI = false;

	await assert.rejects(
		tool.execute("call-1", {
			questions: [{
				question: "Which one?",
				header: "Pick",
				options: [
					{ label: "A", description: "first" },
					{ label: "B", description: "second" },
				],
			}],
		}, undefined, undefined, ctx),
		/interactive UI/i,
	);
});

// ============================================================================
// Multi-question sequential display
// ============================================================================

test("multiple questions are asked sequentially", async () => {
	const tool = createAskUserQuestionTool();
	const selectCalls: string[] = [];

	const ctx = createMockContext({
		select: async (_title: string, _options: string[]) => {
			selectCalls.push(_title);
			if (selectCalls.length === 1) return "React — UI framework";
			return "Vite — Fast dev server";
		},
	});

	const result = await tool.execute("call-1", {
		questions: [
			{
				question: "Which library?",
				header: "Library",
				options: [
					{ label: "React", description: "UI framework" },
					{ label: "Vue", description: "Progressive framework" },
				],
			},
			{
				question: "Which bundler?",
				header: "Bundler",
				options: [
					{ label: "Vite", description: "Fast dev server" },
					{ label: "Webpack", description: "Mature bundler" },
				],
			},
		],
	}, undefined, undefined, ctx);

	assert.equal(selectCalls.length, 2);
	assert.match(selectCalls[0], /Library/);
	assert.match(selectCalls[1], /Bundler/);
	assert.equal(result.details.answers["Which library?"], "React");
	assert.equal(result.details.answers["Which bundler?"], "Vite");
});

// ============================================================================
// Result text format (CC 1:1)
// ============================================================================

test("result text matches CC format with annotations", async () => {
	const tool = createAskUserQuestionTool();

	const ctx = createMockContext({
		select: async () => "React — UI framework",
	});

	const result = await tool.execute("call-1", {
		questions: [{
			question: "Which library?",
			header: "Library",
			options: [
				{ label: "React", description: "UI framework" },
				{ label: "Vue", description: "Progressive framework" },
			],
		}],
	}, undefined, undefined, ctx);

	const text = result.content[0].text;
	assert.match(text, /^User has answered your questions:/);
	assert.match(text, /"Which library\?"="React"/);
	assert.match(text, /You can now continue with the user's answers in mind\./);
});

// ============================================================================
// Preview content in title
// ============================================================================

test("preview content is included in question title", async () => {
	const tool = createAskUserQuestionTool();
	let capturedTitle = "";

	const ctx = createMockContext({
		select: async (title: string) => {
			capturedTitle = title;
			return "Option A — first";
		},
	});

	await tool.execute("call-1", {
		questions: [{
			question: "Which layout?",
			header: "Layout",
			options: [
				{ label: "Option A", description: "first", preview: "```\nLayout A\n```" },
				{ label: "Option B", description: "second" },
			],
		}],
	}, undefined, undefined, ctx);

	assert.ok(capturedTitle.includes("Layout A"));
	assert.ok(capturedTitle.includes("```"));
});

// ============================================================================
// Tool properties
// ============================================================================

test("tool has correct name and properties", () => {
	const tool = createAskUserQuestionTool();
	assert.equal(tool.name, "AskUserQuestion");
	assert.equal(tool.label, "AskUserQuestion");
	assert.equal(tool.isConcurrencySafe, true);
	assert.ok(tool.description.length > 0);
	assert.ok(tool.guidance!.length > 0);
	assert.ok(tool.guidance!.includes("Plan mode note"));
});
