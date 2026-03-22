/**
 * ACP (Agent Client Protocol) mode: Headless operation with JSON-RPC 2.0.
 *
 * Used for integrating with ACP-compatible editors like Zed and JetBrains.
 * Communication via stdin/stdout using JSON-RPC 2.0 messages.
 *
 * Protocol:
 * - Client → Agent: initialize, session/new, session/prompt, session/cancel
 * - Agent → Client: session/update (streaming events), session/request_permission
 */

import * as acp from "@agentclientprotocol/sdk";
import type {
	InitializeRequest,
	InitializeResponse,
	NewSessionRequest,
	NewSessionResponse,
	AuthenticateRequest,
	AuthenticateResponse,
	PromptRequest,
	PromptResponse,
	CancelNotification,
	SetSessionModeRequest,
	SetSessionModeResponse,
	TextContent,
	ToolKind,
} from "@agentclientprotocol/sdk";
import type { AgentSession } from "../../core/runtime/agent-session.js";
import type { AgentSessionEvent } from "../../core/runtime/agent-session.js";
import type { ExtensionUIContext } from "../../core/extensions/types.js";
import { Readable, Writable } from "node:stream";
import { theme } from "../interactive/theme/theme.js";

/**
 * Map nanoPencil tool names to ACP tool kinds.
 */
function mapToolKind(toolName: string): ToolKind {
	switch (toolName) {
		case "read":
			return "read";
		case "edit":
			return "edit";
		case "write":
			return "edit";
		case "bash":
			return "execute";
		case "grep":
			return "search";
		case "find":
			return "search";
		case "ls":
			return "read";
		default:
			return "other";
	}
}

/**
 * Create an extension UI context for ACP mode.
 * Returns silent defaults since ACP mode has no interactive UI.
 */
function createAcpExtensionUIContext(): ExtensionUIContext {
	return {
		select: async () => undefined,
		confirm: async () => false,
		input: async () => undefined,
		editor: async () => undefined,

		notify(message: string, type?: "info" | "warning" | "error"): void {
			process.stderr.write(`[${type ?? "info"}] ${message}\n`);
		},

		setStatus(): void {},
		setWorkingMessage(): void {},
		setWidget(): void {},
		setFooter(): void {},
		setHeader(): void {},
		setTitle(): void {},
		setEditorComponent(): void {},
		pasteToEditor(): void {},
		setEditorText(): void {},
		getEditorText: () => "",

		async custom(): Promise<never> {
			return undefined as never;
		},

		onTerminalInput(): () => void {
			return () => {};
		},

		get theme() {
			return theme;
		},

		getAllThemes() {
			return [];
		},

		getTheme(_name: string) {
			return undefined;
		},

		setTheme(_theme: string | unknown) {
			return { success: false, error: "Theme not supported in ACP mode" };
		},

		getToolsExpanded() {
			return false;
		},

		setToolsExpanded(): void {},
	};
}

/**
 * NanoPencilAgent - implements ACP Agent interface
 *
 * Wraps nanoPencil's AgentSession as an ACP Agent,
 * communicating with ACP Clients via stdin/stdout.
 */
class NanoPencilAgent implements acp.Agent {
	private connection: acp.AgentSideConnection;
	private session: AgentSession;
	private activeSessions: Map<string, { abortController: AbortController | null }>;

	constructor(connection: acp.AgentSideConnection, session: AgentSession) {
		this.connection = connection;
		this.session = session;
		this.activeSessions = new Map();
	}

	async initialize(params: InitializeRequest): Promise<InitializeResponse> {
		return {
			protocolVersion: acp.PROTOCOL_VERSION,
			agentCapabilities: {
				loadSession: false,
			},
		};
	}

	async newSession(params: NewSessionRequest): Promise<NewSessionResponse> {
		const sessionId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		this.activeSessions.set(sessionId, { abortController: null });
		return { sessionId };
	}

	async authenticate(params: AuthenticateRequest): Promise<AuthenticateResponse | void> {
		// Authentication not implemented
		return;
	}

