/**
 * [WHO]: extractAtMentionedFiles — @-mention file reference parser for user input
 * [FROM]: Depends on node:fs, node:path for file reading and path resolution
 * [TO]: Consumed by controllers/input-submit-controller.ts (idle + streaming submit paths)
 * [HERE]: modes/interactive/at-mentions.ts — input @-mention processing per CC §XI
 *
 * Parses @filename and @file:line-range syntax from user input, reads referenced
 * files, and returns cleaned text + file content attachments for LLM context.
 */

import * as fs from "node:fs";
import * as path from "node:path";

/**
 * A single @-mention reference parsed from user input.
 */
export interface AtMention {
  /** The file path referenced (relative or absolute) */
  path: string;
  /** Start line (1-indexed, inclusive). Undefined = entire file. */
  offset?: number;
  /** End line (1-indexed, inclusive). Undefined = to end of file (or just offset line). */
  limit?: number;
  /** The full match string (e.g. "@src/foo.ts:10-20") */
  raw: string;
}

/**
 * Result of extracting @-mentions from user input.
 */
export interface AtMentionResult {
  /** Text with @-mentions replaced by [file: name] references */
  text: string;
  /** Successfully read file contents as context blocks */
  mentions: Array<{
    /** File path (for display) */
    path: string;
    /** Line range description (e.g. "lines 10-20" or "entire file") */
    range: string;
    /** File content */
    content: string;
    /** Start line (1-indexed) */
    startLine?: number;
    /** End line (1-indexed) */
    endLine?: number;
  }>;
}

/**
 * Regex for @-mention file references.
 *
 * Supports:
 * - @filename — entire file
 * - @filename:10 — single line
 * - @filename:10-20 — line range
 *
 * Pattern: word boundary or start, @, path (non-whitespace, non-colon),
 * optional :N or :N-M line range, followed by word boundary or end.
 */
const AT_MENTION_REGEX = /(^|\s)@([\w./\\\-]+)(?::(\d+)(?:-(\d+))?)?(?=\s|$)/g;

/**
 * Extract @-mentioned files from user input text.
 *
 * @param text User input text
 * @param cwd Current working directory (for resolving relative paths)
 * @returns Cleaned text and file content attachments
 */
export function extractAtMentionedFiles(
  text: string,
  cwd: string,
): AtMentionResult {
  const mentions: AtMentionResult["mentions"] = [];
  let cleanedText = text;

  // Collect all matches first (can't modify string while regex iterating)
  const matches: Array<{
    fullMatch: string;
    prefix: string;
    filePath: string;
    startLine?: number;
    endLine?: number;
    index: number;
  }> = [];

  let match: RegExpExecArray | null;
  const regex = new RegExp(AT_MENTION_REGEX.source, "g");
  while ((match = regex.exec(text)) !== null) {
    const [, prefix, filePath, startStr, endStr] = match;
    if (!filePath) continue;

    matches.push({
      fullMatch: match[0],
      prefix: prefix ?? "",
      filePath,
      startLine: startStr ? parseInt(startStr, 10) : undefined,
      endLine: endStr ? parseInt(endStr, 10) : startStr ? parseInt(startStr, 10) : undefined,
      index: match.index,
    });
  }

  // Process matches in reverse order to preserve indices during replacement
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    const resolvedPath = path.isAbsolute(m.filePath)
      ? m.filePath
      : path.resolve(cwd, m.filePath);

    try {
      if (!fs.existsSync(resolvedPath)) continue;
      if (!fs.statSync(resolvedPath).isFile()) continue;

      const allLines = fs.readFileSync(resolvedPath, "utf-8").split("\n");
      const startLine = m.startLine ?? 1;
      const endLine = m.endLine ?? allLines.length;

      // Clamp to valid range
      const clampedStart = Math.max(1, Math.min(startLine, allLines.length));
      const clampedEnd = Math.max(clampedStart, Math.min(endLine, allLines.length));

      const selectedLines = allLines.slice(clampedStart - 1, clampedEnd);
      const content = selectedLines.map((line, idx) => {
        const lineNum = clampedStart + idx;
        return `${lineNum}\t${line}`;
      }).join("\n");

      const rangeDesc = m.startLine
        ? m.endLine && m.endLine !== m.startLine
          ? `lines ${clampedStart}-${clampedEnd}`
          : `line ${clampedStart}`
        : "entire file";

      mentions.push({
        path: m.filePath,
        range: rangeDesc,
        content,
        startLine: m.startLine ? clampedStart : undefined,
        endLine: m.endLine ? clampedEnd : undefined,
      });

      // Replace the @-mention with a display reference
      const ref = `[file: ${m.filePath}${m.startLine ? ` ${rangeDesc}` : ""}]`;
      cleanedText = cleanedText.slice(0, m.index) + m.prefix + ref + cleanedText.slice(m.index + m.fullMatch.length);
    } catch {
      // Skip files that can't be read
    }
  }

  return { text: cleanedText.trim(), mentions };
}

/**
 * Build a context block string from extracted @-mentions.
 * This is injected into the prompt as additional context.
 */
export function buildAtMentionContext(mentions: AtMentionResult["mentions"]): string {
  if (mentions.length === 0) return "";

  const blocks = mentions.map((m) => {
    return [
      `### @${m.path} (${m.range})`,
      "```",
      m.content,
      "```",
    ].join("\n");
  });

  return [
    "The following files are referenced via @-mentions in the user's message.",
    "Treat them as read-only context unless the task explicitly allows updates.",
    "",
    ...blocks,
  ].join("\n");
}
