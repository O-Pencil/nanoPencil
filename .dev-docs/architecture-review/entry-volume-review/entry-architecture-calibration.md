# P6 Entry Architecture Calibration

```yaml
doc: entry-architecture-calibration
scope: P6 entry and package volume review
status: active
created_at: 2026-06-04
parent:
  - ./README.md
  - ../execution-plan/P6-entry-volume.md
```

## 1. Why This Document Exists

F06/F07 identify real startup and package-size waste, but P6 must not become a bag of local optimizations.

The top-level question is:

> Which costs are intrinsic to running catui, and which costs belong only to a selected mode, optional extension, or selected provider?

P6 should move costs to the smallest honest owner without breaking behavior.

## 2. Target Entry Shape

The desired shape is:

```text
cli.ts
  -> main.ts boot shell
      -> parse args/config
      -> create shared runtime/session prerequisites
      -> dynamic import exactly one mode runner
```

`main.ts` may stay the CLI composition root, but it must not eagerly load every mode.

`modes/index.ts` should become one of:

- a type-only / tiny facade; or
- removed from runtime dispatch if direct dynamic imports are clearer.

It must not re-export heavy mode implementations in a way that forces eager loading.

## 3. Cost Ownership

| Cost | Owner | Rule |
|------|-------|------|
| CLI parsing/config discovery | `main.ts` boot shell | Eager, because every CLI path needs it |
| Interactive TUI implementation | `modes/interactive/*` | Lazy; only interactive users pay |
| Print mode runner | `modes/print*` | Lazy; print users only |
| RPC/ACP servers | `modes/rpc`, `modes/acp` | Lazy; server modes only |
| Shared cancellation shell | `modes/_shell` | May be eager only if small and mode-neutral |
| Browser automation harness | optional extension/package | Not default startup/install cost unless Q2 chooses lazy-extract |
| Provider runtime implementations | `@pencil-agent/ai` provider modules | Load by selected/requested provider, not all providers |
| Model metadata catalog | provider-indexed generated data | Queryable without forcing every provider runtime implementation |
| Root SDK exports | root `index.ts` / package exports | Stable public API; P6 must not narrow it without P8/Q3 |

## 4. P5 Dependency

P6 depends on P5 because P5 decides the final interactive entry shape:

- `interactive-mode.ts` should converge to a composition root.
- heavy interactive controllers should be lazy-friendly.
- `_shell` boundaries should be small and mode-neutral.

While P5 is active, P6 must not edit:

- `modes/interactive/interactive-mode.ts`
- `modes/interactive/controllers/*`
- P5 feature inventory or UI gates, except by explicit coordination

P6 can still prepare review docs and inspect entry/import graphs.

## 5. Boundary Taxonomy

Every P6 change must be classified:

| Bucket | Meaning | Examples | Rule |
|--------|---------|----------|------|
| Entry dispatch | Chooses which mode implementation loads | `main.ts` dynamic import, `modes/index.ts` facade | Must preserve CLI behavior and mode options |
| Optional capability | Feature not required by default CLI/session use | browser automation harness | Must have explicit install/enable path and fallback UX |
| Provider loading | Model catalog/provider implementation cost | `models.generated`, provider stream modules | Must preserve model availability, API-key fallback, token accounting |
| Package surface | What npm package exposes and ships | `files`, root exports, subpaths | REVIEW required; compatibility changes are not incidental |
| Measurement | Baseline and exit evidence | cold start, dist size, mode smoke | No benchmark theater; use repeatable commands on capable machine |

## 6. Design Rules

1. **One selected mode pays one selected mode cost.**
2. **Optional extensions should not be default install cost unless product policy says so.**
3. **Provider metadata and provider runtime are different costs.**
4. **Public exports are a compatibility contract, not a tree-shaking convenience.**
5. **Dynamic import boundaries must not hide behavior changes.**
6. **Performance improvements must be measured against P0/P6 baselines on a capable machine.**
7. **P6 must not make P5 merge conflicts harder; code landing waits for P5 entry stability.**

## 7. Success Criteria

P6 is architecturally successful when:

- CLI startup loads only the selected mode implementation.
- SDK consumers do not pay interactive mode cost through public entry imports.
- Browser automation remains available but no longer burdens users who never use it.
- Provider loading can evolve toward selected-provider cost without changing provider semantics.
- Package surface changes are explicit, reversible, and documented.
- P6 validation can explain both behavior preservation and measured cost movement.
