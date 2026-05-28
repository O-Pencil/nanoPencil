/**
 * [WHO]: Provides waitForAssistantStream(), waitForAssistantStreamEvent()
 * [FROM]: Depends on @pencil-agent/ai AssistantMessageEvent/AssistantMessageEventStream contracts.
 * [TO]: Consumed by standard and structured-adaptive agent loops.
 * [HERE]: packages/agent-core/src/agent-loop-stream-events.ts within agent-core; shared abortable assistant-stream iterator utility.
 */

import type { AssistantMessageEvent, AssistantMessageEventStream } from "@pencil-agent/ai";

export type AssistantStreamNext = IteratorResult<AssistantMessageEvent> | "aborted";
export type AssistantStreamStart = AssistantMessageEventStream | "aborted";

export function waitForAssistantStream(
	streamOrPromise: AssistantMessageEventStream | Promise<AssistantMessageEventStream>,
	signal?: AbortSignal,
): Promise<AssistantStreamStart> {
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
		Promise.resolve(streamOrPromise).then(
			(response) => {
				cleanup();
				resolve(response);
			},
			(error) => {
				cleanup();
				reject(error);
			},
		);
	});
}

export function waitForAssistantStreamEvent(
	iterator: AsyncIterator<AssistantMessageEvent>,
	signal?: AbortSignal,
): Promise<AssistantStreamNext> {
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
