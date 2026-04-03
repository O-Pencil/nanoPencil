# CLAUDE.md

> P1 | Root Project Charter & Navigation Map

---

## Identity

**nanoPencil** is a terminal-native AI coding agent with persistent memory and evolving AI personality. Built with TypeScript, it provides an interactive TUI for conversational coding with multi-model support (Anthropic, OpenAI, Gemini, Alibaba DashScope, Ollama).

**Core Pillars:**
- Terminal First — No Electron, no browser, pure terminal
- Privacy First — Local storage, no telemetry
- Extensible — Plugin system for tools, themes, and behaviors
- Fast — Sub-second startup, instant response

---

## Architecture Topology

```
┌─────────────────────────────────────────────────────────────┐
│                    ENTRY POINTS                            │
│  cli.ts → main.ts → Mode Selection (interactive/print/rpc) │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    CORE LAYER                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ AgentSession│  │ ModelRegistry│  │ SessionManager      │ │
│  │ - Runtime   │  │ - Providers │  │ - Persistence       │ │
│  │ - Tools     │  │ - Auth      │  │ - Branching         │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ Extensions  │  │ MCP Manager │  │ SettingsManager    │ │
│  │ - Loader    │  │ - Client    │  │ - Global + Local   │ │
│  │ - Runner    │  │ - Config    │  │                    │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 TOOL LAYER                                 │
│  bash │ read │ edit │ write │ grep │ find │ ls │ source │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 INTERFACE LAYER                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ Interactive │  │   Print     │  │      RPC            │ │
│  │ (TUI Mode)  │  │   Mode      │  │ (IDE Integration)   │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
nanoPencil/
├── CLAUDE.md              # THIS FILE - P1 navigation map
├── AGENTS.md              # Claude Code specific guidance
├── .PENCIL.md             # Product personality charter
│
├── cli.ts                 # CLI entry point
├── main.ts                # Main CLI handler
├── config.ts              # Config discovery & loading
├── index.ts               # Package exports
│
├── core/                  # Core functionality (P2: core/)
│   ├── index.ts           # Core barrel exports
│   ├── runtime/            # Agent runtime & SDK
│   │   ├── agent-session.ts   # Central session manager
│   │   ├── sdk.ts             # Programmatic API factory
│   │   └── event-bus.ts       # Event emission system
│   ├── extensions/         # Extension system
│   │   ├── loader.ts       # Extension discovery
│   │   ├── runner.ts       # Lifecycle management
│   │   ├── wrapper.ts      # Tool wrapping
│   │   └── types.ts        # Extension types
│   ├── tools/              # Built-in tools
│   │   ├── index.ts        # Tool orchestrator
│   │   ├── bash.ts         # Shell execution
│   │   ├── read.ts         # File reading
│   │   ├── edit.ts         # Line-based edit
│   │   ├── write.ts        # File writing
│   │   ├── grep.ts         # Content search
│   │   ├── find.ts         # Pattern matching
│   │   ├── ls.ts           # Directory listing
│   │   └── source.ts       # Code analysis
│   ├── mcp/                # MCP protocol integration
│   │   ├── mcp-client.ts   # MCP client
│   │   ├── mcp-config.ts   # Server config
│   │   ├── mcp-adapter.ts  # Tool adaptation
│   │   └── mcp-guidance.ts # Usage guidance
│   ├── session/            # Session management
│   │   ├── session-manager.ts    # Persistence
│   │   └── compaction/           # Context window mgmt
│   ├── model/              # Model management
│   │   ├── index.ts        # Model registry
│   │   └── switcher.ts     # Runtime switching
│   ├── config/             # Configuration
│   │   ├── settings-manager.ts   # Two-tier settings
│   │   ├── resource-loader.ts    # Resource discovery
│   │   ├── auth-storage.ts       # API key storage
│   │   └── resolve-config-value.ts
│   ├── prompt/             # Prompt engineering
│   │   ├── system-prompt.ts      # System prompt builder
│   │   └── prompt-templates.ts   # Template library
│   ├── export-html/        # HTML export
│   ├── defaults.ts         # Default config
│   ├── diagnostics.ts      # Health checks
│   ├── keybindings.ts      # Keybinding definitions
│   ├── messages.ts         # Message handling
│   ├── skills.ts           # Skill definitions
│   ├── slash-commands.ts    # Slash command registry
│   ├── persona/            # Persona management
│   └── utils/              # Utilities
│
├── modes/                  # Run modes (P2: modes/)
│   ├── index.ts            # Mode exports
│   ├── interactive/        # TUI mode (P2: modes/interactive/)
│   │   ├── interactive-mode.ts  # Main TUI controller
│   │   ├── components/           # UI widgets (42 files)
│   │   └── theme/                # Theme definitions
│   ├── print/              # Print mode (stdout/stdin)
│   ├── rpc/                # RPC mode (IDE integration)
│   ├── acp/                # ACP mode
│   └── utils/              # Shared utilities
│
├── extensions/             # Built-in extensions (P2: extensions/)
│   ├── defaults/           # Auto-loaded extensions
│   │   ├── interview/      # Requirement clarification
│   │   ├── loop/           # Timed prompt scheduler
│   │   ├── link-world/     # Internet access
│   │   ├── mcp/            # MCP integration
│   │   ├── security-audit/ # Security detection
│   │   ├── soul/           # AI personality evolution
│   │   └── team/           # Multi-agent orchestration
│   └── optional/           # Opt-in extensions
│       ├── simplify/       # Simplification extension
│       └── export-html/    # HTML export extension
│
├── packages/               # Bundled packages (P2: packages/)
│   ├── agent-core/         # Core Agent logic
│   ├── ai/                 # Model APIs & providers
│   ├── tui/                # Terminal UI components
│   ├── mem-core/           # Persistent memory system
│   └── soul-core/          # AI personality engine
│
├── utils/                  # Shared utilities
├── cli/                    # CLI helpers
├── scripts/                # Build scripts
└── docs/                   # Documentation
```

