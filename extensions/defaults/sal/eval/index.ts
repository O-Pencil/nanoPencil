/**
 * [WHO]: Provides createEvalSink() factory and barrel re-exports for EvalSink, EvalEventEnvelope, EvalVariant, EvalEventType, EvalAdapterId, CreateEvalSinkOptions, createEvalEvent
 * [FROM]: Depends on ./types.js, ./noop-sink.js, ./insforge-sink.js, ./jsonl-sink.js
 * [TO]: Consumed by extensions/defaults/sal/index.ts as the eval entry point
 * [HERE]: extensions/defaults/sal/eval/index.ts - adapter selection and public surface; SAL only ever imports from this file (never from sibling sink modules)
 *
 * Adapter selection rules:
 *   1. If options.adapter is set, use it verbatim.
 *   2. Else infer from options.endpoint scheme:
 *        - http://, https://      → "insforge"
 *        - file://, /…, ./…, ../… → "jsonl"
 *        - missing                → "noop"
 *
 * Adding a new backend = add one sibling file + one switch case below.
 */

import { InsForgeEvalSink } from "./insforge-sink.js";
import { JsonlEvalSink } from "./jsonl-sink.js";
import { noopSink } from "./noop-sink.js";
import type { CreateEvalSinkOptions, EvalAdapterId, EvalSink } from "./types.js";

export {
	createEvalEvent,
	type CreateEvalSinkOptions,
	type EvalAdapterId,
	type EvalEventEnvelope,
	type EvalEventType,
	type EvalSink,
	type EvalVariant,
} from "./types.js";

export function createEvalSink(options: CreateEvalSinkOptions): EvalSink {
	if (!options.enabled) return noopSink;

	const adapter = options.adapter ?? inferAdapter(options.endpoint);
	switch (adapter) {
		case "noop":
			return noopSink;
		case "jsonl":
			if (!options.endpoint) {
				console.error("[sal][eval] jsonl adapter requires endpoint (file path); using noop sink");
				return noopSink;
			}
			return new JsonlEvalSink(options);
		case "insforge":
			if (!options.endpoint) {
				console.error("[sal][eval] insforge adapter requires endpoint (https URL); using noop sink");
				return noopSink;
			}
			return new InsForgeEvalSink(options);
		default: {
			const exhaustive: never = adapter;
			console.error(`[sal][eval] unknown adapter '${exhaustive as string}'; using noop sink`);
			return noopSink;
		}
	}
}

function inferAdapter(endpoint: string | undefined): EvalAdapterId {
	if (!endpoint) return "noop";
	if (/^https?:\/\//i.test(endpoint)) return "insforge";
	if (endpoint.startsWith("file://") || endpoint.startsWith("/") || endpoint.startsWith("./") || endpoint.startsWith("../")) {
		return "jsonl";
	}
	// Fallback: treat as InsForge URL (legacy behavior — preserves existing credential files without an adapter field)
	return "insforge";
}
