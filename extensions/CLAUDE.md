# extensions/ — Built-in Extensions Module

> P2 | Parent: ../CLAUDE.md

---

## Overview

The `extensions/` module contains built-in extensions that extend nanoPencil's capabilities. Extensions can register tools, slash commands, keybindings, and hook into agent lifecycle events.

**Extension Categories:**
- `defaults/`: Auto-loaded on startup (unless disabled)
- `optional/`: Opt-in via configuration or flags

---

## Member List

### Default Extensions (`extensions/defaults/`)

Auto-loaded extensions available to all users.

#### interview/ — Requirement Clarification

**P3 Contract:**
`index.ts`: UPSTREAM core/extensions/types; SURFACE Extension interface; LOCUS interview extension entry

`interview.ts` (implied): Interview flow logic, question prompting, requirement extraction

#### loop/ — Timed Prompt Scheduler

**P3 Contract:**
`index.ts`: UPSTREAM core/extensions/types; SURFACE Extension interface with timer hooks; LOCUS loop extension entry

`loop-controller.ts`: Timer management, scheduled prompt triggering

`loop-parser.ts`: Loop command parsing (`/loop every 5m ...`)

`loop-types.ts`: Loop-specific type definitions

`README.md`: Usage documentation

#### link-world/ — Internet Access

**P3 Contract:**
`index.ts`: UPSTREAM core/extensions/types; SURFACE Extension interface; LOCUS link-world entry

`linkworld.ts`: Main link-world logic

`internet-search/`: Internet search capability

#### mcp/ — MCP Protocol Integration

**P3 Contract:**
`index.ts`: UPSTREAM core/extensions/types; SURFACE Extension interface for MCP; LOCUS MCP extension entry

`mcp-management.md`: MCP configuration and usage guide

`figma-design.md`: Figma-specific MCP documentation

#### security-audit/ — Security Vulnerability Detection

**P3 Contract:**
`index.ts`: UPSTREAM core/extensions/types; SURFACE Extension interface; LOCUS security extension entry

`interface.ts`: Security audit interface definitions

`engine/`: Detection engine components
`engine/detector.ts`: Vulnerability detection logic
`engine/interceptor.ts`: Request/response interception
`engine/logger.ts`: Security event logging

`README.md`: Security audit documentation

#### soul/ — AI Personality Evolution

**P3 Contract:**
`index.ts`: UPSTREAM core/extensions/types, soul-core; SURFACE Extension interface; LOCUS soul extension entry

**Note**: Core implementation in `packages/soul-core/`

#### team/ — Multi-Agent Orchestration

**P3 Contract:**
`index.ts`: UPSTREAM core/extensions/types; SURFACE Extension interface for team; LOCUS team extension entry

`team-controller.ts`: Multi-agent coordination logic

`team-parser.ts`: Team command parsing

`team-types.ts`: Team-specific types

### Optional Extensions (`extensions/optional/`)

Extensions that must be explicitly enabled.

#### simplify/ — Simplification Extension

**P3 Contract:**
`index.ts`: UPSTREAM core/extensions/types; SURFACE Extension interface; LOCUS simplify extension entry

#### export-html/ — HTML Export Extension

**P3 Contract:**
`index.ts`: UPSTREAM core/extensions/types; SURFACE Extension interface; LOCUS export extension entry

---

## Extension Structure Pattern

```typescript
// Standard extension pattern
import type { Extension, ExtensionContext } from '../../core/extensions/types';

export default function createExtension(): Extension {
  return {
    name: 'extension-name',
    version: '1.0.0',
    
    async onLoad(context: ExtensionContext) {
      // Register tools, commands, keybindings
      context.registerTool({ ... });
      context.registerSlashCommand({ ... });
      context.registerKeybinding({ ... });
    },
    
    // Lifecycle hooks
    async onSessionStart(session) { },
    async onBeforeAgentStart(ctx) { },
    async onToolCall(tool, input) { },
    async onAfterAgentEnd(response) { },
  };
}
```

---

## Extension Lifecycle Hooks

| Hook | Timing | Purpose |
|------|--------|---------|
| `onLoad` | Extension loaded | Initialize resources |
| `onSessionStart` | New session begins | Session-specific setup |
| `onBeforeAgentStart` | Before AI call | Modify context/prompts |
| `onToolCall` | Tool invoked | Log/modify tool calls |
| `onToolExecutionStart` | Tool starts | Track execution |
| `onToolExecutionEnd` | Tool completes | Record results |
| `onAfterAgentEnd` | AI response ready | Post-process |
| `onSessionShutdown` | Session ends | Cleanup |

---

## Built-in Tools Provided by Extensions

| Extension | Tool | Description |
|-----------|------|-------------|
| mcp | `mcp_*` | MCP server tools |
| security-audit | `security_audit` | Vulnerability scanning |
| interview | `interview_*` | Requirement gathering |
| link-world | `fetch` | HTTP requests |

---

## Quality Rules

- Each extension must have `index.ts` as entry point
- Extensions should be self-contained (no cross-extension dependencies)
- All user-facing strings in English
- Provide JSDoc for public APIs

---

**Covenant**: When modifying extensions/, update this P2 and verify parent P1 links.
