/**
 * [WHO]: getEnvApiKey, stream, streamSimple, complete, completeSimple, RetryOptions
 * [FROM]: Depends on ./api-registry.js, providers/register-builtins.js, and utils/http-proxy.js
 * [TO]: Consumed by core/lib/ai/src/index.ts
 * [HERE]: core/lib/ai/src/stream.ts - provider streaming entrypoint with lazy provider resolution, retry, abort, and factory-error event handling
 */

import "./providers/register-builtins.js";
import "./utils/http-proxy.js";

import { ensureApiProvider } from "./api-registry.js";
import type {
	Api,
	AssistantMessage,
	AssistantMessageEvent,
	AssistantMessageEventStreamContract,
	Context,
	Model,
	ProviderStreamOptions,
	SimpleStreamOptions,
	StreamOptions,
	Usage,
} from "./types.js";
import { AssistantMessageEventStream } from "./utils/event-stream.js";
import { isContextOverflow } from "./utils/overflow.js";

export { getEnvApiKey } from "./env-api-keys.js";

// =============================================================================
// Retry Configuration
// =============================================================================

export interface RetryOptions {
	/** Maximum number of retry attempts (default: 3). Ignored when persistentRetry is true. */
	maxRetries?: number;
	/** Base delay in ms for exponential backoff (default: 1000) */
	baseDelayMs?: number;
	/** Maximum delay cap in ms (default: 30000, or 300000 for persistentRetry) */
	maxDelayMs?: number;
	/** Whether to add jitter to avoid thundering herd (default: true) */
	jitter?: boolean;
	/**
	 * Persistent/unattended retry mode for 429/529 overload errors.
	 * When true, retries indefinitely with capped backoff and periodic heartbeat yields.
	 * Only applies to overload errors (429, 529); other retriable errors still respect maxRetries.
	 */
	persistentRetry?: boolean;
	/** Heartbeat interval in ms during persistent retry to prevent idle timeouts (default: 30000) */
	heartbeatMs?: number;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
	maxRetries: 3,
	baseDelayMs: 1000,
	maxDelayMs: 30000,
	jitter: true,
	persistentRetry: false,
	heartbeatMs: 30000,
};

function emptyUsage(): Usage {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
}

/** Status codes and patterns that indicate a retriable error */
const RETRIABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504, 529]);
const RETRIABLE_ERROR_PATTERNS = [
	/ECONNRESET/i,
	/ETIMEDOUT/i,
	/ECONNREFUSED/i,
	/socket hang up/i,
	/fetch failed/i,
	/network/i,
	/aborted/i,
	/without a final assistant message/i,
];

/**
 * Check if an assistant message error is retriable.
 * Context overflow errors are NOT retriable — they need compaction.
 */
function isRetriableStreamError(message: AssistantMessage): boolean {
	if (message.stopReason !== "error" || !message.errorMessage) return false;

	// Context overflow is never retriable
	if (isContextOverflow(message)) return false;

	const errMsg = message.errorMessage;

	// Check for retriable status codes embedded in error messages
	const statusMatch = errMsg.match(/^([45]\d\d)\b/);
	if (statusMatch) {
		const statusCode = parseInt(statusMatch[1], 10);
		return RETRIABLE_STATUS_CODES.has(statusCode);
	}

	// Check for retriable error patterns
	return RETRIABLE_ERROR_PATTERNS.some((p) => p.test(errMsg));
}

/**
 * Calculate delay for retry attempt with exponential backoff + optional jitter.
 */
function calculateDelay(attempt: number, options: Required<RetryOptions>): number {
	const exponentialDelay = options.baseDelayMs * Math.pow(2, attempt);
	const cappedDelay = Math.min(exponentialDelay, options.maxDelayMs);

	if (options.jitter) {
		// Full jitter: random between 0 and capped delay
		return Math.floor(Math.random() * cappedDelay);
	}
	return cappedDelay;
}

/**
 * Extract retry-after delay from HTTP headers or error message text.
 * Checks structured headers first (reliable), falls back to message regex (fragile).
 */
