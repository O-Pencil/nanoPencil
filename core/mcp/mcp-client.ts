/**
 * MCP (Model Context Protocol) Client
 *
 * Provides client functionality to connect to MCP servers and call their tools.
 * Supports stdio transport with JSON-RPC framing.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { getAgentDir } from "../../config.js";

// Log level control: DEBUG shows all MCP messages, RELEASE only shows summary
// Check if running from installed location (production) vs development
const isProductionBuild = typeof import.meta.url === "string" && import.meta.url.includes("node_modules");
const isDebugMode = process.env.NODE_ENV === "development" || (process.env.NODE_ENV !== "production" && !isProductionBuild);

function mcpLog(...args: unknown[]): void {
  if (isDebugMode) {
    console.log(...args);
  }
}

function mcpWarn(...args: unknown[]): void {
  if (isDebugMode) {
    console.warn(...args);
  }
}

function mcpError(...args: unknown[]): void {
  // Errors are always shown
  console.error(...args);
}

export interface MCPServerConfig {
  /** Unique identifier for this server */
  id: string;
  /** Display name */
  name: string;
  /** Command to start the server (e.g., "npx", "uvx") */
  command: string;
  /** Arguments to pass to the command */
  args: string[];
  /** Environment variables to pass */
  env?: Record<string, string>;
  /** Transport type: "stdio" or "sse" */
  transport?: "stdio" | "sse";
  /** Whether this server is enabled */
  enabled?: boolean;
  /** Tool call timeout in milliseconds (default: 20000) */
  toolTimeout?: number;
  /** Initialize request timeout in milliseconds (default: 20000) */
  initTimeout?: number;
  /** Working directory for the server process */
  cwd?: string;
}

export interface MCPTool {
  /** Tool name (server_id/tool_name format) */
  name: string;
  /** Display name */
  displayName?: string;
  /** Tool description */
  description: string;
  /** JSON Schema for input */
  inputSchema: Record<string, unknown>;
  /** Server ID */
  serverId: string;
}

export interface MCPToolResult {
  /** Tool result content */
  content: Array<{
    type: "text" | "image" | "resource";
    text?: string;
    data?: any;
  }>;
  /** Error message if call failed */
  error?: string;
  /** Whether result is partial (hasMore=true) */
  isPartial?: boolean;
}

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { code?: number; message?: string; data?: unknown };
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timer: NodeJS.Timeout;
}

interface ServerRuntime {
  process: ChildProcessWithoutNullStreams;
  buffer: Buffer;
  nextRequestId: number;
  pendingRequests: Map<number, PendingRequest>;
}

interface SpawnSpec {
  command: string;
  args: string[];
}

/**
 * MCP Client class
 * Manages connections to MCP servers and tool calls
 */
export class MCPClient {
  private servers = new Map<string, MCPServerConfig>();
  private serverRuntimes = new Map<string, ServerRuntime>();
  private serverTools = new Map<string, MCPTool[]>();

  constructor() {
    this.loadServersFromConfig();
  }

  /**
   * Load MCP server configurations from config file
   */
  private loadServersFromConfig(): void {
    const configDir = getAgentDir();
    const configPath = join(configDir, "mcp.json");

    if (!existsSync(configPath)) {
      return;
    }

    try {
      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      const servers: MCPServerConfig[] = config.mcpServers || [];

      for (const server of servers) {
        if (server.enabled !== false) {
          this.servers.set(server.id, server);
        }
      }
    } catch (error) {
      mcpError(`Failed to load MCP config: ${error}`);
    }
  }

  /**
   * Get all configured servers
   */
  getServers(): MCPServerConfig[] {
    return Array.from(this.servers.values());
  }

  /**
   * Get a specific server by ID
   */
  getServer(id: string): MCPServerConfig | undefined {
    return this.servers.get(id);
  }

  /**
   * Add or update a server configuration
   */
  addServer(server: MCPServerConfig): void {
    this.servers.set(server.id, server);
  }

  /**
   * Remove a server
   */
  removeServer(id: string): void {
    this.servers.delete(id);
    this.serverTools.delete(id);
    this.stopServer(id);
  }

  private getRuntime(serverId: string): ServerRuntime | undefined {
    return this.serverRuntimes.get(serverId);
  }

  private convertNpxArgsToNpmExecArgs(args: string[]): string[] | undefined {
    // Convert: npx -y <pkg> [rest...]
    // To:      npm exec --yes <pkg> -- [rest...]
    if (args.length === 0) return undefined;
    const normalized = [...args];
    if (normalized[0] === "-y" || normalized[0] === "--yes") {
      normalized.shift();
    }
    const pkg = normalized.shift();
    if (!pkg) return undefined;
    return ["exec", "--yes", pkg, ...(normalized.length > 0 ? ["--", ...normalized] : [])];
  }

