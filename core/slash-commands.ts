/**
 * [UPSTREAM]: No external dependencies
 * [SURFACE]: SlashCommandInfo, BuiltinSlashCommand, slashCommand definitions
 * [LOCUS]: core/slash-commands.ts - slash command types and registry
 * [COVENANT]: Change slash commands → update this header
 */
export type SlashCommandSource = "extension" | "prompt" | "skill";

export type SlashCommandLocation = "user" | "project" | "path";

export interface SlashCommandInfo {
  name: string;
  description?: string;
  source: SlashCommandSource;
  location?: SlashCommandLocation;
  path?: string;
}

export interface BuiltinSlashCommand {
  name: string;
  description: string;
}

export const BUILTIN_SLASH_COMMANDS: ReadonlyArray<BuiltinSlashCommand> = [
  { name: "settings", description: "Open settings menu" },
  { name: "model", description: "Select model (opens selector UI)" },
  {
    name: "scoped-models",
    description: "Enable/disable models for Ctrl+P cycling",
  },
  { name: "apikey", description: "Update API key for current provider" },
  { name: "mcp", description: "Manage MCP servers (list, enable, disable)" },
  { name: "soul", description: "Show AI personality and stats (Soul)" },
  { name: "persona", description: "Switch AI persona/personality pack" },
  {
    name: "memory",
    description: "Show project memory and knowledge (NanoMem)",
  },
  { name: "dream", description: "Consolidate project memory (NanoMem)" },
  { name: "export", description: "Export session to HTML file" },
  { name: "share", description: "Share session as a secret GitHub gist" },
  { name: "copy", description: "Copy last agent message to clipboard" },
  { name: "name", description: "Set session display name" },
  { name: "session", description: "Show session info and stats" },
  { name: "usage", description: "Show token usage and cost stats" },
  { name: "changelog", description: "Show changelog entries" },
  { name: "hotkeys", description: "Show all keyboard shortcuts" },
  { name: "fork", description: "Create a new fork from a previous message" },
  { name: "tree", description: "Navigate session tree (switch branches)" },
  { name: "login", description: "Login with OAuth provider" },
  { name: "logout", description: "Logout from OAuth provider" },
  { name: "new", description: "Start a new session" },
  { name: "update", description: "Check for NanoPencil updates" },
  { name: "compact", description: "Manually compact the session context" },
  { name: "resume", description: "Resume a different session" },
  {
    name: "reload",
    description: "Reload extensions, skills, prompts, and themes",
  },
  {
    name: "link-world",
    description: "安装 link-world，为 AI 提供互联网访问（Twitter、YouTube、Bilibili 等）",
  },
  { name: "quit", description: "Quit pi" },
];