	async prompt(params: PromptRequest): Promise<PromptResponse> {
		const { sessionId, prompt } = params;
		const sessionState = this.activeSessions.get(sessionId);
		if (!sessionState) {
			throw new Error(`Session ${sessionId} not found`);
		}

		// Abort any previous prompt
		sessionState.abortController?.abort();
		sessionState.abortController = new AbortController();

		// Extract text from prompt content blocks
		const userText = prompt
			.filter((block) => "text" in block && typeof (block as any).text === "string")
			.map((block) => (block as any).text as string)
			.join("\n");

		// Subscribe to events and forward as ACP session/update
		const unsubscribe = this.session.subscribe((event) => {
			this.mapEventToAcp(sessionId, event);
		});

		try {
			// @ts-expect-error - source is for internal use
			await this.session.prompt(userText, { source: "acp" });
			return { stopReason: "end_turn" };
		} catch (error) {
			if (sessionState.abortController.signal.aborted) {
				return { stopReason: "cancelled" };
			}
			// For errors, return end_turn - the client should detect errors via other means
			process.stderr.write(`[error] ${error instanceof Error ? error.message : String(error)}\n`);
			return { stopReason: "end_turn" };
		} finally {
			unsubscribe();
			sessionState.abortController = null;
		}
	}

	async cancel(params: CancelNotification): Promise<void> {
		const sessionState = this.activeSessions.get(params.sessionId);
		if (sessionState) {
			sessionState.abortController?.abort();
			await this.session.abort();
		}
	}

	async setSessionMode?(params: SetSessionModeRequest): Promise<SetSessionModeResponse | void> {
		// Session mode not implemented
		return;
	}

	/**
	 * Map nanoPencil AgentSessionEvent to ACP session/update notifications.
	 */
	private mapEventToAcp(sessionId: string, event: AgentSessionEvent): void {
		switch (event.type) {
			case "message_update": {
				const sub = event.assistantMessageEvent;
				switch (sub.type) {
					case "text_delta":
						this.connection.sessionUpdate({
							sessionId,
							update: {
								sessionUpdate: "agent_message_chunk",
								content: { type: "text", text: sub.delta },
							},
						});
						break;

					case "thinking_delta":
						this.connection.sessionUpdate({
							sessionId,
							update: {
								sessionUpdate: "agent_thought_chunk",
								content: { type: "text", text: sub.delta },
							},
						});
						break;

					// toolcall_start, toolcall_end, etc. are handled by tool_execution_* events
				}
				break;
			}

			case "tool_execution_start":
				this.connection.sessionUpdate({
					sessionId,
					update: {
						sessionUpdate: "tool_call",
						toolCallId: event.toolCallId,
						title: `${event.toolName}`,
						kind: mapToolKind(event.toolName),
						status: "pending",
						locations: [],
					},
				});
				break;

			case "tool_execution_end":
				this.connection.sessionUpdate({
					sessionId,
					update: {
						sessionUpdate: "tool_call_update",
						toolCallId: event.toolCallId,
						status: event.isError ? "failed" : "completed",
						content: [
							{
								type: "content",
								content: {
									type: "text",
									text:
										typeof event.result === "string"
											? event.result
											: JSON.stringify(event.result, null, 2),
								},
							},
						],
					},
				});
				break;

			// agent_start, agent_end, turn_start, turn_end, etc. don't need mapping
		}
	}
}

/**
 * Run in ACP mode.
 * Listens for JSON-RPC 2.0 messages on stdin, outputs JSON-RPC responses/events on stdout.
 */
export async function runAcpMode(session: AgentSession): Promise<never> {
	// Bind extensions with headless UI context
	await session.bindExtensions({
		uiContext: createAcpExtensionUIContext(),
		commandContextActions: {
			waitForIdle: () => session.agent.waitForIdle(),
			newSession: async (options) => {
				const success = await session.newSession(options);
				return { cancelled: !success };
			},
			fork: async (entryId) => {
				const result = await session.fork(entryId);
				return { cancelled: result.cancelled };
			},
			navigateTree: async (targetId, options) => {
				const result = await session.navigateTree(targetId, options);
				return { cancelled: result.cancelled };
			},
			switchSession: async (sessionPath) => {
				const success = await session.switchSession(sessionPath);
				return { cancelled: !success };
			},
			reload: async () => {
				await session.reload();
			},
		},
		shutdownHandler: () => {
			process.exit(0);
		},
		onError: (err) => {
			process.stderr.write(`[extension_error] ${err.extensionPath}: ${err.error}\n`);
		},
	});

	// Set up ACP connection via stdin/stdout
	const input = Writable.toWeb(process.stdout) as WritableStream<Uint8Array>;
	const output = Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>;
	const stream = acp.ndJsonStream(input, output);

	new acp.AgentSideConnection((conn) => new NanoPencilAgent(conn, session), stream);

	// Keep process alive
	return new Promise(() => {});
}
