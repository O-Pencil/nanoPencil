/**
 * link-world 扩展：执行 /link-world 时让 AI 读取同目录下的安装文档并按要求安装。
 * 安装后自动提供 internet-search Skill。
 */
/**
 * [WHO]: Extension interface
 * [FROM]: Depends on node:fs, node:path, node:url, child_process, @pencil-agent/tui
 * [TO]: Loaded by core/extensions/loader.ts as extension entry point
 * [HERE]: extensions/defaults/link-world/index.ts -
 */


import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "child_process";
import { Box, Container, Spacer, Text } from "@pencil-agent/tui";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ResourcesDiscoverEvent,
	ResourcesDiscoverResult,
} from "../../../core/extensions/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOC_PATH = join(__dirname, "linkworld.md");
const SKILL_PATH = join(__dirname, "internet-search", "internet-search.md");

const LINK_WORLD_CUSTOM_TYPE = "link-world-install";

function getInstallDoc(): string {
	try {
		return readFileSync(DOC_PATH, "utf-8");
	} catch {
		return "";
	}
}

/**
 * 检查 agent-reach 是否已安装
 */
function isAgentReachInstalled(): boolean {
	try {
		// 检查 agent-reach CLI 是否可用
		execSync("agent-reach --version", { encoding: "utf-8", stdio: "pipe" });
		return true;
	} catch {
		return false;
	}
}

export default function linkWorldExtension(pi: ExtensionAPI) {
	/** TUI 仅显示简短提示，不展示完整安装文档内容 */
	pi.registerMessageRenderer(LINK_WORLD_CUSTOM_TYPE, (message, _options, theme) => {
		const box = new Box(1, 1, (t) => theme.bg("customMessageBg", t));
		const label = theme.fg("customMessageLabel", `\x1b[1m[link-world]\x1b[22m `);
		const text = theme.fg("customMessageText", "开始执行 Link-world...");
		box.addChild(new Text(label + text, 0, 0));
		box.addChild(new Spacer(1));
		const container = new Container();
		container.addChild(new Spacer(1));
		container.addChild(box);
		return container;
	});

	// 注册 resources_discover 事件：当 agent-reach 已安装时，提供 internet-search skill
	pi.on("resources_discover", async (_event: ResourcesDiscoverEvent): Promise<ResourcesDiscoverResult> => {
		// Always expose the skill so the model knows how to install or use link-world.
		// The skill itself checks whether agent-reach is already available.
		if (!existsSync(SKILL_PATH)) {
			return {};
		}

		// 返回 skill 路径
		return {
			skillPaths: [SKILL_PATH],
		};
	});

	pi.registerCommand("link-world", {
		description: "安装 link-world，为 AI 提供互联网访问（Twitter、YouTube、Bilibili、小红书、抖音等）",
		handler: async (_args: string, _ctx: ExtensionCommandContext) => {
			if (isAgentReachInstalled()) {
				pi.sendMessage(
					{
						customType: LINK_WORLD_CUSTOM_TYPE,
						content:
							"link-world is already installed on this machine. Do not reinstall it. Run `agent-reach doctor` to verify the current setup, repair any missing channels, and continue configuring the internet tools the user needs. The installation is persistent across sessions because link-world stores its data outside the workspace.",
						display: true,
					},
					{ triggerTurn: true },
				);
				return;
			}

			const doc = getInstallDoc();
			const content = doc
				? `请严格按照以下安装指南操作，帮我安装 link-world。不要修改工作区内的文件，所有安装按文档中的目录规则进行。\n\n---\n\n${doc}`
				: "请帮我安装 link-world，按官方文档进行：https://raw.githubusercontent.com/Panniantong/agent-reach/main/docs/install.md";
			pi.sendMessage(
				{
					customType: LINK_WORLD_CUSTOM_TYPE,
					content,
					display: true,
				},
				{ triggerTurn: true },
			);
		},
	});
}
