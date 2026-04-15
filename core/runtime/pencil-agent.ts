/**
 * [WHO]: PencilAgent - Simplified SDK wrapper for better DX
 * [FROM]: Depends on sdk.ts, agent-session.ts, tools/index.ts
 * [TO]: Consumed by index.ts, external SDK users
 * [HERE]: High-level wrapper class with simplified API
 */

import { 
  createAgentSession, 
  type CreateAgentSessionOptions, 
  type CreateAgentSessionResult,
  type SDKLogger,
  silentLogger,
  defaultLogger,
} from "./sdk.js";
import { 
  AgentSession, 
  type AgentSessionEvent,
} from "./agent-session.js";
import { 
  type Tool, 
  type ToolName, 
  allTools,
} from "../tools/index.js";
import { AuthStorage } from "../config/auth-storage.js";
import { SessionManager } from "../session/session-manager.js";
import { ModelRegistry } from "../model-registry.js";
import type { ThinkingLevel } from "@pencil-agent/agent-core";

// ============================================================================
// PencilAgent Options
// ============================================================================

/**
 * Simplified options for PencilAgent wrapper.
 */
export interface PencilAgentOptions {
  /** API key for the provider. If omitted, uses environment variable. */
  apiKey?: string;
  
  /** Provider name: 'anthropic', 'openai', 'google', etc. */
  provider?: string;
  
  /** Model ID: 'claude-4-5-20250920', 'gpt-4o', etc. */
  model?: string;
  
  /** Thinking level: 'off' | 'low' | 'medium' | 'high' */
  thinkingLevel?: ThinkingLevel;
  
  /** Working directory. Default: process.cwd() */
  cwd?: string;
  
  /** Initial tool names: ['read', 'bash', 'edit', 'write'] */
  tools?: string[];
  
  /** Enable MCP tools */
  enableMCP?: boolean;
  
  /** Enable Soul personality */
  enableSoul?: boolean;
  
  /** Suppress all console output */
  silent?: boolean;
  
  /** Custom logger */
  logger?: SDKLogger;
  
  /** In-memory session (no persistence) */
  inMemory?: boolean;
  
  /** Abort signal for external control */
  signal?: AbortSignal;
}

// ============================================================================
// PencilAgent Class
// ============================================================================

/**
 * Simplified wrapper for NanoPencil SDK.
 * 
 * @example
 * ```typescript
 * // Minimal usage
 * const agent = new PencilAgent();
 * await agent.init();
 * const result = await agent.run('Hello');
 * 
 * // With explicit config
 * const agent = new PencilAgent({
 *   apiKey: 'sk-xxx',
 *   silent: true,
 * });
 * await agent.init();
 * ```
 */
export class PencilAgent {
  private session: AgentSession | null = null;
  private sessionResult: CreateAgentSessionResult | null = null;
  private logger: SDKLogger;
  private options: PencilAgentOptions;
  private cwd: string;
  private initialized = false;
  private collectedText = '';
  private eventListeners: Array<(event: AgentSessionEvent) => void> = [];
  
  constructor(options: PencilAgentOptions = {}) {
    this.cwd = options.cwd ?? process.cwd();
    this.options = options;
    this.logger = options.silent ? silentLogger : (options.logger ?? defaultLogger);
  }
  
