/**
 * [WHO]: isSameVisibleUserQuery(), consumeMatchingVisibleUserQuery()
 * [FROM]: Depends only on string normalization
 * [TO]: Consumed by interactive render/rebuild paths that reconcile optimistic user echoes
 * [HERE]: modes/interactive/user-query-dedupe.ts - shared user query dedupe predicate
 */

export interface OptimisticUserQuery {
  text: string;
}

const AT_MENTION_DISPLAY_REGEX = /(^|\s)@([\w./\\\-]+)(?::(\d+)(?:-(\d+))?)?(?=\s|$)/g;
const SKILL_COMMAND_REGEX = /^\/skill:([^\s]+)(?:\s+([\s\S]*))?$/;
const SLASH_COMMAND_WITH_ARGS_REGEX = /^\/(?!skill:)([^\s]+)\s+([\s\S]+)$/;

function normalizeVisibleUserQuery(text: string): string {
  return text.trim().replace(
    AT_MENTION_DISPLAY_REGEX,
    (_match, prefix: string, filePath: string, startLine?: string, endLine?: string) => {
      const range = startLine
        ? endLine
          ? ` lines ${startLine}-${endLine}`
          : ` line ${startLine}`
        : "";
      return `${prefix}[file: ${filePath}${range}]`;
    },
  );
}

export function isSameVisibleUserQuery(
  optimisticText: string,
  runtimeText: string,
): boolean {
  const optimistic = normalizeVisibleUserQuery(optimisticText);
  const runtime = normalizeVisibleUserQuery(runtimeText);
  if (!optimistic) return false;
  if (runtime === optimistic) return true;
  if (isExpandedSkillCommandMatch(optimistic, runtime)) return true;
  if (isExpandedPromptTemplateMatch(optimistic, runtime)) return true;

  // @-mention expansion prepends read-only context before the original visible query.
  // The chat should keep the optimistic visible query instead of echoing the
  // expanded model-facing prompt as a second user message.
  return runtime.endsWith(`\n\n${optimistic}`);
}

function isExpandedSkillCommandMatch(optimistic: string, runtime: string): boolean {
  const match = optimistic.match(SKILL_COMMAND_REGEX);
  if (!match) return false;
  const skillName = match[1];
  const args = (match[2] ?? "").trim();
  if (!runtime.startsWith(`<skill name="${skillName}" `)) return false;
  const closeTag = "</skill>";
  const closeIndex = runtime.indexOf(closeTag);
  if (closeIndex === -1) return false;
  const suffix = runtime.slice(closeIndex + closeTag.length).trim();
  return suffix === args;
}

function isExpandedPromptTemplateMatch(optimistic: string, runtime: string): boolean {
  const match = optimistic.match(SLASH_COMMAND_WITH_ARGS_REGEX);
  if (!match) return false;
  if (runtime.startsWith("/")) return false;
  const args = match[2].trim();
  if (!args) return false;
  return runtime === args || runtime.endsWith(`\n\n${args}`) || runtime.endsWith(`\n${args}`);
}

export function consumeMatchingVisibleUserQuery(
  optimisticMessages: OptimisticUserQuery[],
  runtimeText: string,
  options: { consumeOldestOnMismatch?: boolean } = {},
): boolean {
  const index = optimisticMessages.findIndex((message) =>
    isSameVisibleUserQuery(message.text, runtimeText),
  );
  if (index === -1) {
    if (!options.consumeOldestOnMismatch || optimisticMessages.length === 0) {
      return false;
    }
    optimisticMessages.shift();
    return true;
  }
  optimisticMessages.splice(index, 1);
  return true;
}