---

## Build & Run Commands

```bash
# Install dependencies
npm install

# Bundle local packages
node scripts/bundle-deps.js

# Build (TypeScript compile + resource copy)
npm run build

# Development (direct execution)
npx tsx cli.ts [args...]

# Production
node dist/cli.js [args...]

# Alternative
npm start -- [args...]
```

---

## Key Abstractions

### AgentSession (`core/runtime/agent-session.ts`)

Central session lifecycle manager shared across all modes:
- Wraps core `Agent` from `@pencil-agent/agent-core`
- Manages session persistence via SessionManager
- Handles model switching, thinking level changes
- Coordinates compaction (context window management)
- Emits events for extensions to hook into

### SDK (`core/runtime/sdk.ts`)

Programmatic usage factory for embedding nanoPencil:
```typescript
const { session } = await createAgentSession(options);
```

### Three Run Modes

| Mode | File | Use Case |
|------|------|----------|
| Interactive | `modes/interactive/interactive-mode.ts` | TUI interface |
| Print | `modes/print/print-mode.ts` | stdout/stdin streaming |
| RPC | `modes/rpc/rpc-mode.ts` | IDE integration |

### Extension System (`core/extensions/`)

Extensions receive `ExtensionContext` with:
- `cwd`, `agentDir` - Directories
- `sessionManager`, `settingsManager`, `modelRegistry` - Core services
- Tool, slash command, keybinding registration APIs

Extension lifecycle hooks:
- `session_start`, `session_shutdown`
- `before_agent_start`, `after_agent_end`
- `tool_call`, `tool_execution_start/end`
- `user_message`, `custom_message`

---

## Configuration Paths

| Path | Purpose |
|------|---------|
| `~/.nanopencil/agent/` | Global config root |
| `~/.nanopencil/agent/models.json` | Model definitions |
| `~/.nanopencil/agent/auth.json` | API keys & OAuth |
| `~/.nanopencil/agent/settings.json` | User preferences |
| `~/.nanopencil/agent/sessions/` | Conversation history |
| `~/.nanopencil/agent/extensions/` | User extensions |
| `NANOPENCIL_CODING_AGENT_DIR` | Override config root |

---

## Code Standards

### Language Policy

**Source code and user-facing strings**: English only
- TypeScript comments
- Error messages
- TUI/CLI labels
- Embedded prompts

**Documentation**: English (end-user docs may be bilingual)

**Commit messages**: English, conventional format

### Commit Convention

```
<type>(<scope>): <summary>

<optional body>
```

