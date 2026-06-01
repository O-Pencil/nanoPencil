# AS08: Session lifecycle controller must stay narrow

```yaml
finding_id: AS08
severity: load-bearing
lenses: [DIP, locality, lifecycle]
files_primary:
  - core/runtime/agent-session.ts
files_secondary:
  - core/session/session-manager.ts
  - core/runtime/model-controller.ts
  - core/runtime/tool-runtime-controller.ts
  - core/runtime/compaction-controller.ts
  - core/runtime/event-bridge.ts
  - core/extensions-host/
  - modes/interactive/interactive-mode.ts
  - modes/rpc/rpc-mode.ts
  - modes/acp/acp-mode.ts
  - modes/print-mode.ts
status: proposed
```

## Problem

`AgentSession` still owns several session lifecycle methods:

- `newSession()` handles extension cancellation, abort/reset, `SessionManager.newSession()`, thinking-level persistence, optional setup, agent message replacement, and `session_switch` emission.
- `switchSession()` handles extension cancellation, abort/reset, session-file switch, message replacement, model restore, thinking-level restore, and reconnect.
- `forkSession()` handles fork validation, extension cancellation, branch creation, optional conversation restore, and `session_fork` emission.
- `navigateTree()` handles branch-summary preparation, extension override, default summarization, branch mutation, agent message replacement, and `session_tree` emission.
- `reload()` handles extension shutdown/start, settings/resource reload, API provider reset, MCP tool refresh, Soul manager refresh, runtime rebuild, and extension resource discovery.
- `dispose()` and `abort()` are lifecycle-looking methods but touch subscription teardown, extension runner teardown, retry abort, agent abort, and external abort cleanup.

This makes lifecycle extraction attractive, but a broad `SessionLifecycleController` would become a second composition root. It would need `AgentSession`, `SessionManager`, model registry, resource loader, settings manager, extension runner, MCP factory, Soul factory, runtime build hooks, abort slots, and the agent instance. That is a line-count improvement with worse ownership.

## Deletion Test

> If a session lifecycle controller were deleted, would behavior return to `AgentSession` or scatter across modes/controllers?

**Result**: it should return to `AgentSession` as orchestration. If deletion forces modes, `ModelController`, `ToolRuntimeController`, or `CompactionController` to recreate session-switch, event, or reload sequencing, the controller is too broad.

## Proposed Direction

Create a lifecycle controller only after the selected slice is narrow enough to satisfy the owner rules.

The first acceptable slice is `newSession()` + `switchSession()` choreography:

- ask extensions whether switching is allowed
- disconnect and reconnect the agent subscription through injected capabilities
- abort/reset current agent work through injected capabilities
- call the selected `SessionManager` transition
- clear session-bound pending queues through an injected capability
- replace agent messages from the built session context
- emit the post-switch extension event
- request model/thinking restoration through `ModelController`

Do not include these in the first lifecycle split:

- `reload()`: it is a runtime rebuild problem mixed with settings, resources, MCP, Soul, extension resource discovery, and tool runtime refresh.
- `navigateTree()`: it is a branch-summary workflow with its own abort slot, model/API-key access, and summary mutation rules.
- `forkSession()`: it is closer to tree/session-manager branching and should follow after the switch contract is stable.
- `dispose()`: it is process/resource teardown, not session switch choreography.

Keep the public facade on `AgentSession`:

- modes continue calling `session.newSession()`, `session.switchSession()`, `session.forkSession()`, `session.navigateTree()`, `session.reload()`, `session.abort()`, and `session.dispose()`
- no mode imports a lifecycle controller
- root barrels and `core/index.ts` do not export lifecycle internals

## Benefits

- **DIP**: external callers keep depending on `AgentSession`, while the new collaborator receives capabilities instead of the composition root.
- **Locality**: switch/new sequencing becomes reviewable without absorbing reload, tree navigation, or summarization policy.
- **Single owner**: model/thinking restore stays in `ModelController`; tool rebuild stays in `ToolRuntimeController`; event mapping stays in `ExtensionEventBridge`; branch summary stays with tree navigation until separately accepted.

## Before / After Sketch

```
BAD
AgentSession -> SessionLifecycleController owns switch + reload + tree + model + tools + Soul + resources

GOOD
AgentSession facade -> narrow lifecycle collaborator for new/switch choreography only
ModelController still owns model/thinking restore
ToolRuntimeController still owns tool runtime refresh
Tree/reload remain separate review targets
```

## Decision Criteria

Accept an implementation only if:

- the lifecycle collaborator does not import `agent-session.ts`
- the lifecycle context exposes named capabilities, not whole `AgentSession`
- no mode imports the lifecycle collaborator
- `newSession()` and `switchSession()` remain callable through the same `AgentSession` methods
- `session_before_switch` cancellation and `session_switch` emission order remain unchanged
- model/thinking restoration is delegated to `ModelController`
- pending session-bound queues have one explicit clearing capability
- reload, tree navigation, branch summary, Soul refresh, MCP refresh, and tool rebuild policy do not move in the same commit

## Suggested First Implementation

If selected, implement this as a small `SessionLifecycleController` or `SessionSwitchController` that owns only `new` and `resume` transitions. Prefer a name that reflects the selected scope; if it does not own reload/tree/dispose, avoid a name that implies it owns all lifecycle behavior.

## References

- Gate: `../gates.md` RS-1, RS-2, RS-3, RS-4, RS-5
- Facade review: `./AS06-agent-session-public-facade.md`
- Event review: `./AS07-event-bridge-boundary.md`
