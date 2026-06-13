/**
 * [WHO]: ToolInfo, ToolOrchestrator class
 * [FROM]: Depends on agent-core, extensions
 * [TO]: Consumed by core/runtime/agent-session.ts
 * [HERE]: core/tools/orchestrator.ts - runtime tool registry, lookup, and active-tool resolution
 */
import type { AgentTool } from "@catui/agent-core";
import type { ToolDefinition, ToolInfo } from "../extensions-host/index.js";

export interface ToolOrchestratorOptions {
	/** Initial custom tools from SDK options */
	customTools?: ToolDefinition[];
	/** Initial active tool names */
	initialActiveToolNames?: string[];
	/** Tool registry from extensions */
	getExtensionTools: () => Map<string, ToolDefinition>;
}

export class ToolOrchestrator {
	private _toolRegistry: Map<string, AgentTool> = new Map();
	private _activeToolNames: string[] = [];
	private _customTools: ToolDefinition[] = [];
	private _initialActiveToolNames?: string[];
	private _getExtensionTools: () => Map<string, ToolDefinition>;

	constructor(options: ToolOrchestratorOptions) {
		this._customTools = options.customTools || [];
		this._initialActiveToolNames = options.initialActiveToolNames;
		this._activeToolNames = options.initialActiveToolNames ?? [];
		this._getExtensionTools = options.getExtensionTools;
	}

	/**
	 * Get all registered tool names
	 */
	getToolNames(): string[] {
		return Array.from(this._toolRegistry.keys());
	}

	/**
	 * Get the names of currently active tools
	 */
	getActiveToolNames(): string[] {
		return [...this._activeToolNames];
	}

	/**
	 * Replace the runtime registry after tools are rebuilt.
	 */
	replaceTools(tools: Iterable<AgentTool>, activeToolNames?: string[]): void {
		this._toolRegistry = new Map(Array.from(tools, (tool) => [tool.name, tool]));
		const nextActiveToolNames = activeToolNames ?? this._activeToolNames;
		this._activeToolNames = nextActiveToolNames.filter((name) =>
			this._toolRegistry.has(name),
		);
	}

	/**
	 * Get all configured tools with name, description, and parameter schema
	 */
	getAllTools(): ToolInfo[] {
		return Array.from(this._toolRegistry.values()).map((t) => ({
			name: t.name,
			description: t.description,
			parameters: t.parameters,
		}));
	}

	/**
	 * Get tool by name
	 */
	getTool(name: string): AgentTool | undefined {
		return this._toolRegistry.get(name);
	}

	/**
	 * Check if tool exists
	 */
	hasTool(name: string): boolean {
		return this._toolRegistry.has(name);
	}

	/**
	 * Set active tools by name
	 * Returns the tools that were actually set and valid tool names
	 */
	setActiveToolsByName(toolNames: string[]): { tools: AgentTool[]; validToolNames: string[] } {
		const tools: AgentTool[] = [];
		const validToolNames: string[] = [];
		for (const name of toolNames) {
			const tool = this._toolRegistry.get(name);
			if (tool) {
				tools.push(tool);
				validToolNames.push(name);
			}
		}
		this._activeToolNames = validToolNames;
		return { tools, validToolNames };
	}

	/**
	 * Register a tool
	 */
	registerTool(name: string, tool: AgentTool): void {
		this._toolRegistry.set(name, tool);
	}

	/**
	 * Get custom tools
	 */
	getCustomTools(): ToolDefinition[] {
		return this._customTools;
	}

	/**
	 * Replace custom tools after dynamic MCP refresh.
	 */
	setCustomTools(customTools: ToolDefinition[]): void {
		this._customTools = customTools;
	}

	/**
	 * Get initial active tool names
	 */
	getInitialActiveToolNames(): string[] | undefined {
		return this._initialActiveToolNames;
	}

	/**
	 * Get extension tools map
	 */
	getExtensionTools(): Map<string, ToolDefinition> {
		return this._getExtensionTools();
	}
}
