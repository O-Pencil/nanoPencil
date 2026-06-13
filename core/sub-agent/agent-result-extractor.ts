/**
 * [WHO]: extractAgentResult, truncateResult — result extraction and truncation per CC §11.2 (VS8)
 * [FROM]: Depends on @catui/agent-core for AgentMessage, ./agent-definition for MAX_RESULT_SIZE_CHARS
 * [TO]: Consumed by ./agent-tool
 * [HERE]: core/sub-agent/agent-result-extractor.ts - Sub-agent result extraction
 */

import type { AgentMessage } from "@catui/agent-core";
import type { AgentOutputCompleted, AgentSpawnMetadata, AgentUsage } from "./agent-input-output.js";
import { MAX_RESULT_SIZE_CHARS } from "./agent-definition.js";

/**
 * Extract the result from a completed sub-agent run.
 * Matches CC's VS8 function exactly.
 *
 * Per CC §11.2:
 * 1. Find the last assistant message
 * 2. Extract text content from it
 * 3. If last message has no text, search backwards for one that does
 * 4. Calculate totals (tokens, tool use count, duration)
 * 5. Truncate at maxResultSizeChars (100,000)
 */
export function extractAgentResult(
  messages: AgentMessage[],
  agentId: string,
  metadata: AgentSpawnMetadata,
): AgentOutputCompleted {
  // 1. Find the last assistant message
  const lastAssistant = findLastAssistantMessage(messages);

  // 2. Extract text content
  let content: Array<{ type: "text"; text: string }>;

  if (lastAssistant) {
    content = extractTextContentFromMessage(lastAssistant);
  } else {
    content = [];
  }

  // 3. If last message has no text, search backwards (CC §11.2 step 3)
  if (content.length === 0) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role !== "assistant") continue;
      const texts = extractTextContentFromMessage(msg);
      if (texts.length > 0) {
        content = texts;
        break;
      }
    }
  }

  // 4. Calculate totals
  const totalTokens = calculateTotalTokens(messages);
  const totalToolUseCount = calculateTotalToolUseCount(messages);
  const usage = calculateUsage(messages);

  // 5. Build result
  return {
    agentId,
    agentType: metadata.agentType,
    content,
    totalToolUseCount,
    totalDurationMs: Date.now() - metadata.startTime,
    totalTokens,
    usage,
    status: "completed",
    prompt: metadata.prompt,
  };
}

/**
 * Truncate result content to maxResultSizeChars.
 * Per CC §VI step 14: maxResultSizeChars = 100,000 (1e5).
 */
export function truncateResult(
  result: AgentOutputCompleted,
  maxChars: number = MAX_RESULT_SIZE_CHARS,
): AgentOutputCompleted {
  const totalChars = result.content.reduce((sum, c) => sum + c.text.length, 0);

  if (totalChars <= maxChars) {
    return result;
  }

  // Truncate each content block proportionally
  let remainingChars = maxChars;
  const truncatedContent = result.content.map((c) => {
    if (remainingChars <= 0) {
      return { type: "text" as const, text: "" };
    }
    if (c.text.length <= remainingChars) {
      remainingChars -= c.text.length;
      return c;
    }
    const truncated = c.text.slice(0, remainingChars) + "\n\n[Result truncated due to size limit]";
    remainingChars = 0;
    return { type: "text" as const, text: truncated };
  });

  return {
    ...result,
    content: truncatedContent.filter((c) => c.text.length > 0),
  };
}

// ============================================================================
// Internal Helpers
// ============================================================================

function findLastAssistantMessage(messages: AgentMessage[]): AgentMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") {
      return messages[i];
    }
  }
  return undefined;
}

function extractTextContentFromMessage(message: AgentMessage): Array<{ type: "text"; text: string }> {
  const content = (message as any).content;
  if (!content) return [];
  if (typeof content === "string") {
    return [{ type: "text", text: content }];
  }
  if (Array.isArray(content)) {
    return content
      .filter((part: any) => part.type === "text" && typeof part.text === "string")
      .map((part: any) => ({ type: "text" as const, text: part.text as string }));
  }
  return [];
}

export function calculateTotalTokens(messages: AgentMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    if (msg.role === "assistant") {
      const usage = (msg as any).usage;
      if (usage) {
        total += (usage.total_tokens ?? (usage.input ?? 0) + (usage.output ?? 0));
      }
    }
  }
  return total;
}

export function calculateTotalToolUseCount(messages: AgentMessage[]): number {
  let count = 0;
  for (const msg of messages) {
    if (msg.role === "assistant") {
      const content = (msg as any).content;
      if (Array.isArray(content)) {
        count += content.filter((part: any) => part.type === "toolCall").length;
      }
    }
  }
  return count;
}

export function calculateUsage(messages: AgentMessage[]): AgentUsage {
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheCreationInputTokens = 0;
  let cacheReadInputTokens = 0;

  for (const msg of messages) {
    if (msg.role === "assistant") {
      const usage = (msg as any).usage;
      if (usage) {
        inputTokens += usage.input ?? 0;
        outputTokens += usage.output ?? 0;
        cacheCreationInputTokens += usage.cacheCreation ?? usage.cache_creation_input_tokens ?? 0;
        cacheReadInputTokens += usage.cacheRead ?? usage.cache_read_input_tokens ?? 0;
      }
    }
  }

  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_creation_input_tokens: cacheCreationInputTokens || null,
    cache_read_input_tokens: cacheReadInputTokens || null,
    server_tool_use: null,
    service_tier: null,
    cache_creation: null,
  };
}
