# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**nanoPencil** (formerly nano-pencil) is a terminal-based AI coding agent. It provides an interactive TUI for conversational coding with AI models (Anthropic, OpenAI, Gemini, Alibaba DashScope, Ollama, etc.). The agent can read, write, edit files, execute bash commands, and manage session state.

The project is built with TypeScript and depends on several `@pencil-agent/*` packages:
- `@pencil-agent/agent-core` - Core Agent logic
- `@pencil-agent/ai` - Model APIs and types
- `@pencil-agent/tui` - Terminal UI components

## Build and Run Commands

```bash
# Install dependencies
npm install

# Bundle local packages (mem-core, soul-core)
node scripts/bundle-deps.js

# Build the project
npm run build

# Run directly with tsx (development)
npx tsx cli.ts [args...]

# Run in production mode
node dist/cli.js [args...]

# Run with package manager scripts
npm start -- [args...]
```

## Architecture Overview

### Entry Points

1. **cli.ts** - CLI entry point, sets `process.title = "nanopencil"` and calls `main()`
2. **main.ts** - Main CLI handler that:
   - Parses arguments with extension flag discovery
   - Loads resources (extensions, skills, prompts, themes)
   - Creates ModelRegistry and AuthStorage
   - Creates AgentSession via SDK
   - Delegates to appropriate mode (interactive/print/rpc)

### Core Abstractions

**AgentSession** (`core/runtime/agent-session.ts`) - Central session lifecycle manager shared across all modes:
- Wraps the core `Agent` from `@pencil-agent/agent-core`
- Manages session persistence via `SessionManager`
- Handles model switching, thinking level changes
- Manages tool execution and bash commands
- Coordinates compaction (context window management)
- Emits events for extensions to hook into

**SDK** (`core/runtime/sdk.ts`) - Programmatic usage factory:
- Takes `CreateAgentSessionOptions` for full customization
- Creates/uses AuthStorage, ModelRegistry, SettingsManager, SessionManager
- Loads resources via ResourceLoader (extensions, skills, themes)
- Returns AgentSession + extension loading results

### Three Run Modes

1. **InteractiveMode** (`modes/interactive/interactive-mode.ts`) - TUI interface using `@pencil-agent/tui`
2. **runPrintMode()** (`modes/print/print-mode.ts`) - stdout/stdin streaming for scripting
3. **runRpcMode()** (`modes/rpc/rpc-mode.ts`) - JSON-RPC over stdin for IDE integration

All modes use the same AgentSession core, just different I/O layers.

### Key Subsystems

**Extension System** (`core/extensions/`):
- `loader.ts` - Discovers extensions from npm packages, local paths
- `runner.ts` - Manages extension lifecycle, event emission, tool wrapping
- `wrapper.ts` - Wraps user tools with extension before/after hooks
- `types.ts` - All extension-related TypeScript types

Extensions can:
- Register custom tools, slash commands, keybindings
- Hook into agent events (before_agent_start, tool_call, context, etc.)
- Add UI components (dialogs, selectors, widgets)
- Modify prompts and context

**Built-in Extensions** (`extensions/defaults/`):
- `interview/index.ts` - Interview extension for requirement clarification
- `loop/index.ts` - `/loop` timed prompt tasks (session-scoped scheduler)
- `link-world/index.ts` - Internet access extension (agent-reach)
- `mcp/index.ts` - MCP (Model Context Protocol) integration
- `security-audit/index.ts` - Security audit extension
- `soul/index.ts` - AI personality evolution extension

**Tools** (`core/tools/`):
- `bash.ts` - Shell command execution
- `read.ts` - File reading with truncation options
- `edit.ts` - File editing (line-based replacements)
- `write.ts` - File writing (overwrite or create)
- `grep.ts` - Content search via ripgrep
- `find.ts` - File pattern matching
- `ls.ts` - Directory listing
- `source.ts` - Source code analysis
- `truncate.ts` - Output truncation helpers

**MCP Integration** (`core/mcp/`):
- `mcp-client.ts` - MCP protocol client implementation
- `mcp-config.ts` - MCP server configuration management
- `mcp-adapter.ts` - MCP tools adapter
- `mcp-guidance.ts` - MCP usage guidance

**Session Management** (`core/session/session-manager.ts`):
- Persists conversation history to `.pi/session/*.jsonl`
- Handles session forking, branching, switching
- Session migration between versions

**Compaction** (`core/session/compaction/`):
- `compaction.ts` - Main compaction logic for context window management
- `branch-summarization.ts` - Branch summary generation for forked sessions
- `compaction-coordinator.ts` - Coordinates compaction operations
- `utils.ts` - Token estimation helpers

**Model Registry** (`core/model-registry.ts`):
- Manages model definitions from `~/.nanopencil/agent/models.json`
- Handles API key resolution via AuthStorage
- Supports custom provider registration

**Settings Manager** (`core/config/settings-manager.ts`):
- Two-tier settings: global (`~/.nanopencil/agent/settings.json`) + project-local (`.pi/settings.json`)
- Project settings override global settings

**Resource Loader** (`core/config/resource-loader.ts`):
- Discovers and loads extensions, skills, prompt templates, themes, context files
- Merges global, project-local, and runtime-specified paths

### Configuration Paths

