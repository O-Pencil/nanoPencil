# SK01: Root Barrel Mixes SDK And Implementation Surfaces

```yaml
id: SK01
status: reviewed
severity: high
classification: public-api-surface
scope:
  - index.ts
  - package.json exports
```

## Problem

`index.ts` currently exports a broad set of symbols that serve different audiences:

- host embedding code
- extension authors
- internal runtime/platform users
- UI/mode consumers
- CLI/runtime implementation

This makes every root export look equally stable even when many are implementation details.

## Current Export Groups

| Group | Examples | P8 Judgment |
|-------|----------|-------------|
| host SDK | `createAgentSession`, `PencilAgent`, `quickAgent`, SDK logger/options | keep root candidate |
| model/session config | `ModelRegistry`, `AuthStorage`, `SettingsManager`, `SessionManager` | review per consumer; likely explicit subpaths |
| extension host protocol | `ExtensionAPI`, `ExtensionContext`, `ToolDefinition`, hook events | move/stabilize in `@pencil-agent/extension-sdk` |
| tool factories | `createBashTool`, `createCodingTools`, `bashTool`, read/edit/write factories | root candidate only if SDK embedding needs them |
| compaction/session internals | compaction helpers, session entry migration helpers | subpath candidate, not root default |
| modes | `InteractiveMode`, `runPrintMode`, `runRpcMode` | deprecate root; use mode subpaths if kept public |
| interactive UI components | message components, selectors, theme helpers | not root SDK; use UI subpaths or keep internal |
| CLI/internal utilities | `main`, shell, clipboard, frontmatter | remove from root or subpath only with explicit contract |

## Deletion Test

If `index.ts` only exported the host embedding SDK, normal CLI/runtime behavior would not disappear. What would break is broad external import compatibility.

Therefore the barrel is not load-bearing for runtime execution; it is load-bearing for public compatibility.

## Recommendation

Do not implement immediately in the sign-off branch.

When P8 is reopened, first produce an export matrix:

```text
keep root
move to extension-sdk
move to explicit subpath
deprecate/remove
```

No symbol should stay in root merely because it is convenient.

## Acceptance If Implemented

- root API is intentionally small and documented.
- public symbol diff is accepted as P8 breaking/deprecation work.
- no internal module imports the root barrel.
- external consumer migration guide exists.
