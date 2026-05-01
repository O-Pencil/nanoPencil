/**
 * [WHO]: parseLlmJson, extractLlmJsonText
 * [FROM]: No internal dependencies; uses JSON.parse and balanced-brace scanning
 * [TO]: Consumed by mem-core LLM extraction, consolidation, insights, and extension diagnostics
 * [HERE]: packages/mem-core/src/llm-json.ts - tolerant JSON boundary normalizer for structured LLM responses
 */

export function parseLlmJson<T>(raw: string): T {
	const text = extractLlmJsonText(raw);
	return JSON.parse(text) as T;
}

export function extractLlmJsonText(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed) return trimmed;

	for (const fenced of extractFencedJsonCandidates(trimmed)) {
		if (canParseJson(fenced)) return fenced.trim();
	}

	if (canParseJson(trimmed)) return trimmed;

	const balanced = extractFirstBalancedJson(trimmed);
	if (balanced) return balanced;

	return trimmed;
}

export function hasParseableLlmJson(raw: string): boolean {
	try {
		parseLlmJson<unknown>(raw);
		return true;
	} catch {
		return false;
	}
}

function extractFencedJsonCandidates(value: string): string[] {
	const candidates: string[] = [];
	const fencePattern = /```(?:json)?\s*([\s\S]*?)```/gi;
	for (const match of value.matchAll(fencePattern)) {
		if (typeof match[1] === "string") candidates.push(match[1]);
	}
	return candidates;
}

function canParseJson(value: string): boolean {
	try {
		JSON.parse(value.trim());
		return true;
	} catch {
		return false;
	}
}

function extractFirstBalancedJson(value: string): string | undefined {
	for (let start = 0; start < value.length; start++) {
		const first = value[start];
		if (first !== "{" && first !== "[") continue;

		const closeForOpen = new Map<string, string>([
			["{", "}"],
			["[", "]"],
		]);
		const stack: string[] = [closeForOpen.get(first)!];
		let inString = false;
		let escaped = false;

		for (let index = start + 1; index < value.length; index++) {
			const ch = value[index]!;
			if (inString) {
				if (escaped) {
					escaped = false;
				} else if (ch === "\\") {
					escaped = true;
				} else if (ch === "\"") {
					inString = false;
				}
				continue;
			}

			if (ch === "\"") {
				inString = true;
				continue;
			}

			const close = closeForOpen.get(ch);
			if (close) {
				stack.push(close);
				continue;
			}

			if (ch === stack[stack.length - 1]) {
				stack.pop();
				if (stack.length === 0) {
					const candidate = value.slice(start, index + 1).trim();
					if (canParseJson(candidate)) return candidate;
					break;
				}
			}
		}
	}
	return undefined;
}
