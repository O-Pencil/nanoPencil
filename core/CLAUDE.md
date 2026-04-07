# core/ — Core Functionality Module

> P2 | Parent: ../CLAUDE.md

---

## Overview

The `core/` module contains the central business logic for nanoPencil. It orchestrates agent runtime, session management, tool execution, extension loading, and configuration.

**Key Characteristics:**
- Platform-agnostic TypeScript (Node.js 20+)
- Event-driven architecture via EventBus
- Dependency injection pattern for testability
- Extension hooks for extensibility

---

## Member List

### Entry Coordination

`index.ts`: Barrel exports for core API surface, re-exports runtime, tools, extensions

### Internationalization (`core/i18n/`)

`index.ts`: i18n core - locale management, translation function `t()`, P3: SURFACE `i18n`, `t()`, `setLocale()`, `getLocale()`, `AVAILABLE_LOCALES`

`slash-commands.ts`: English translations for slash command descriptions, P3: SURFACE `slashCommands`

`slash-commands.zh.ts`: Chinese translations for slash command descriptions

`messages.ts`: English translations for general UI messages, P3: SURFACE `messages`

`messages.zh.ts`: Chinese translations for general UI messages

`themes.ts`: English translations for theme names

`themes.zh.ts`: Chinese translations for theme names

### Runtime Layer (`core/runtime/`)

`agent-session.ts`: Central session manager — wraps Agent, manages lifecycle, coordinates compaction, emits events, P3: UPSTREAM agent-core/Agent; SURFACE createAgentSession(), AgentSession class; LOCUS runtime orchestration hub

`sdk.ts`: Programmatic API factory for embedding nanoPencil, creates all services with DI, P3: UPSTREAM all core config modules; SURFACE createAgentSession(options); LOCUS SDK entry point

`event-bus.ts`: Typed event emission system for extension hooks, P3: SURFACE EventEmitter with typed events; LOCUS cross-cutting concern

### Tools Layer (`core/tools/`)

`index.ts`: Tool registry and orchestrator, loads built-in tools and extension tools, P3: UPSTREAM bash.ts, read.ts, etc.; SURFACE ToolExecutor, tool registry

`bash.ts`: Shell command execution with timeout and streaming, P3: SURFACE BashTool, executeBash(); LOCUS system interaction boundary

`read.ts`: File reading with truncation and line range support, P3: SURFACE ReadTool; LOCUS filesystem read

`edit.ts`: Line-based file editing via diff application, P3: SURFACE EditTool; LOCUS filesystem mutation

`write.ts`: File writing (create or overwrite), P3: SURFACE WriteTool; LOCUS filesystem creation

`grep.ts`: Content search via ripgrep integration, P3: SURFACE GrepTool; LOCUS content discovery

`find.ts`: File pattern matching via glob, P3: SURFACE FindTool; LOCUS file discovery

`ls.ts`: Directory listing with metadata, P3: SURFACE LsTool; LOCUS filesystem listing

`source.ts`: Source code analysis and context extraction, P3: SURFACE SourceTool; LOCUS code intelligence

`path-utils.ts`: Path manipulation utilities, P3: SURFACE path utilities; LOCUS shared helper

`truncate.ts`: Output truncation for large results, P3: SURFACE truncate(); LOCUS response formatting

`orchestrator.ts`: Tool execution ordering and dependency resolution, P3: UPSTREAM individual tools; LOCUS tool coordination

### Extension System (`core/extensions/`)

`loader.ts`: Discovers extensions from npm packages, local paths, workspace config, P3: SURFACE ExtensionLoader; LOCUS extension discovery

`runner.ts`: Manages extension lifecycle, event emission, tool wrapping, P3: UPSTREAM loader.ts; SURFACE ExtensionRunner; LOCUS extension orchestration

`wrapper.ts`: Wraps user tools with extension before/after hooks, P3: SURFACE ToolWrapper; LOCUS tool middleware

`types.ts`: All extension-related TypeScript types and interfaces, P3: SURFACE ExtensionContext, Extension, HookEvent types; LOCUS extension API definition

`index.ts`: Barrel exports for extension system

### MCP Integration (`core/mcp/`)

`mcp-client.ts`: MCP protocol client implementation, handles JSON-RPC communication, P3: SURFACE McpClient; LOCUS MCP transport

`mcp-config.ts`: MCP server configuration management, P3: SURFACE McpConfig, loadMcpConfig(); LOCUS MCP configuration

`mcp-adapter.ts`: Adapts MCP tools to nanoPencil tool format, P3: UPSTREAM mcp-client.ts; SURFACE McpToolAdapter; LOCUS protocol bridge

`mcp-guidance.ts`: MCP usage guidance and error handling, P3: SURFACE McpGuidance; LOCUS user experience

`index.ts`: Barrel exports for MCP module

`figma-auth.ts`: Figma OAuth integration for MCP servers, P3: SURFACE FigmaAuth; LOCUS OAuth handling

### SubAgent Runtime (`core/sub-agent/`)

