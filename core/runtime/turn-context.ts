/**
 * [WHO]: Provides TurnContext, setTurnContext(), getTurnContext(), resetTurnContext(), TURN_CONTEXT_GLOBAL_KEY
 * [FROM]: Depends on nothing; uses globalThis as cross-package singleton storage
 * [TO]: Consumed by extensions that publish per-turn hints (e.g. SAL) and by packages that read them (e.g. mem-core via its own mirror)
 * [HERE]: core/runtime/turn-context.ts - generic per-turn hint bus; decouples producers from consumers via a documented globalThis key
 *
 * Design note:
 *   This is the canonical home of the bus. Packages that cannot reverse-import
 *   from the main app (e.g. @pencil-agent/mem-core) define a structurally
 *   identical mirror that targets the same globalThis key. The contract is the
 *   key string + TurnContext schema, not the implementation file.
 */

/** Channel for per-turn hints that one extension may publish and others may consume. */
export interface TurnContext {
	/**
	 * Structural anchor for the active turn (set by SAL or any future locator).
	 * `candidatePaths` are scored alternatives, used for soft overlap matching.
	 */
	structuralAnchor?: {
		modulePath?: string;
		filePath?: string;
		candidatePaths?: string[];
	};
}

/** Reserved globalThis key. Mirrors must use exactly this string. */
export const TURN_CONTEXT_GLOBAL_KEY = "__nanopencilTurnContext";

function store(): TurnContext {
	const g = globalThis as unknown as Record<string, TurnContext | undefined>;
	if (!g[TURN_CONTEXT_GLOBAL_KEY]) g[TURN_CONTEXT_GLOBAL_KEY] = {};
	return g[TURN_CONTEXT_GLOBAL_KEY] as TurnContext;
}

/** Publish (or clear, when value is undefined) a turn-context channel. */
export function setTurnContext<K extends keyof TurnContext>(key: K, value: TurnContext[K]): void {
	const s = store();
	if (value === undefined) {
		delete s[key];
	} else {
		s[key] = value;
	}
}

/** Read the current value of a turn-context channel. Returns undefined when no producer has published. */
export function getTurnContext<K extends keyof TurnContext>(key: K): TurnContext[K] {
	return store()[key];
}

/** Clear all channels. Should be called at the start of each turn by the producer that owns the turn boundary. */
export function resetTurnContext(): void {
	const g = globalThis as unknown as Record<string, TurnContext | undefined>;
	g[TURN_CONTEXT_GLOBAL_KEY] = {};
}
