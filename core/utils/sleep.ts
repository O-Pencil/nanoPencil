/**
 * [UPSTREAM]: No external dependencies
 * [SURFACE]: sleep()
 * [LOCUS]: core/utils/sleep.ts - sleep helper that respects abort signal
 * [COVENANT]: Change sleep → update this header
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new Error("Aborted"));
			return;
		}

		const timeout = setTimeout(resolve, ms);

		signal?.addEventListener("abort", () => {
			clearTimeout(timeout);
			reject(new Error("Aborted"));
		});
	});
}
