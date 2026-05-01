import test from "node:test";
import assert from "node:assert/strict";

import { hasParseableLlmJson, parseLlmJson } from "../src/llm-json.js";

test("llm-json parses fenced JSON after prose", () => {
	const parsed = parseLlmJson<Array<{ type: string; detail: string }>>(`Sure, here is the result:

\`\`\`json
[
  { "type": "lesson", "detail": "Use strict JSON for memory extraction." }
]
\`\`\`
`);

	assert.deepEqual(parsed, [
		{ type: "lesson", detail: "Use strict JSON for memory extraction." },
	]);
});

test("llm-json extracts first balanced object from markdown response", () => {
	const parsed = parseLlmJson<{ goal: string; summary: string }>(`## Summary

The extracted work item:
{ "goal": "Fix extraction", "summary": "Added tolerant JSON parsing with braces inside strings like \\"{ok}\\"." }

Done.`);

	assert.equal(parsed.goal, "Fix extraction");
	assert.equal(parsed.summary.includes("{ok}"), true);
});

test("llm-json rejects responses with no parseable JSON", () => {
	assert.equal(hasParseableLlmJson("I will continue with the deeper analysis."), false);
});
