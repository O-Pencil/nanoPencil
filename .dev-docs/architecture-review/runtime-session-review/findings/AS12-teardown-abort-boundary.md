# AS12: abort()/dispose() are cleanup, not a controller

```yaml
finding_id: AS12
severity: opinionated
lenses: [locality]
files_primary:
  - core/runtime/agent-session.ts
status: rejected
```

## Problem

`abort()`, `dispose()`, and mode shutdown look like a "lifecycle teardown" cluster that could be extracted. In reality they are tiny sequencers over already-owned collaborators:

```
async abort() {            // 3 lines
  this.abortRetry();       // RetryCoordinator owns retry abort
  this.agent.abort();      // Agent owns turn abort
  await this.agent.waitForIdle();
}

dispose() {                // 5 lines
  this._disconnectFromAgent();      // agent subscription teardown
  this._extensionRunner?.dispose(); // ExtensionRunner owns its teardown
  this._listeners.clear();          // Listeners primitive owns its clear
  this._detachExternalAbort?.();    // external abort cleanup
}
```

Every real teardown effect is already owned elsewhere (RetryCoordinator, Agent, ExtensionRunner, Listeners). These methods only order those teardowns.

## Deletion Test

> If a `TeardownController` were created, what real state or behavior would it own?

**Result**: none. It would hold no state and hide no complexity — it would forward to the same collaborators. That is precisely the placeholder pattern RS-5 forbids ("a new collaborator must hide real behavior or own real state").

## Verdict — REJECTED

Do **not** extract a teardown/abort controller. `abort()` and `dispose()` stay on `AgentSession` as composition-root cleanup. This is the correct place for "sequence the teardown of the things I composed."

Mode shutdown likewise stays in each mode's own shutdown path; it is not session-owned behavior.

## Re-open Criteria

Only reconsider if teardown gains real owned state or non-trivial ordering logic (e.g. ordered async teardown with failure recovery, resource leases, or teardown that other controllers must coordinate through). None of that exists today.

## References

- Gate: `../gates.md` RS-5 (no fake extraction)
