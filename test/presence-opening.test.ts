import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { createAgentSession } from "../core/runtime/sdk.js";
import { getBuiltinExtensionPaths } from "../builtin-extensions.js";
import { DefaultResourceLoader } from "../core/config/resource-loader.js";
import { SettingsManager } from "../core/config/settings-manager.js";
import { SessionManager } from "../core/session/session-manager.js";
import { AuthStorage } from "../core/config/auth-storage.js";
import { ModelRegistry } from "../core/model-registry.js";
import { allTools } from "../core/tools/index.js";

test("presence-opening: emits an opening message after session_ready", async () => {
	const cwd = process.cwd();
	const agentDir = mkdtempSync(join(tmpdir(), "nanopencil-presence-"));
	process.env.NANOMEM_MEMORY_DIR = join(agentDir, "memory");

	const settingsManager = SettingsManager.create(cwd, agentDir);
	const resourceLoader = new DefaultResourceLoader({
		cwd,
		agentDir,
		settingsManager,
		additionalExtensionPaths: getBuiltinExtensionPaths(),
	});
	await resourceLoader.reload();

	const authStorage = AuthStorage.create(join(agentDir, "auth.json"));
	const modelRegistry = new ModelRegistry(authStorage, join(agentDir, "models.json"));
	const sessionManager = SessionManager.create(cwd, agentDir);

	const { session } = await createAgentSession({
		cwd,
		agentDir,
		resourceLoader,
		settingsManager,
		sessionManager,
		authStorage,
		modelRegistry,
		tools: Object.values(allTools),
	});

	const customMessages: Array<{ customType: string; content: unknown }> = [];
	session.subscribe((event) => {
		if (event.type === "message_end" && event.message.role === "custom") {
			customMessages.push({
				customType: event.message.customType,
				content: event.message.content,
			});
		}
	});

	await session.bindExtensions({
		uiContext: {
			select: async () => undefined,
			confirm: async () => false,
			input: async () => undefined,
			notify: () => {},
			onTerminalInput: () => () => {},
			setStatus: () => {},
			setWorkingMessage: () => {},
			setWidget: () => {},
			setFooter: () => {},
			setHeader: () => {},
			setTitle: () => {},
			custom: async () => undefined as never,
			pasteToEditor: () => {},
			setEditorText: () => {},
			getEditorText: () => "",
			editor: async () => undefined,
			setEditorComponent: () => {},
			theme: {} as never,
			getAllThemes: () => [],
			getTheme: () => undefined,
			setTheme: () => ({ success: false, error: "not implemented" }),
		},
		commandContextActions: {
			waitForIdle: async () => {},
			newSession: async () => ({ cancelled: false }),
			fork: async () => ({ cancelled: false }),
			navigateTree: async () => ({ cancelled: false }),
			switchSession: async () => ({ cancelled: false }),
			reload: async () => {},
		},
		shutdownHandler: () => {},
		onError: (error) => {
			throw new Error(`${error.extensionPath}: ${error.error}`);
		},
	});

	await session.extensionRunner?.emit({ type: "session_ready" });
	await new Promise((resolve) => setTimeout(resolve, 1800));

	const opening = customMessages.find((message) => message.customType === "presence");
	assert.ok(opening);
	assert.equal(typeof opening.content, "string");
	assert.ok(String(opening.content).length > 0);
	await session.extensionRunner?.emit({ type: "session_shutdown" });
});