  private getSpawnAttempts(server: MCPServerConfig): SpawnSpec[] {
    const attempts: SpawnSpec[] = [];
    const cmd = server.command.trim();
    const lower = cmd.toLowerCase();

    if (process.platform === "win32" && lower === "npx") {
      attempts.push({ command: "npx.cmd", args: server.args });
      const npmExecArgs = this.convertNpxArgsToNpmExecArgs(server.args);
      if (npmExecArgs) {
        attempts.push({ command: "npm.cmd", args: npmExecArgs });
      }
      attempts.push({ command: "npx", args: server.args });
      return attempts;
    }

    attempts.push({ command: cmd, args: server.args });

    if (lower === "npx") {
      const npmExecArgs = this.convertNpxArgsToNpmExecArgs(server.args);
      if (npmExecArgs) {
        attempts.push({
          command: process.platform === "win32" ? "npm.cmd" : "npm",
          args: npmExecArgs,
        });
      }
    }

    return attempts;
  }

  private async spawnProcess(
    spec: SpawnSpec,
    env: NodeJS.ProcessEnv,
    cwd?: string,
  ): Promise<ChildProcessWithoutNullStreams> {
    return await new Promise((resolve, reject) => {
      const child = spawn(spec.command, spec.args, {
        env,
        cwd,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        shell: process.platform === "win32",
      });

      const onError = (err: Error) => {
        child.removeListener("spawn", onSpawn);
        reject(err);
      };
      const onSpawn = () => {
        child.removeListener("error", onError);
        resolve(child);
      };

      child.once("error", onError);
      child.once("spawn", onSpawn);
    });
  }