- **Config dir**: `~/.nanopencil/agent/` (or via `NANOPENCIL_CODING_AGENT_DIR` env)
- **models.json**: Model definitions and provider configs
- **auth.json**: API keys and OAuth credentials
- **settings.json**: User preferences
- **sessions/**: Conversation history
- **extensions/**: User-installed extensions
- **skills/**: User-defined skills
- **themes/**: Custom themes

### Local Packages

The project includes bundled packages in `packages/`:
- **agent-core** (`packages/agent-core/`) - Core Agent logic
- **ai** (`packages/ai/`) - Model APIs and types (includes generated models)
- **tui** (`packages/tui/`) - Terminal UI components
- **mem-core** (`packages/mem-core/`) - Persistent memory system
- **soul-core** (`packages/soul-core/`) - AI personality evolution engine

### Default Extensions

Built-in extensions are automatically loaded unless disabled:
- **interview** - Requirement clarification through guided Q&A
- **loop** - `/loop` session-scoped scheduled prompts (timed follow-up)
- **link-world** - Internet access via agent-reach (Twitter, YouTube, Bilibili, etc.)
- **mcp** - MCP protocol support (requires `enable-mcp` flag)
- **security-audit** - Security vulnerability detection
- **soul** - AI personality evolution and memory

### UI Components

Interactive mode components (`modes/interactive/components/`):
- Reusable UI widgets built on `@pencil-agent/tui`
- Message renderers for assistant, user, bash, tools
- Selectors for models, sessions, settings
- Dialogs for login, OAuth, configuration

### Slash Commands

Built-in commands (`core/slash-commands.ts`):
- `/model` - Select model
- `/thinking` - Set thinking level
- `/clear` - Clear conversation
- `/fork` - Fork session
- `/switch` - Switch session
- `/tree` - Show session tree
- `/compact` - Manual compaction
- `/export` - Export to HTML
- `/share` - Share session
- `/login` - Configure API keys
- `/settings` - Open settings
- `/link-world` - Install internet access extension

## Important Implementation Notes

### Tool Implementation
When implementing tools:
- Use the Read tool instead of `cat` bash command
- Use the Edit tool for file modifications (not sed/awk)
- Use the Bash tool for terminal operations
- Never use `git add -A` - only add specific files you modified

### Extension Development
Extensions receive `ExtensionContext` with:
- `cwd` - Working directory
- `agentDir` - Global config directory
- `sessionManager` - Session persistence
- `settingsManager` - User settings
- `modelRegistry` - Model discovery
- Custom tools, slash commands, keybindings can be registered

### Session Persistence
Sessions are stored as JSONL (newline-delimited JSON) with entry types:
- `file` - File reads/writes
- `custom` - Custom messages
- `model_change` - Model switches
- `thinking_level_change` - Thinking level changes
- `compaction` - Summaries

### Messages and Context
- System prompt built from `buildSystemPrompt()` (`core/prompt/system-prompt.ts`)
- Context files loaded from `.pencil-context.md`, `.PENCIL.md`, `CLAUDE.md`, `AGENTS.md`
- Skills loaded as `<skill name="..." location="...">` blocks in user messages

### Chinese Localization
The codebase includes Chinese comments and strings (nanoPencil targets Chinese users with DashScope integration).

## Commit Message Convention

使用中文撰写 commit message，格式如下：

```
<类型>(<可选范围>): <简短描述>

<可选正文>
```

### 类型 (type)

- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档更新
- `refactor`: 代码重构
- `perf`: 性能优化
- `chore`: 构建/工具/依赖等
- `style`: 代码格式（不影响功能）

### 示例

```
feat(interview): 降低 Interview 触发频率

- 添加 shouldRunInterview 智能检测逻辑
- 只在模糊需求或短文本时触发
- 添加 persona 切换后跳过 interview
- 添加 Interview 过程可视化

fix: 修复版本比较逻辑导致误报更新提示

不能包含任何Co-Authored-By: Claude Opus 4.6 noreply@anthropic.com
```

### 注意事项

- **禁止包含 Co-Authored-By**: 不要在 commit message 中添加任何 `Co-Authored-By:` 信息
- 使用中文描述，简洁明了

---

## Release Process

### 发布流程

项目使用手动触发发布流程：

```bash
# 1. 确保所有更改已提交并推送
git status
git push

# 2. 运行发布命令（自动生成 changelog + 升级版本号 + 发布 npm）
npm run release

# 或手动指定版本类型
npm version patch    # 1.11.2 -> 1.11.3
npm version minor   # 1.11.2 -> 1.12.0
npm version major   # 1.11.2 -> 2.0.0
```

### Changelog 生成

- 使用 `scripts/generate-changelog.js` 自动生成
- 基于 git commit 历史，按类型分类
- 格式参考 [Keep a Changelog](https://keepachangelog.com/)
- 每次发布自动在 CHANGELOG.md 顶部插入新版本记录

### 版本号规范

遵循 Semantic Versioning：
- `patch`: bug 修复
- `minor`: 新功能（向后兼容）
- `major`: 破坏性变更

### 发布检查清单

- [ ] 所有功能已完成并测试
- [ ] CHANGELOG.md 已更新
- [ ] 版本号已升级
- [ ] 代码已推送到远程仓库
- [ ] npm publish 成功
