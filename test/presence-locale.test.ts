/**
 * Test presence language detection and greeting generation
 */

import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
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
import { setLocale, getLocale } from "../core/i18n/index.js";

test("presence-locale: Chinese greeting when memory has Chinese preference", async () => {
	const cwd = process.cwd();
	const agentDir = mkdtempSync(join(tmpdir(), "nanopencil-locale-"));

	// Create memory directory with Chinese preference
	const memoryDir = join(agentDir, "memory");
	const { mkdirSync, writeFileSync } = await import("node:fs");
	mkdirSync(memoryDir, { recursive: true });

	// Write a Chinese language preference
	const prefs = [
		{
			id: "test-locale-zh",
			type: "preference",
			name: "用户偏好中文",
			summary: "用户希望我用中文回复",
			detail: "用户明确表示希望用中文交流",
			content: "用户希望用中文回复",
			tags: ["语言", "中文", "locale"],
			importance: 6,
			strength: 100,
			created: new Date().toISOString(),
			eventTime: new Date().toISOString(),
			accessCount: 1,
			retention: "core",
			salience: 6,
			stability: "stable",
		},
	];
	writeFileSync(join(memoryDir, "preferences.json"), JSON.stringify(prefs, null, 2));

	// Write empty episodes (required by engine)
	writeFileSync(join(memoryDir, "episodes.json"), JSON.stringify([]));

	process.env.NANOMEM_MEMORY_DIR = memoryDir;

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
	await new Promise((resolve) => setTimeout(resolve, 2000));

	const opening = customMessages.find((message) => message.customType === "presence");
	assert.ok(opening, "Should have received a presence message");
	assert.equal(typeof opening.content, "string");

	// Check if the greeting contains Chinese characters
	const content = String(opening.content);
	const hasChinese = /[\u4e00-\u9fff]/.test(content);
	assert.ok(hasChinese, `Opening message should contain Chinese. Got: ${content}`);

	// Cleanup
	rmSync(agentDir, { recursive: true, force: true });
});

test("presence-locale: English greeting when no Chinese preference", async () => {
	const cwd = process.cwd();
	const agentDir = mkdtempSync(join(tmpdir(), "nanopencil-locale-en-"));

	// Create memory directory with NO language preference
	const memoryDir = join(agentDir, "memory");
	const { mkdirSync, writeFileSync } = await import("node:fs");
	mkdirSync(memoryDir, { recursive: true });

	// Write empty preferences (no language preference)
	writeFileSync(join(memoryDir, "preferences.json"), JSON.stringify([]));
	writeFileSync(join(memoryDir, "episodes.json"), JSON.stringify([]));

	process.env.NANOMEM_MEMORY_DIR = memoryDir;

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
	await new Promise((resolve) => setTimeout(resolve, 2000));

	const opening = customMessages.find((message) => message.customType === "presence");
	assert.ok(opening, "Should have received a presence message");
	assert.equal(typeof opening.content, "string");

	// With no language preference, it should default to English (getLocale() returns 'en')
	const content = String(opening.content);
	const hasChinese = /[\u4e00-\u9fff]/.test(content);
	assert.equal(hasChinese, false, `Opening message should be English. Got: ${content}`);

	// Cleanup
	rmSync(agentDir, { recursive: true, force: true });
});
