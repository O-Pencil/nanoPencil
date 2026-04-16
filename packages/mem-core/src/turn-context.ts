/**
 * [WHO]: Provides TurnContext, getTurnContext(), TURN_CONTEXT_GLOBAL_KEY (read-only mirror)
 * [FROM]: Depends on nothing; reads from globalThis using the documented key
 * [TO]: Consumed by engine-scoring-v2.ts to read structural anchors published by any producer
 * [HERE]: packages/mem-core/src/turn-context.ts - structural mirror of core/runtime/turn-context; mem-core cannot reverse-import the main app, so the contract is shared via the globalThis key string and schema, not the source file
 *
 * Keep this file structurally aligned with core/runtime/turn-context.ts.
 * If the schema changes there, mirror the change here.
 */

export interface TurnContext {
	structuralAnchor?: {
		modulePath?: string;
		filePath?: string;
		candidatePaths?: string[];
	};
}

export const TURN_CONTEXT_GLOBAL_KEY = "__nanopencilTurnContext";

function store(): TurnContext {
	const g = globalThis as unknown as Record<string, TurnContext | undefined>;
	return (g[TURN_CONTEXT_GLOBAL_KEY] as TurnContext | undefined) ?? {};
}

/** Read the current value of a turn-context channel. Returns undefined when no producer has published. */
export function getTurnContext<K extends keyof TurnContext>(key: K): TurnContext[K] {
	return store()[key];
}