  private attachStdoutParser(serverId: string, runtime: ServerRuntime): void {
    runtime.process.stdout.on("data", (chunk: Buffer) => {
      runtime.buffer = Buffer.concat([runtime.buffer, chunk]);
      this.processStdoutBuffer(serverId, runtime);
    });

    runtime.process.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8").trim();
      if (text.length > 0) {
        // Only show stderr errors in debug mode
        if (isDebugMode) {
          mcpError(`[MCP:${serverId}] ${text}`);
        }
      }
    });

    runtime.process.on("exit", (code, signal) => {
      const message = `[MCP:debug] Server exited: code=${code ?? "null"}, signal=${signal ?? "null"}`;
      mcpLog(message);
      for (const pending of runtime.pendingRequests.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error(message));
      }
      runtime.pendingRequests.clear();
      this.serverRuntimes.delete(serverId);
    });

    runtime.process.on("error", (err) => {
      const message = `MCP server ${serverId} process error: ${err instanceof Error ? err.message : String(err)}`;
      for (const pending of runtime.pendingRequests.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error(message));
      }
      runtime.pendingRequests.clear();
      this.serverRuntimes.delete(serverId);
    });
  }

  private processStdoutBuffer(serverId: string, runtime: ServerRuntime): void {
    // MCP SDK uses line-delimited JSON protocol (not Content-Length framing)
    // Format: {json}\n
    while (runtime.buffer.length > 0) {
      const lineEnd = runtime.buffer.indexOf("\n");
      if (lineEnd === -1) {
        // No complete line yet, wait for more data
        return;
      }
      const line = runtime.buffer.slice(0, lineEnd).toString("utf8").replace(/\r$/, "");
      runtime.buffer = runtime.buffer.slice(lineEnd + 1);
      if (line.length > 0) {
        mcpLog(`[MCP:${serverId}] Received: ${line.slice(0, 200)}`);
        this.handleJsonRpcMessage(serverId, line);
      }
    }
  }

  private handleJsonRpcMessage(serverId: string, raw: string): void {
    let msg: JsonRpcMessage;
    try {
      msg = JSON.parse(raw) as JsonRpcMessage;
    } catch {
      return;
    }

    if (msg.id === undefined) {
      // Notification/unsolicited message
      return;
    }

    const id = typeof msg.id === "number" ? msg.id : Number(msg.id);
    if (!Number.isFinite(id)) {
      return;
    }

    const runtime = this.serverRuntimes.get(serverId);
    if (!runtime) return;

    const pending = runtime.pendingRequests.get(id);
    if (!pending) return;

    clearTimeout(pending.timer);
    runtime.pendingRequests.delete(id);

    if (msg.error) {
      pending.reject(
        new Error(
          msg.error.message || `JSON-RPC error ${msg.error.code ?? "unknown"}`,
        ),
      );
      return;
    }

    pending.resolve(msg.result);
  }

  private writeFramedMessage(
    runtime: ServerRuntime,
    message: Record<string, unknown>,
  ): void {
    // MCP SDK uses line-delimited JSON protocol
    const body = JSON.stringify(message);
    const framed = body + "\n";
    runtime.process.stdin.write(framed);
  }

  private sendNotification(
    serverId: string,
    method: string,
    params?: Record<string, unknown>,
  ): void {
    const runtime = this.getRuntime(serverId);
    if (!runtime) return;
    this.writeFramedMessage(runtime, {
      jsonrpc: "2.0",
      method,
      params: params ?? {},
    });
  }

  private async sendRequest<T = unknown>(
    serverId: string,
    method: string,
    params?: Record<string, unknown>,
    timeoutMs = 20_000,
  ): Promise<T> {
    const runtime = this.getRuntime(serverId);
    if (!runtime) {
      throw new Error(`Server ${serverId} is not running`);
    }

    const id = runtime.nextRequestId++;
    const payload = {
      jsonrpc: "2.0",
      id,
      method,
      params: params ?? {},
    };

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        runtime.pendingRequests.delete(id);
        reject(
          new Error(
            `MCP request timed out: ${serverId} ${method} (${timeoutMs}ms)`,
          ),
        );
      }, timeoutMs);

      runtime.pendingRequests.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      });
      this.writeFramedMessage(runtime, payload);
    });
  }

  private async initializeServer(serverId: string): Promise<void> {
    const server = this.servers.get(serverId);
    const isNpx = server?.command.toLowerCase().includes("npx");
    const isWindows = process.platform === "win32";

    // Give server a moment to initialize
    const baseDelay = isWindows && isNpx ? 1500 : 500;
    await new Promise((resolve) => setTimeout(resolve, baseDelay));

    const initTimeout = server?.initTimeout ?? 20_000;

    // Primary protocol version + fallback for older servers
    const initPayload = {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "nano-pencil", version: "1.7.0" },
    };
    const fallbackPayload = {
      protocolVersion: "2024-10-07",
      capabilities: {},
      clientInfo: { name: "nano-pencil", version: "1.7.0" },
    };

    try {
      await this.sendRequest(serverId, "initialize", initPayload, initTimeout);
    } catch {
      await this.sendRequest(serverId, "initialize", fallbackPayload, initTimeout);
    }

    this.sendNotification(serverId, "notifications/initialized");
  }

  private normalizeToolRecord(serverId: string, tool: unknown): MCPTool | null {
    if (!tool || typeof tool !== "object") return null;
    const obj = tool as Record<string, unknown>;
    const name = obj.name;
    const description = obj.description;
    if (typeof name !== "string" || typeof description !== "string") {
      return null;
    }
    const inputSchema =
      obj.inputSchema && typeof obj.inputSchema === "object"
        ? (obj.inputSchema as Record<string, unknown>)
        : { type: "object", properties: {}, additionalProperties: true };

    return {
      name: `${serverId}/${name}`,
      displayName:
        typeof obj.title === "string"
          ? obj.title
          : typeof obj.displayName === "string"
            ? obj.displayName
            : undefined,
      description,
      inputSchema,
      serverId,
    };
  }

  private async loadToolsForServer(serverId: string): Promise<MCPTool[]> {
    const tools: MCPTool[] = [];
    let cursor: string | undefined;

    while (true) {
      const result = (await this.sendRequest<Record<string, unknown>>(
        serverId,
        "tools/list",
        cursor ? { cursor } : {},
        20_000,
      )) as Record<string, unknown>;

      const pageTools = Array.isArray(result.tools) ? result.tools : [];
      for (const t of pageTools) {
        const normalized = this.normalizeToolRecord(serverId, t);
        if (normalized) tools.push(normalized);
      }

      const nextCursor =
        typeof result.nextCursor === "string"
          ? result.nextCursor
          : typeof result.cursor === "string"
            ? result.cursor
            : undefined;

      if (!nextCursor || nextCursor === cursor) break;
      cursor = nextCursor;
    }

    this.serverTools.set(serverId, tools);
    return tools;
  }

  /**
   * Start an MCP server (for stdio transport)
   */
  async startServer(serverId: string): Promise<boolean> {
    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }

    if (server.transport === "sse") {
      // SSE servers don't need to be started as separate processes
      return true;
    }

    // Check if already running
    if (this.serverRuntimes.has(serverId)) {
      return true;
    }

    const attempts = this.getSpawnAttempts(server);
    let lastError: unknown;

    for (const attempt of attempts) {
      try {
        // Default to current working directory if not specified
        const workDir = server.cwd || process.cwd();
        const serverProcess = await this.spawnProcess(attempt, {
          ...process.env,
          ...server.env,
        }, workDir);

        const runtime: ServerRuntime = {
          process: serverProcess,
          buffer: Buffer.alloc(0),
          nextRequestId: 1,
          pendingRequests: new Map(),
        };
        this.serverRuntimes.set(serverId, runtime);
        this.attachStdoutParser(serverId, runtime);

        await this.initializeServer(serverId);
        await this.loadToolsForServer(serverId);
        return true;
      } catch (error) {
        lastError = error;
        this.stopServer(serverId);
      }
    }

    console.error(
      `Failed to start MCP server ${serverId}:`,
      lastError instanceof Error ? lastError.message : lastError,
    );
    return false;
  }

  /**
   * Stop an MCP server
   */
  stopServer(serverId: string): void {
    const runtime = this.serverRuntimes.get(serverId);
    if (runtime) {
      for (const pending of runtime.pendingRequests.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`MCP server ${serverId} stopped`));
      }
      runtime.pendingRequests.clear();
      runtime.process.kill();
      this.serverRuntimes.delete(serverId);
    }
  }

  /**
   * Stop all running servers
   */
  stopAllServers(): void {
    for (const serverId of this.serverRuntimes.keys()) {
      this.stopServer(serverId);
    }
  }

  /**
   * List available tools from all servers
   */
  async listTools(serverId?: string): Promise<MCPTool[]> {
    const tools: MCPTool[] = [];

    if (serverId) {
      if (!this.serverTools.has(serverId)) {
        try {
          await this.loadToolsForServer(serverId);
        } catch {
          // keep cache miss as empty list
        }
      }
      const serverTools = this.serverTools.get(serverId) || [];
      tools.push(...serverTools);
    } else {
      for (const [id] of this.servers.entries()) {
        if (!this.serverTools.has(id)) {
          try {
            await this.loadToolsForServer(id);
          } catch {
            // skip unavailable servers
          }
        }
        tools.push(...(this.serverTools.get(id) || []));
      }
    }

    return tools;
  }

  /**
   * Call an MCP tool
   */
  async callTool(
    toolName: string,
    args: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<MCPToolResult> {
    // Parse tool name: server_id/tool_name
    const [serverId, ...nameParts] = toolName.split("/");
    const toolNameOnly = nameParts.join("/");

    const server = this.servers.get(serverId);
    if (!server) {
      return {
        content: [{ type: "text", text: `Server ${serverId} not found` }],
        error: `Server ${serverId} not found`,
      };
    }

    // Use configured timeout or provided timeout, default to 60s
    const effectiveTimeout = timeoutMs ?? server.toolTimeout ?? 20_000;

    // For SSE transport, make HTTP request (not implemented in current defaults)
    if (server.transport === "sse") {
      return this.callSSETool(server, toolNameOnly, args);
    }

    // For stdio transport, send JSON-RPC message
    return this.callStdioTool(server, toolNameOnly, args, effectiveTimeout);
  }

  /**
   * Call tool via stdio (JSON-RPC)
   */
  private async callStdioTool(
    server: MCPServerConfig,
    toolName: string,
    args: Record<string, unknown>,
    timeoutMs: number = 20_000,
  ): Promise<MCPToolResult> {
    if (!this.serverRuntimes.has(server.id)) {
      return {
        content: [{ type: "text", text: `Server ${server.id} is not running` }],
        error: `Server ${server.id} is not running`,
      };
    }

    try {
      const result = (await this.sendRequest<Record<string, unknown>>(
        server.id,
        "tools/call",
        { name: toolName, arguments: args },
        timeoutMs,
      )) as Record<string, unknown>;

      const isError = result.isError === true;
      const content = Array.isArray(result.content)
        ? (result.content as Array<Record<string, unknown>>).map((item) => {
            const type =
              item.type === "image" || item.type === "resource"
                ? item.type
                : "text";
            return {
              type: type as "text" | "image" | "resource",
              text:
                typeof item.text === "string"
                  ? item.text
                  : typeof item.message === "string"
                    ? item.message
                    : undefined,
              data: item,
            };
          })
        : [{ type: "text" as const, text: JSON.stringify(result) }];

      return {
        content,
        error:
          isError
            ? content
                .map((c) => c.text)
                .filter((t): t is string => !!t)
                .join("\n") || `MCP tool ${toolName} failed`
            : undefined,
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Failed to call tool: ${error}` }],
        error: String(error),
      };
    }
  }

  /**
   * Call tool via SSE (HTTP)
   */
  private async callSSETool(
    server: MCPServerConfig,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<MCPToolResult> {
    // TODO: Implement SSE tool calls
    return {
      content: [
        {
          type: "text",
          text: `SSE transport is not implemented yet for ${server.id}/${toolName}`,
        },
      ],
      error: "SSE transport not yet supported",
    };
  }

  /**
   * Check if a tool exists
   */
  hasTool(toolName: string): boolean {
    const [serverId] = toolName.split("/");
    return this.servers.has(serverId);
  }
}
