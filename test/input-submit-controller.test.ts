/**
 * [WHO]: InputSubmitController regression tests
 * [FROM]: Depends on node:test, node:fs, node:os, node:path, input-submit-controller
 * [TO]: Consumed by repository test runner
 * [HERE]: test/input-submit-controller.test.ts - verifies submit handoff behavior before interactive session prompt
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { InputSubmitController, type InputSubmitContext } from "../modes/interactive/controllers/input-submit-controller.js";

function createContext(overrides: Partial<InputSubmitContext> = {}): {
	context: InputSubmitContext;
	externalInputs: string[];
	optimisticMessages: string[];
	historyEntries: string[];
} {
	const externalInputs: string[] = [];
	const optimisticMessages: string[] = [];
	const historyEntries: string[] = [];
	const context: InputSubmitContext = {
		editor: {
			setText: () => {},
			addToHistory: (text: string) => {
				historyEntries.push(text);
			},
			handleExternalInput: (text: string) => {
				externalInputs.push(text);
				return true;
			},
			setBashMode: () => {},
			updateBorderColor: () => {},
		},
		slash: {
			execute: async () => false,
		},
		image: {
			awaitPendingPaste: async () => {},
			extractImagesFromText: async (text: string) => ({ text, images: [] }),
			takePendingAttachments: () => [],
			processAttachmentFiles: async () => [],
			cleanupClipboardImages: () => {},
		},
		session: {
			isBashRunning: () => false,
			isCompacting: () => false,
			isStreaming: () => false,
			getModel: () => ({ id: "test", name: "test", provider: "test", input: ["text"], output: ["text"] }) as never,
			getCwd: () => process.cwd(),
			promptAfterRender: async () => {
				throw new Error("promptAfterRender should not run when external input is handled");
			},
			queueCompactionMessage: () => {},
		},
		commands: {
			isExtensionCommand: () => false,
			handlePersonaCommand: async () => {},
			handleBashCommand: async () => {},
		},
		render: {
			showStatus: () => {},
			showWarning: () => {},
			showError: () => {},
			notify: () => {},
			requestRender: () => {},
			flushPendingBashComponents: () => {},
			updatePendingMessagesDisplay: () => {},
			addOptimisticUserMessage: (text) => {
				optimisticMessages.push(text);
			},
			rollbackFirstOptimisticUserMessageIfMatches: () => {},
		},
		...overrides,
	};
	return { context, externalInputs, optimisticMessages, historyEntries };
}

test("idle submit hands processed @-mention prompt to the external main loop input callback", async () => {
	const dir = mkdtempSync(path.join(tmpdir(), "catui-input-submit-"));
	try {
		const filePath = path.join(dir, "example.ts");
		writeFileSync(filePath, "export const value = 1;\n");
		const { context, externalInputs, optimisticMessages, historyEntries } = createContext({
			session: {
				...createContext().context.session,
				getCwd: () => dir,
			},
		});
		const controller = new InputSubmitController(context);

		await controller.handleSubmit("Please review @example.ts");

		assert.deepEqual(optimisticMessages, ["Please review [file: example.ts]"]);
		assert.deepEqual(historyEntries, ["Please review @example.ts"]);
		assert.equal(externalInputs.length, 1);
		assert.match(
			externalInputs[0] ?? "",
			/The following files are referenced via @-mentions in the user's message\./,
		);
		assert.match(externalInputs[0] ?? "", /### @example\.ts \(entire file\)/);
		assert.match(externalInputs[0] ?? "", /1\texport const value = 1;/);
		assert.match(externalInputs[0] ?? "", /Please review \[file: example\.ts\]$/);
		assert.doesNotMatch(externalInputs[0] ?? "", /Please review @example\.ts$/);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
