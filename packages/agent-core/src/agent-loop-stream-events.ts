/**
 * [WHO]: Provides waitForAssistantStreamEvent()
 * [FROM]: Depends on @pencil-agent/ai AssistantMessageEvent stream contracts.
 * [TO]: Consumed by standard and structured-adaptive agent loops.
 * [HERE]: packages/agent-core/src/agent-loop-stream-events.ts within agent-core; shared abortable assistant-stream iterator utility.
 */

import type { AssistantMessageEvent } from "@pencil-agent/ai";

export type AssistantStreamNext = IteratorResult<AssistantMessageEvent> | "aborted";

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
