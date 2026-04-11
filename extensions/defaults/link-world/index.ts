/**
 * link-world extension: Execute /link-world to let AI read the installation docs in the same directory and install accordingly.
 * After installation, automatically provides internet-search Skill.
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
 * Check if agent-reach is installed
 */
function isAgentReachInstalled(): boolean {
	try {
		// Check if agent-reach CLI is available
		execSync("agent-reach --version", { encoding: "utf-8", stdio: "pipe" });
		return true;
	} catch {
		return false;
	}
}

export default function linkWorldExtension(api: ExtensionAPI) {
	/** TUI shows brief prompt only, not full installation doc content */
	api.registerMessageRenderer(LINK_WORLD_CUSTOM_TYPE, (message, _options, theme) => {
		const box = new Box(1, 1, (t) => theme.bg("customMessageBg", t));
		const label = theme.fg("customMessageLabel", `\x1b[1m[link-world]\x1b[22m `);
		const text = theme.fg("customMessageText", "Starting Link-world execution...");
		box.addChild(new Text(label + text, 0, 0));
		box.addChild(new Spacer(1));
		const container = new Container();
		container.addChild(new Spacer(1));
		container.addChild(box);
		return container;
	});

	// Register resources_discover event: when agent-reach is installed, provide internet-search skill
	api.on("resources_discover", async (_event: ResourcesDiscoverEvent): Promise<ResourcesDiscoverResult> => {
		// Always expose the skill so the model knows how to install or use link-world.
		// The skill itself checks whether agent-reach is already available.
		if (!existsSync(SKILL_PATH)) {
			return {};
		}

		// Return skill path
		return {
			skillPaths: [SKILL_PATH],
		};
	});

	api.registerCommand("link-world", {
		description: "Install link-world to provide internet access for AI (Twitter, YouTube, Bilibili, Xiaohongshu, Douyin, etc.)",
		handler: async (_args: string, _ctx: ExtensionCommandContext) => {
			if (isAgentReachInstalled()) {
				api.sendMessage(
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
				? `Please follow the installation guide below strictly to help me install link-world. Do not modify files in the workspace, all installation follows the directory rules in the doc.\n\n---\n\n${doc}`
				: "Please help me install link-world according to official docs: https://raw.githubusercontent.com/Panniantong/agent-reach/main/docs/install.md";
			api.sendMessage(
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