`sub-agent-types.ts`: Core SubAgent interfaces — SubAgentSpec, SubAgentHandle, SubAgentResult, SubAgentBackend; consumed by backend and runtime
`sub-agent-backend.ts`: InProcessSubAgentBackend — wraps createAgentSession() with AbortSignal forwarding and optional timeout; P3: UPSTREAM runtime/sdk.ts; SURFACE InProcessSubAgentBackend
`sub-agent-runtime.ts`: SubAgentRuntime class — active agent registry, spawn/abortAll/terminateAll, default global instance; P3: SURFACE SubAgentRuntime, subAgentRuntime
`index.ts`: Barrel exports for sub-agent module

### Workspace Management (`core/workspace/`)

`worktree-manager.ts`: WorktreeManager — createTempWorkspace, createGitWorktree, detectChanges, generatePatch, dispose/disposeAll; default global instance; P3: UPSTREAM node:fs, node:child_process; SURFACE WorktreeManager, worktreeManager, WorkspacePath
`index.ts`: Barrel exports for workspace module

### Session Management (`core/session/`)

`session-manager.ts`: Session persistence to JSONL, handles forking, branching, switching, P3: SURFACE SessionManager; LOCUS state persistence

### Compaction (`core/session/compaction/`)

`compaction.ts`: Main compaction logic for context window management, P3: SURFACE CompactionController; LOCUS context optimization

`branch-summarization.ts`: Branch summary generation for forked sessions, P3: UPSTREAM ai provider; LOCUS branch intelligence

`compaction-coordinator.ts`: Coordinates compaction operations, P3: UPSTREAM compaction.ts, session-manager.ts; LOCUS compaction orchestration

`utils.ts`: Token estimation and text processing helpers, P3: SURFACE tokenEstimate(); LOCUS shared utility

`index.ts`: Barrel exports for compaction module

### Model Management (`core/model/`)

`index.ts`: Model registry facade, P3: UPSTREAM model-registry.ts, model-resolver.ts; SURFACE ModelRegistry; LOCUS model abstraction

`switcher.ts`: Runtime model switching logic, P3: UPSTREAM index.ts; SURFACE ModelSwitcher; LOCUS model transitions

`model-registry.ts`: Manages model definitions, handles API key resolution, appendOpenRouterModel writes custom OpenRouter ids to models.json, P3: SURFACE ModelRegistry; LOCUS model catalog

`model-resolver.ts`: Resolves model IDs to provider configurations, P3: SURFACE resolveModel(); LOCUS model resolution

### Configuration (`core/config/`)

`settings-manager.ts`: Two-tier settings (global + project-local), merge logic, P3: SURFACE SettingsManager; LOCUS configuration aggregation

`resource-loader.ts`: Discovers and loads extensions, skills, prompts, themes, P3: SURFACE ResourceLoader; LOCUS resource discovery

`auth-storage.ts`: Secure API key storage and retrieval, P3: SURFACE AuthStorage; LOCUS credential management

`resolve-config-value.ts`: Config value resolution with precedence, P3: SURFACE resolveConfigValue(); LOCUS config utilities

### Prompt Engineering (`core/prompt/`)

`system-prompt.ts`: System prompt builder with memory injection, P3: SURFACE buildSystemPrompt(); LOCUS prompt construction

`prompt-templates.ts`: Template library for various prompt types, P3: SURFACE PromptTemplate; LOCUS template management

### Other Modules

`defaults.ts`: Default configuration values, P3: SURFACE defaultConfig; LOCUS configuration baseline

`diagnostics.ts`: Health checks and system diagnostics, P3: SURFACE runDiagnostics(); LOCUS system health

`keybindings.ts`: Keybinding definitions for TUI, P3: SURFACE KeyBinding[]; LOCUS input handling

`messages.ts`: Message handling and formatting, P3: SURFACE Message types; LOCUS communication

`skills.ts`: Skill definitions and registry, P3: SURFACE Skill types; LOCUS capability registry

`slash-commands.ts`: Built-in slash command implementations, P3: SURFACE SlashCommand[]; LOCUS command interface

`bash-executor.ts`: Shared bash execution logic, P3: UPSTREAM tools/bash.ts; LOCUS bash abstraction

`custom-providers.ts`: Custom provider registration, P3: SURFACE registerCustomProvider(); LOCUS provider extension

`footer-data-provider.ts`: Footer information for TUI, P3: SURFACE FooterData; LOCUS UI data

`mcp-manager.ts`: MCP server lifecycle management, P3: UPSTREAM mcp/; SURFACE McpManager; LOCUS MCP orchestration

`persona/`: Persona management

`export-html/`: HTML export functionality with templates

---

## Architectural Patterns

### Dependency Direction

```
runtime/agent-session.ts  ← tools/
                        ← session/
                        ← extensions/
                        ← model/
                        ← config/
```

### Event Flow

```
User Input → AgentSession → EventBus → Extensions
                            ↓
                        ToolOrchestrator → Tools
                            ↓
                        Response → User
```

### Extension Hooks

All hooks are optional. Default execution continues if hook is absent.

---

## Quality Rules

- Single file limit: ~400 lines for complex modules
- Directory file limit: ~15 files per subdirectory
- No circular dependencies between modules
- All public APIs must have JSDoc

---

**Covenant**: When modifying core/, update this P2 and verify parent P1 links.