Types: `feat`, `fix`, `docs`, `refactor`, `perf`, `chore`, `style`

### Quality Metrics

| Metric | Limit |
|--------|-------|
| Single file lines | ~800 max |
| Single directory files | ~8 max |
| Nested directory depth | Moderate |

### Code Smells (Alert Signals)

- **Rigidity**: Small changes cause cascading modifications
- **Fragility**: Unrelated code breaks from local changes
- **Immobility**: Cannot disentangle for reuse
- **Opacity**: Intent not readable from code

---

## DIP Documentation Protocol

### Doctrine

Maintain structural isomorphism between code and documentation:
- Code changes must be traceable in docs
- Doc changes must be verifiable against code
- Either phase evolving alone = incomplete

### Three-Tier Structure

| Tier | File | Content |
|------|------|---------|
| P1 | `CLAUDE.md` | Root topology, global patterns |
| P2 | `*/CLAUDE.md` | Module maps with member lists |
| P3 | File headers | Individual file contracts |

### Workflow

```
Before work in a directory
    ↓
Read CLAUDE.md at that level → load if exists
    ↓
Read target file P3 header → understand contract
    ↓
Implement and test
    ↓
Update P2 if members change
    ↓
Update P1 if topology changes
```

### Verification Checklist

- [ ] P3 header matches import/export/responsibility
- [ ] P2 member list matches actual files
- [ ] P1 topology matches global structure
- [ ] Parent links in P2/P3 headers are valid

### Forbidden Actions

**FATAL-001**: Change code without updating docs
**FATAL-002**: Skip P3 headers for new files
**FATAL-003**: Delete file without updating P2
**FATAL-004**: New module without P2 entry

**SEVERE-001**: P3 header misaligned
**SEVERE-002**: P2 missing files or entries
**SEVERE-003**: P1 global topology stale
**SEVERE-004**: Parent links broken

---

## Important Patterns

### Tool Implementation Rules

1. Use **Read tool** instead of `cat` bash command
2. Use **Edit tool** for modifications (not sed/awk)
3. Use **Bash tool** for terminal operations
4. Never use `git add -A` — only specific files

### Extension Development

Tools, slash commands, keybindings registered via context API. See `core/extensions/types.ts` for the full API surface.

### Session Persistence

Sessions stored as JSONL with entry types:
- `file` — File reads/writes
- `custom` — Custom messages
- `model_change` — Model switches
- `thinking_level_change` — Reasoning depth
- `compaction` — Summaries

### Context Files

Loaded in order (first found wins):
1. `.pencil-context.md`
2. `.PENCIL.md`
3. `CLAUDE.md`
4. `AGENTS.md`

---

## Release Process

```bash
# 1. Ensure all changes committed
git status && git push

# 2. Run release (auto changelog + version bump + npm publish)
npm run release

# Or manually:
npm version patch    # bug fixes
npm version minor   # new features
npm version major   # breaking changes
```

Changelog auto-generated via `scripts/generate-changelog.js`.

---

## DIP Navigation

### P1 — Root

- [P1: This File](./CLAUDE.md)

### P2 — Module Maps

- [P2: core/](./core/CLAUDE.md) — Core functionality, runtime, tools
- [P2: modes/](./modes/CLAUDE.md) — Interactive, print, RPC modes
- [P2: extensions/](./extensions/CLAUDE.md) — Built-in extensions
- [P2: packages/](./packages/CLAUDE.md) — Bundled npm packages

### P3 — File Contracts

**Status**: ✅ All 250 TypeScript source files have P3 headers

Add P3 headers following this pattern:

```typescript
/**
 * [UPSTREAM]: 依赖的模块/包/文件
 * [SURFACE]: 导出的函数/组件/类型
 * [LOCUS]: 所属模块的职责坐标
 * [COVENANT]: 变更时更新本头部
 */
```

### Related Documentation

- [AGENTS.md](./AGENTS.md) — Claude Code specific guidance
- [.PENCIL.md](./.PENCIL.md) — Product personality charter
- [packages/mem-core/CLAUDE.md](./packages/mem-core/CLAUDE.md) — Memory system
- [docs/](./docs/) — Documentation directory

---

**Covenant**: Maintain map-terrain isomorphism. Keep the CLAUDE.md aligned with actual structure, or the structure will drift.
