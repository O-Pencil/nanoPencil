# AS09: reload() is a runtime-rebuild problem, not a thin controller

```yaml
finding_id: AS09
severity: structural
lenses: [DIP, lifecycle, leverage]
files_primary:
  - core/runtime/agent-session.ts
files_secondary:
  - core/runtime/tool-runtime-controller.ts
  - core/platform/config/settings-manager.ts
  - core/platform/config/resource-loader.ts
status: deferred
```

## Problem

`reload()` (~48 lines) sequences a full runtime refresh after a config/persona change:

1. `session_shutdown` extension hook + capture flag values
2. `settingsManager.reload()` + `resetApiProviders()` + `resourceLoader.reload()`
3. MCP tool refresh via `_mcpToolsFactory` (with error fallback that keeps `mcp_`-prefixed tools)
4. Soul manager refresh via `_soulManagerFactory` (with keep-on-failure)
5. `_buildRuntime({ includeAllExtensionTools: true })`
6. `session_start` hook + `extendResourcesFromExtensions("reload")`

It looks like a candidate for a `ReloadController`, but it heavily **mutates session state** (`_customTools`, `_staticCustomTools`, `_soulManager`, `_lastSoulInjection`) and mostly **sequences existing collaborators** (settings/resource reload, `_buildRuntime`, extension runner). The only genuinely independent logic is the MCP-fallback heuristic and the Soul keep-on-failure.

## Deletion Test

> If a `ReloadController` were deleted, would behavior return to `AgentSession` cleanly?

**Result**: yes — it returns as orchestration. A thin reload controller would need ~12 capabilities (settings reload, resource reload, MCP factory, Soul factory, runtime rebuild, extension hooks, several field setters) and would still be mostly coordination. That is a line-count win with no ownership win → fails RS-5 spirit.

## Verdict — DEFERRED

Do **not** extract a standalone `ReloadController` now.

If reload is ever extracted, it must be paired with the **real rebuild behavior** it coordinates: a `RuntimeRebuildController` that owns `_buildRuntime` + the MCP/Soul refresh policy, so it owns real behavior rather than just a call sequence. Only then does it satisfy RS-5.

Priority: **below AS10**. Revisit if the MCP/Soul refresh logic grows or if `_buildRuntime` itself needs its own owner.

## Decision Criteria (if later selected)

- the controller owns `_buildRuntime` (real rebuild), not just the reload call order
- MCP and Soul refresh policy (error fallbacks) move with it as owned behavior
- session field mutations are exposed as named capabilities, not by handing over `AgentSession`
- `reload()` stays callable through the same `AgentSession` method
- `session_shutdown` → reload → `session_start` ordering is unchanged

## References

- Gate: `../gates.md` RS-2, RS-5
- Lifecycle review: `./AS08-session-lifecycle-boundary.md`
