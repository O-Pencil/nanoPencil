# modes/ — Run Modes Module

> P2 | Parent: ../CLAUDE.md

---

## Overview

The `modes/` module contains the three distinct execution modes for nanoPencil. Each mode provides a different user interface paradigm while sharing the same core AgentSession.

**Key Characteristics:**
- I/O abstraction over shared core
- Mode selection at CLI entry point
- Consistent API surface across modes
- IDE integration support via RPC

---

## Member List

### Mode Selection

`index.ts`: Mode exports and selection logic, P3: SURFACE runMode(), ModeType; LOCUS mode router

### Interactive Mode (`modes/interactive/`)

Primary TUI mode for terminal-based interaction.

**Directory Structure:**
```
interactive/
├── interactive-mode.ts    # Main TUI controller
├── components/            # UI widgets (42 files)
│   ├── index.ts           # Component barrel exports
│   ├── editor.ts          # Input editor
│   ├── assistant-message.ts # AI response display
│   ├── user-message.ts    # User input display
│   ├── bash-execution.ts  # Bash output display
│   ├── tool-execution.ts  # Tool call display
│   ├── diff.ts            # Diff visualization
│   ├── session-selector.ts # Session picker
│   ├── model-selector.ts   # Model picker
│   ├── settings-selector.ts # Settings UI
│   ├── extension-selector.ts # Extension manager
│   ├── provider-selector.ts  # Provider picker
│   ├── config-selector.ts   # Config picker
│   ├── theme-selector.ts    # Theme switcher
│   ├── thinking-selector.ts  # Reasoning level
│   ├── footer.ts              # Status bar
│   ├── countdown-timer.ts    # Loop timer display
│   ├── extension-input.ts    # Extension prompts
│   ├── extension-editor.ts   # Extension config editor
│   ├── custom-message.ts     # Custom message renderer
│   ├── custom-editor.ts      # Custom input editor
│   ├── apikey-input.ts       # API key dialog
│   ├── login-dialog.ts       # Login UI
│   ├── oauth-selector.ts     # OAuth picker
│   ├── scoped-models-selector.ts # Scoped models
│   ├── session-selector-search.ts # Fuzzy session search
│   ├── tree-selector.ts      # Session tree view
│   ├── memory-stats.ts       # Memory statistics
│   ├── soul-stats.ts         # Soul statistics
│   ├── skill-invocation-message.ts # Skill output
│   ├── branch-summary-message.ts # Branch display
│   ├── compaction-summary-message.ts # Compaction display
│   ├── keybinding-hints.ts   # Keyboard hints
│   ├── attachments-bar.ts    # File attachments
│   ├── show-images-selector.ts # Image toggle
│   ├── dynamic-border.ts     # Animated borders
│   ├── bordered-loader.ts    # Loading animation
│   ├── pencil-loader.ts      # Brand animation
│   ├── loader.ts             # Generic loader
│   ├── cancellable-loader.ts # Interruptible loader
│   ├── visual-truncate.ts    # Smart truncation
│   └── ...
└── theme/                   # Theme definitions
    ├── theme.ts             # Theme loader
    ├── theme-schema.ts      # Theme type schema
    ├── dark.json            # Dark theme
    ├── light.json           # Light theme
    └── warm.json            # Warm/amber theme
```

**P3 Contract:**
`interactive-mode.ts`: UPSTREAM tui package, agent-session; SURFACE InteractiveMode class, runInteractiveMode(); LOCUS TUI orchestration hub

### Print Mode (`modes/print/`)

Non-interactive mode for scripting and piping.

**P3 Contract:**
`print-mode.ts`: UPSTREAM agent-session; SURFACE runPrintMode(options); LOCUS batch processing mode

### RPC Mode (`modes/rpc/`)

JSON-RPC over stdin/stdout for IDE integration.

**P3 Contract:**
`rpc-mode.ts`: UPSTREAM agent-session; SURFACE runRpcMode(); LOCUS IDE bridge

**P3 Contract:**
`rpc-client.ts`: SURFACE RpcClient class; LOCUS RPC client implementation

**P3 Contract:**
`rpc-types.ts`: SURFACE RpcRequest, RpcResponse types; LOCUS RPC protocol definitions

### ACP Mode (`modes/acp/`)

Agent Communication Protocol mode.

**P3 Contract:**
`acp-mode.ts`: SURFACE AcpMode class; LOCUS ACP protocol handler

### Utilities (`modes/utils/`)

Shared utilities for all modes.

**P3 Contract:**
`clipboard.ts`: Platform-agnostic clipboard access
`clipboard-native.ts`: Platform-specific clipboard (falls back to clipboard.ts)
`image-convert.ts`: Image format conversion
`image-resize.ts`: Image resizing for display

---

## Mode Selection Logic

```typescript
// From cli.ts/main.ts
if (options.mode === 'interactive') runInteractiveMode(session);
else if (options.mode === 'print') runPrintMode(session, options);
else if (options.mode === 'rpc') runRpcMode(session);
```

---

## Architecture Patterns

### Mode Independence

Each mode:
- Receives pre-configured AgentSession
- Manages its own I/O loop
- Handles its own input parsing
- Formats its own output

### Shared State

- AgentSession is the single source of truth
- Modes do not share UI state directly
- All modes can trigger compaction

---

## Quality Rules

- Components directory: Subdivide if >20 files
- Theme files must validate against schema
- All mode entry points must handle SIGINT gracefully

---

**Covenant**: When modifying modes/, update this P2 and verify parent P1 links.