function extractRetryAfterMs(errorMessage: string, errorHeaders?: Record<string, string>): number | undefined {
	// 1. Check structured HTTP headers first (most reliable)
	if (errorHeaders) {
		const headerValue = errorHeaders["retry-after"] ?? errorHeaders["Retry-After"];
		if (headerValue) {
			const seconds = parseInt(headerValue, 10);
			if (!isNaN(seconds)) return seconds * 1000;
		}
	}
	// 2. Fallback: parse from error message text (fragile, provider-dependent)
	const match = errorMessage.match(/retry[_-]after[:\s]+(\d+)/i);
	if (match) {
		return parseInt(match[1], 10) * 1000;
	}
	return undefined;
}

/**
 * Check if an error is an overload/rate-limit error (429 or 529).
 * These are eligible for persistent retry mode.
 */
function isOverloadError(message: AssistantMessage): boolean {
	return /^[45]29\b/.test(message.errorMessage ?? "");
}

function getRetryDelayMs(
	message: AssistantMessage,
	attempt: number,
	retryOptions: Required<RetryOptions>,
): number | undefined {
	if (!isRetriableStreamError(message)) {
		return undefined;
	}

	// In persistent retry mode, overload errors (429/529) retry indefinitely
	const isOverload = isOverloadError(message);
	if (isOverload && retryOptions.persistentRetry) {
		// Use larger backoff cap for persistent mode (5 min)
		const persistentOptions = { ...retryOptions, maxDelayMs: Math.max(retryOptions.maxDelayMs, 300_000) };
		return extractRetryAfterMs(message.errorMessage ?? "", message.errorHeaders) ?? calculateDelay(attempt, persistentOptions);
	}

	// Standard mode: respect maxRetries
	if (attempt >= retryOptions.maxRetries) {
		return undefined;
	}
	if (isOverload) {
		return extractRetryAfterMs(message.errorMessage ?? "", message.errorHeaders) ?? calculateDelay(attempt, retryOptions);
	}
	return calculateDelay(attempt, retryOptions);
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	return JSON.stringify(error) ?? String(error);
}

function createStreamErrorMessage<TApi extends Api>(
	model: Pick<Model<TApi>, "api" | "provider" | "id">,
	error: unknown,
	errorHeaders?: Record<string, string>,
): AssistantMessage {
	return {
		role: "assistant",
		content: [],
		api: model.api,
		provider: model.provider,
		model: model.id,
		stopReason: "error",
		errorMessage: getErrorMessage(error),
		errorHeaders,
		usage: emptyUsage(),
		timestamp: Date.now(),
	};
}

function createMissingStreamResultMessage<TApi extends Api>(
	model: Pick<Model<TApi>, "api" | "provider" | "id">,
): AssistantMessage {
	return createStreamErrorMessage(model, new Error("Provider stream ended without a final assistant message"));
}

function createAbortMessage<TApi extends Api>(model: Pick<Model<TApi>, "api" | "provider" | "id">): AssistantMessage {
	return createStreamErrorMessage(model, new Error("Request was aborted"));
}

function emitAbortError<TApi extends Api>(
	stream: AssistantMessageEventStream,
	model: Pick<Model<TApi>, "api" | "provider" | "id">,
): void {
	stream.push({ type: "error", reason: "error", error: createAbortMessage(model) });
}

