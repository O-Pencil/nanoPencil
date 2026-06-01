# AS04: Coordinator placeholders are shallow unless they own real behavior

```yaml
finding_id: AS04
severity: structural
lenses: [depth, leverage]
files_primary:
  - core/runtime/agent-session.ts
  - core/session/compaction/compaction-coordinator.ts
files_secondary:
  - core/runtime/AGENT.md
  - core/runtime/CLAUDE.md
status: open
```

## Problem

`AgentSession` already has a `CompactionCoordinator`, but a coordinator that is wired with placeholder callbacks does not reduce complexity. It can make the design look decomposed while the real behavior still lives in `AgentSession`.

This is dangerous because it satisfies naming but not depth.

## Deletion Test

> If the placeholder coordinator were deleted, would complexity concentrate in callers or vanish?

**Result**: likely vanishes until it owns real compaction behavior.

If the coordinator has empty/default callbacks and no call path owns compaction state, deleting it does not force callers to reimplement compaction. That is a shallow module signal.

## Proposed Direction

Either:

- finish the compaction extraction so the coordinator owns real state and behavior, or
- remove/avoid exposing it until the extraction is ready.

Do not mark P4 compaction as complete while coordinator wiring is placeholder.

## Benefits

- **Leverage**: a real compaction controller can be tested and reasoned about independently.
- **Locality**: compaction thresholds, aborts, branch summary, and extension hooks move together.

## Before / After Sketch

```
BAD
AgentSession owns compaction
CompactionCoordinator exists but receives no real data

GOOD
AgentSession facade -> CompactionController/Coordinator -> compaction pipeline
```

## References

- Gate: `../gates.md` RS-5
- P4 runbook: `../execution-plan/P4-runtime-split.md`
