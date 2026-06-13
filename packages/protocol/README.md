# catui-protocol

Stable protocol contracts for Catui extensions — the single, versioned surface a
third-party extension (or the bundled `mem-core` / `soul-core` packages) depends on,
instead of reaching into the host package `catui-agent`.

## Installation

```bash
npm install catui-protocol
```

## Quick Start

```typescript
import type { ExtensionAPI, ExtensionContext, ToolContract } from 'catui-protocol';

// Define a tool using the stable protocol contract
const myTool: ToolContract = {
  name: 'my-tool',
  description: 'A custom tool',
  parameters: /* TypeBox schema */,
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    return {
      content: [{ type: 'text', text: 'Result' }],
    };
  },
};

// Export your extension factory
export default function myExtension(api: ExtensionAPI) {
  api.registerTool(myTool);
  
  api.on('session_start', async (event, ctx) => {
    ctx.ui.notify('Extension loaded!');
  });
}
```

## Protocol Modules

| Module | Import | Contract | Status |
|--------|--------|----------|--------|
| `tools` | `catui-protocol` | Tool runtime/permission seam + `ToolContract`, `ToolResult` | ✅ |
| `lifecycle` | `catui-protocol` | `ExtensionAPI`, `ExtensionContext`, `ExtensionFactory`, `SessionManagerContract` | ✅ |
| `commands` | `catui-protocol` | Slash-command registration + argument-completion | ✅ |
| `hooks` | `catui-protocol` | Lifecycle hook event-name vocabulary | ✅ |
| `flags` | `catui-protocol` | Extension-declared CLI/config flag contracts | ✅ |

## Key Types

### ExtensionAPI

The registration surface a host passes to an extension factory:

```typescript
interface ExtensionAPI {
  on(event: HookEventName, handler: HookHandler<ExtensionContext>): void;
  registerCommand(name: string, command: ExtensionCommand<ExtensionContext>): void;
  registerFlag(name: string, options: ExtensionFlagOptions): void;
  getFlag(name: string): ExtensionFlagValue | undefined;
  registerTool<TParams extends TSchema, TDetails>(tool: ToolContract<TParams, TDetails>): void;
}
```

### ExtensionContext

Runtime context handed to extension hooks, commands, and tools:

```typescript
interface ExtensionContext {
  cwd: string;
  hasUI: boolean;
  sessionManager: SessionManagerContract;
  ui: ExtensionUi;
}
```

### ToolContract

The stable tool contract for registering model-facing tools:

```typescript
interface ToolContract<TParams extends TSchema, TDetails> {
  name: string;
  label?: string;
  description: string;
  parameters: TParams;
  execute(toolCallId: string, params: Static<TParams>, signal?: AbortSignal, 
          onUpdate?: ToolUpdateCallback<TDetails>, ctx?: ExtensionContext): Promise<ToolResult<TDetails>>;
}
```

### HookEventName

Available lifecycle hook events:

```typescript
type HookEventName = 
  | 'session_start' | 'session_ready' | 'session_shutdown'
  | 'before_agent_start' | 'agent_start' | 'agent_end'
  | 'turn_start' | 'turn_end'
  | 'tool_call' | 'tool_result'
  | 'context' | 'input'
  // ... and more
```

## Design Principles

- **Increment, don't break**: Protocol additions never force a host major bump
- **Minimal surface**: Only contracts that cross publish boundaries belong here
- **Host-agnostic**: Extensions compiled against protocol work with any compliant host

## Relationship to Host Package

| What | Where |
|------|-------|
| Protocol contracts (this package) | `catui-protocol` |
| Host embedding SDK | `catui-agent` |
| Advanced internals | `catui-agent/{tools,runtime,session,...}` |
| Host-only rich types | `catui-agent` (not public API) |

## Explicitly NOT Here

The following are reserved for future evolution and do not belong in the protocol:

- `agent-profile` — agent personality configuration
- `host-adapter` — ACP re-export
- `tool-runtime` — MCP re-export
- `a2a-bridge` — agent-to-agent communication
- Memory/soul providers — domain-specific extensions

See `.dev-docs/architecture-review/evolution/PARP.md` for the evolution roadmap.

## License

GPL-3.0
