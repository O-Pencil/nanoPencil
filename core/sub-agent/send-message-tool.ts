/**
 * [WHO]: createSendMessageTool — the "SendMessage" tool for addressing named running agents
 * [FROM]: Depends on @catui/agent-core, @sinclair/typebox, ./agent-registry, ./sub-agent-backend
 * [TO]: Consumed by core/runtime/agent-session.ts (tool registration alongside Agent/Task tools)
 * [HERE]: core/sub-agent/send-message-tool.ts - SendMessage tool per CC §XI (inter-agent messaging)
 * [COVENANT]: Change message protocol → update agent-input-output.ts
 */

import type { AgentTool } from "@catui/agent-core";
import { type Static, Type } from "@sinclair/typebox";
import type { AgentDefinitionRegistry } from "./agent-registry.js";
import { agentDefinitionRegistry } from "./agent-registry.js";
import type { InProcessSubAgentBackend } from "./sub-agent-backend.js";

// ============================================================================
// Constants
// ============================================================================

export const SEND_MESSAGE_TOOL_NAME = "SendMessage";

// ============================================================================
// Input Schema (CC §XI — SendMessage)
// ============================================================================

const sendMessageSchema = Type.Object({
  to: Type.String({
    description: "The name of the running agent to send the message to (as registered by the Agent tool's `name` parameter).",
  }),
  message: Type.String({
    description: "The message content to send to the named agent.",
  }),
});

export type SendMessageInput = Static<typeof sendMessageSchema>;

// ============================================================================
// Create SendMessage Tool
// ============================================================================

/**
 * Create the SendMessage tool for inter-agent communication.
 *
 * Per CC §XI:
 * - SendMessage allows a parent agent (or another agent in the same session)
 *   to send a text message to a named running agent.
 * - The named agent must have been spawned with a `name` parameter via the
 *   Agent tool, which registers it in the agentNameRegistry.
 * - The message is injected as a new user message into the running agent's
 *   conversation.
 *
 * This is a lightweight tool that looks up the named agent in the registry
 * and forwards the message. It does NOT create a new agent — only sends
 * to an already-running one.
 */
export function createSendMessageTool(
  config: {
    registry?: AgentDefinitionRegistry;
    backend?: InProcessSubAgentBackend;
  } = {},
): AgentTool<typeof sendMessageSchema> {
  const registry = config.registry ?? agentDefinitionRegistry;
  const backend = config.backend;

  return {
    name: SEND_MESSAGE_TOOL_NAME,
    label: "SendMessage",
    description: [
      "Send a message to a named running agent.",
      "",
      "Use this to communicate with an agent that was spawned with the `name` parameter.",
      "The agent must be currently running — you cannot send messages to completed agents.",
      "",
      "Parameters:",
      "- to: The name of the running agent (as specified in the Agent tool's `name` parameter)",
      "- message: The message content to send",
      "",
      "The named agent will receive the message as a new user message in its conversation.",
    ].join("\n"),
    parameters: sendMessageSchema,

    execute: async (_toolCallId: string, input: SendMessageInput, _signal?: AbortSignal) => {
      // Look up the named agent in the registry (CC §XIV: agentNameRegistry)
      const agentId = registry.findAgentByName(input.to);

      if (!agentId) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No running agent found with name '${input.to}'. The agent may have completed or was never registered with that name.`,
            },
          ],
          details: { to: input.to, delivered: false },
        };
      }

      // Real message delivery via InProcessSubAgentBackend (CC §XI)
      if (!backend) {
        return {
          content: [
            {
              type: "text" as const,
              text: `SendMessage backend not available. Cannot deliver message to '${input.to}'.`,
            },
          ],
          details: { to: input.to, agentId, delivered: false, reason: "no_backend" },
        };
      }

      const session = backend.getSession(agentId);
      if (!session) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Agent '${input.to}' is no longer running (agentId: ${agentId}).`,
            },
          ],
          details: { to: input.to, agentId, delivered: false, reason: "session_not_found" },
        };
      }

      // Inject the message as a new user message into the running agent's conversation
      try {
        await session.session.prompt(input.message);
        return {
          content: [
            {
              type: "text" as const,
              text: `Message delivered to agent '${input.to}' (agentId: ${agentId}).`,
            },
          ],
          details: { to: input.to, agentId, delivered: true },
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to deliver message to '${input.to}': ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          details: { to: input.to, agentId, delivered: false, reason: "delivery_failed" },
        };
      }
    },
  };
}
