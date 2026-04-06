/**
 * [UPSTREAM]: None
 * [SURFACE]: SubAgent command parser
 * [LOCUS]: extensions/defaults/subagent/subagent-parser.ts
 */

export type SubAgentSubcommand = "run" | "stop" | "status" | "report" | "help";

export interface ParsedSubAgentCommand {
  command: SubAgentSubcommand;
  task?: string;
  options?: {
    write?: boolean;
  };
}

/**
 * Parse /subagent command input.
 * Supports both formats:
 *   /subagent:help (colon format, direct command)
 *   /subagent help (space format, args style like /agent team)
 */
export function parseSubAgentCommand(input: string): ParsedSubAgentCommand | null {
  const trimmed = input.trim();

  // /subagent or /subagent:help - show help
  if (trimmed === "/subagent" || trimmed === "/subagent:help" || trimmed === "/subagent help") {
    return { command: "help" };
  }

  // /subagent:run <task> [--write] or /subagent run <task> [--write]
  if (trimmed.startsWith("/subagent:run ") || trimmed.startsWith("/subagent run ")) {
    const prefix = trimmed.startsWith("/subagent:run ") ? "/subagent:run " : "/subagent run ";
    let task = trimmed.slice(prefix.length).trim();

    if (!task) {
      return null;
    }

    // Parse options
    const options: { write?: boolean } = {};
    if (task.includes("--write")) {
      options.write = true;
      task = task.replace(/--write/g, "").trim();
    }

    return { command: "run", task, options };
  }

  // /subagent:stop or /subagent stop
  if (trimmed === "/subagent:stop" || trimmed === "/subagent stop") {
    return { command: "stop" };
  }

  // /subagent:status or /subagent status
  if (trimmed === "/subagent:status" || trimmed === "/subagent status") {
    return { command: "status" };
  }

  // /subagent:report or /subagent report
  if (trimmed === "/subagent:report" || trimmed === "/subagent report") {
    return { command: "report" };
  }

  return null;
}

/**
 * Build help text for /subagent commands.
 */
export function buildSubAgentHelp(): string {
  return `
SubAgent Commands:
  /subagent                  - Show this help
  /subagent help             - Show this help
  /subagent run <task>       - Start a SubAgent run (read-only)
  /subagent run <task> --write - Start with write access
  /subagent stop             - Stop current run
  /subagent status           - Show current run status
  /subagent report           - Show last run report

Examples:
  /subagent run Analyze the codebase structure
  /subagent run Implement login feature --write
`.trim();
}