  /**
   * Initialize the agent session.
   * Must be called before run/chat.
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    
    // Use in-memory auth storage for SDK
    const authStorage = this.options.inMemory 
      ? AuthStorage.inMemory() 
      : AuthStorage.create();
    const modelRegistry = new ModelRegistry(authStorage);
    
    // Set API key if provided
    if (this.options.apiKey && this.options.provider) {
      await authStorage.set(this.options.provider, {
        type: 'api_key',
        key: this.options.apiKey,
      });
    }
    
    // Resolve tools
    let tools: Tool[] | undefined = undefined;
    if (this.options.tools && this.options.tools.length > 0) {
      tools = this.options.tools
        .map(name => allTools[name as ToolName])
        .filter((t): t is Tool => t !== undefined);
    }
    
    // Create session
    this.sessionResult = await createAgentSession({
      cwd: this.cwd,
      thinkingLevel: this.options.thinkingLevel,
      tools,
      authStorage,
      modelRegistry,
      sessionManager: this.options.inMemory 
        ? SessionManager.inMemory() 
        : SessionManager.create(this.cwd),
      enableMCP: this.options.enableMCP ?? false,
      enableSoul: this.options.enableSoul ?? false,
      silent: this.options.silent,
      logger: this.logger,
      signal: this.options.signal,
    });
    
    this.session = this.sessionResult.session;
    
    if (this.sessionResult.modelFallbackMessage) {
      this.logger.warn(this.sessionResult.modelFallbackMessage);
    }
    
    // Subscribe to session events
    this.session.subscribe(this.handleEvent.bind(this));
    
    this.initialized = true;
  }
  
  /**
   * Handle session events - collects text for run()
   */
  private handleEvent(event: AgentSessionEvent): void {
    // Forward to user listeners
    for (const listener of this.eventListeners) {
      listener(event);
    }
    
    // Collect assistant text from message events
    if (event.type === 'message_end' && event.message?.role === 'assistant') {
      const content = event.message.content;
      if (typeof content === 'string') {
        this.collectedText += content;
      } else if (Array.isArray(content)) {
        // Extract text from content blocks
        for (const block of content) {
          if (block.type === 'text') {
            this.collectedText += block.text;
          }
        }
      }
    }
  }
  
  /**
   * Ensure session is initialized.
   */
  private ensureInit(): void {
    if (!this.initialized || !this.session) {
      throw new Error('PencilAgent not initialized. Call init() first.');
    }
  }
  
  // ============================================================================
  // Chat Methods
  // ============================================================================
  
  /**
   * Run a complete task - returns final result.
   * Blocks until agent finishes all tool calls.
   * 
   * @example
   * ```typescript
   * await agent.init();
   * const result = await agent.run('Read README.md and summarize');
   * ```
   */
  async run(message: string): Promise<string> {
    this.ensureInit();
    
    this.collectedText = '';
    await this.session!.prompt(message);
    return this.collectedText;
  }
  
  /**
   * Send a prompt and collect events.
   * 
   * @example
   * ```typescript
   * await agent.init();
   * agent.subscribe((event) => {
   *   if (event.type === 'tool_call') {
   *     console.log('Tool:', event.name);
   *   }
   * });
   * await agent.prompt('Hello');
   * ```
   */
  async prompt(message: string): Promise<void> {
    this.ensureInit();
    await this.session!.prompt(message);
  }
  
  // ============================================================================
  // Session Management
  // ============================================================================
  
  /**
   * Reset the session (clear history).
   */
  reset(): void {
    this.ensureInit();
    this.collectedText = '';
    this.logger.info('Session reset requested');
  }
  
  /**
   * Shutdown the session.
   */
  async shutdown(): Promise<void> {
    if (this.session) {
      this.logger.info('Session shutdown');
      this.initialized = false;
      this.session = null;
      this.sessionResult = null;
    }
  }
  
  // ============================================================================
  // Event Subscription
  // ============================================================================
  
  /**
   * Subscribe to agent events.
   * 
   * @example
   * ```typescript
   * await agent.init();
   * agent.subscribe((event) => {
   *   if (event.type === 'sdk:error') {
   *     console.error('SDK error:', event.error);
   *   }
   * });
   * ```
   */
  subscribe(listener: (event: AgentSessionEvent) => void): void {
    this.eventListeners.push(listener);
  }
  
  /**
   * Remove event subscription.
   */
  unsubscribe(listener: (event: AgentSessionEvent) => void): void {
    const index = this.eventListeners.indexOf(listener);
    if (index >= 0) {
      this.eventListeners.splice(index, 1);
    }
  }
  
  // ============================================================================
  // Stats
  // ============================================================================
  
  /**
   * Check if agent is initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }
  
  /**
   * Get last collected text.
   */
  getLastText(): string {
    return this.collectedText;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Quick factory for PencilAgent with auto-init.
 * 
 * @example
 * ```typescript
 * const agent = await quickAgent({ apiKey: 'sk-xxx' });
 * ```
 */
export async function quickAgent(options: PencilAgentOptions = {}): Promise<PencilAgent> {
  const agent = new PencilAgent(options);
  await agent.init();
  return agent;
}