function waitForRetryDelay(
	delayMs: number,
	signal?: AbortSignal,
	heartbeatMs?: number,
	onHeartbeat?: () => void,
): Promise<"elapsed" | "aborted"> {
	if (signal?.aborted) return Promise.resolve("aborted");
	return new Promise((resolve) => {
		let timeout: ReturnType<typeof setTimeout> | undefined;
		let heartbeatInterval: ReturnType<typeof setInterval> | undefined;
		const cleanup = () => {
			if (timeout !== undefined) clearTimeout(timeout);
			if (heartbeatInterval !== undefined) clearInterval(heartbeatInterval);
			signal?.removeEventListener("abort", onAbort);
		};
		const onAbort = () => {
			cleanup();
			resolve("aborted");
		};
		// Periodic heartbeat during long retry delays (persistent mode)
		if (heartbeatMs && heartbeatMs > 0 && heartbeatMs < delayMs && onHeartbeat) {
			heartbeatInterval = setInterval(onHeartbeat, heartbeatMs);
		}
		timeout = setTimeout(() => {
			cleanup();
			resolve("elapsed");
		}, delayMs);
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}

function waitForStreamEvent<T>(
	iterator: AsyncIterator<T>,
	signal?: AbortSignal,
): Promise<IteratorResult<T> | "aborted"> {
	if (signal?.aborted) return Promise.resolve("aborted");
	return new Promise((resolve, reject) => {
		const cleanup = () => {
			signal?.removeEventListener("abort", onAbort);
		};
		const onAbort = () => {
			cleanup();
			resolve("aborted");
		};
		signal?.addEventListener("abort", onAbort, { once: true });
		iterator.next().then(
			(result) => {
				cleanup();
				resolve(result);
			},
			(error) => {
				cleanup();
				reject(error);
			},
		);
	});
}

// =============================================================================
// Provider Resolution
// =============================================================================

async function resolveApiProvider(api: Api) {
	const provider = await ensureApiProvider(api);
	if (!provider) {
		throw new Error(`No API provider registered for api: ${api}`);
	}
	return provider;
}

// =============================================================================
// Streaming with Retry
// =============================================================================

export function stream<TApi extends Api>(
	model: Model<TApi>,
	context: Context,
	options?: ProviderStreamOptions,
): AssistantMessageEventStream {
	const retryOptions: Required<RetryOptions> = {
		...DEFAULT_RETRY_OPTIONS,
		...options?.retry,
	};
	return wrapWithRetry(
		model,
		async () => {
			const provider = await resolveApiProvider(model.api);
			return provider.stream(model, context, options as StreamOptions);
		},
		retryOptions,
		options?.signal,
	);
}

export async function complete<TApi extends Api>(
	model: Model<TApi>,
	context: Context,
	options?: ProviderStreamOptions,
): Promise<AssistantMessage> {
	const s = stream(model, context, options);
	return s.result();
}

export function streamSimple<TApi extends Api>(
	model: Model<TApi>,
	context: Context,
	options?: SimpleStreamOptions,
): AssistantMessageEventStream {
	const retryOptions: Required<RetryOptions> = {
		...DEFAULT_RETRY_OPTIONS,
		...options?.retry,
	};
	return wrapWithRetry(
		model,
		async () => {
			const provider = await resolveApiProvider(model.api);
			return provider.streamSimple(model, context, options);
		},
		retryOptions,
		options?.signal,
	);
}

export async function completeSimple<TApi extends Api>(
	model: Model<TApi>,
	context: Context,
	options?: SimpleStreamOptions,
): Promise<AssistantMessage> {
	const s = streamSimple(model, context, options);
	return s.result();
}

// =============================================================================
// Retry Wrapper
// =============================================================================

/**
 * Wraps a stream factory with automatic retry on retriable errors.
 * On retriable failure, creates a new stream and replays it transparently.
 * Supports persistent retry mode for overload (429/529) errors.
 */
function wrapWithRetry<TApi extends Api>(
	model: Pick<Model<TApi>, "api" | "provider" | "id">,
	createStream: () => AssistantMessageEventStreamContract | Promise<AssistantMessageEventStreamContract>,
	retryOptions: Required<RetryOptions>,
	signal?: AbortSignal,
): AssistantMessageEventStream {
	const outerStream = new AssistantMessageEventStream();

	(async () => {
		let attempt = 0;

		// Heartbeat callback for persistent retry mode
		const onHeartbeat = retryOptions.persistentRetry
			? () => {
					// Emit a no-op text delta to keep the stream alive and signal activity
					outerStream.push({
						type: "text_delta",
						contentIndex: 0,
						delta: "",
						partial: { role: "assistant", content: [], api: model.api, provider: model.provider, model: model.id, usage: emptyUsage(), stopReason: "error", timestamp: Date.now() },
					});
				}
			: undefined;

		// In persistent retry mode, loop indefinitely (getRetryDelayMs returns undefined only for non-overload exhaustion)
		while (attempt <= retryOptions.maxRetries || retryOptions.persistentRetry) {
			if (signal?.aborted) {
				emitAbortError(outerStream, model);
				return;
			}

			let innerStream: AssistantMessageEventStreamContract;
			try {
				innerStream = await createStream();
			} catch (error) {
				const errorMessage = createStreamErrorMessage(model, error);
				const delayMs = getRetryDelayMs(errorMessage, attempt, retryOptions);
				if (delayMs !== undefined) {
					attempt++;
					if ((await waitForRetryDelay(delayMs, signal, retryOptions.heartbeatMs, onHeartbeat)) === "aborted") {
						emitAbortError(outerStream, model);
						return;
					}
					continue;
				}
				outerStream.push({ type: "error", reason: "error", error: errorMessage });
				return;
			}

			// Forward all events from inner to outer, but intercept the final result
			let lastMessage: AssistantMessage | null = null;
			const innerIterator = innerStream[Symbol.asyncIterator]();

			while (true) {
				let nextEvent: IteratorResult<AssistantMessageEvent> | "aborted";
				try {
					nextEvent = await waitForStreamEvent(innerIterator, signal);
				} catch (error) {
					lastMessage = createStreamErrorMessage(model, error);
					const delayMs = getRetryDelayMs(lastMessage, attempt, retryOptions);
					if (delayMs !== undefined) {
						attempt++;
						if ((await waitForRetryDelay(delayMs, signal, retryOptions.heartbeatMs, onHeartbeat)) === "aborted") {
							emitAbortError(outerStream, model);
							return;
						}
						break;
					}
					outerStream.push({ type: "error", reason: "error", error: lastMessage });
					return;
				}
				if (nextEvent === "aborted") {
					void innerIterator.return?.();
					emitAbortError(outerStream, model);
					return;
				}
				if (nextEvent.done) {
					break;
				}
				const event = nextEvent.value;
				if (event.type === "done") {
					lastMessage = event.message;
					outerStream.push(event);
					break;
				} else if (event.type === "error") {
					lastMessage = event.error;

					// Check if retriable
					const delayMs = getRetryDelayMs(lastMessage, attempt, retryOptions);
					if (delayMs !== undefined) {
						attempt++;
						if ((await waitForRetryDelay(delayMs, signal, retryOptions.heartbeatMs, onHeartbeat)) === "aborted") {
							emitAbortError(outerStream, model);
							return;
						}
						break; // Break inner loop, retry outer loop
					}

					// Non-retriable or max retries exhausted — forward error
					outerStream.push(event);
					return;
				} else {
					// Forward all intermediate events on first attempt only
					// On retries, we don't replay partial events to avoid duplicates
					if (attempt === 0) {
						outerStream.push(event);
					}
				}
			}

			if (!lastMessage) {
				lastMessage = innerStream.resultIfResolved() ?? createMissingStreamResultMessage(model);
				const delayMs = getRetryDelayMs(lastMessage, attempt, retryOptions);
				if (delayMs !== undefined) {
					attempt++;
					if ((await waitForRetryDelay(delayMs, signal, retryOptions.heartbeatMs, onHeartbeat)) === "aborted") {
						emitAbortError(outerStream, model);
						return;
					}
					continue;
				}
				if (lastMessage.stopReason === "error" || lastMessage.stopReason === "aborted") {
					outerStream.push({ type: "error", reason: lastMessage.stopReason, error: lastMessage });
					return;
				}
				outerStream.push({ type: "done", reason: lastMessage.stopReason, message: lastMessage });
				return;
			}

			// If we got a done event, we're finished
			if (lastMessage && lastMessage.stopReason !== "error") {
				return;
			}
		}
	})();

	return outerStream;
}
