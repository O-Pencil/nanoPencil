# Entry & Volume Refactor Plan

```yaml
plan_for: entry-volume-review
parent: ./README.md
status: review-only-while-p5-active
```

## Execution Rule

P6 code is blocked by P5. While P5 is active, only do review, conflict mapping, and decision prep.

```text
P5 interactive entry stable
  -> EV02 mode lazy dispatch
  -> EV03 browser opt-in (after Q2)
  -> EV04 provider lazy design/implementation (after provider matrix is agreed)
  -> EV05 package surface sign-off
```

## Slice Order

| Order | Slice | Finding | Code allowed now? | Notes |
|-------|-------|---------|-------------------|-------|
| 0 | P6 review scaffolding | EV01-EV05 | docs only | Safe parallel work while another Agent changes P5 |
| 1 | mode lazy dispatch | EV02 / F06 | no, wait P5 | Touches `main.ts` + `modes/index.ts`; should be first code slice after P5 because it gives P6 leverage without package reshaping |
| 2 | browser opt-in decision | EV03 / F07 / Q2 | docs only | Decide independent package vs lazy-extract vs status quo before moving files |
| 3 | browser optional implementation | EV03 | no, after Q2 | Moving builtin→optional is intentional behavior change; needs fallback UX and docs |
| 4 | ai provider lazy design | EV04 / F07 / Q6 | docs only | Split metadata/runtime concerns before touching `@pencil-agent/ai` |
| 5 | ai provider lazy implementation | EV04 | no, after provider matrix | Highest behavior risk: model availability, OAuth/env/custom providers, token usage |
| 6 | package surface review | EV05 / Q3 / P8 | docs only | Do not narrow root exports in P6 unless Q3 explicitly says so |

## Conflict Matrix With P5

| P6 Slice | P5 Conflict | Decision |
|----------|-------------|----------|
| mode lazy dispatch | Depends on final interactive entry/export shape | Wait for P5 stable `InteractiveMode` mount and controller wiring |
| browser opt-in | May affect extension-ui feature inventory and builtin extension expectations | Review now; code after P5 extension acceptance is stable |
| ai provider lazy | Cross-mode runtime/provider behavior, not direct P5 file conflict | Design now; implement only with full provider validation |
| package surface | Could interact with P5/P8 public exports and subpaths | Review now; implementation requires explicit compatibility decision |

## Acceptance Shape

Each code slice must record:

```text
Slice:
Cost moved:
Files touched:
Intentional behavior changes:
Compatibility notes:
Validation:
- mode smoke:
- browser fallback:
- provider matrix:
- cold start:
- dist size:
Residual risk:
```

## Near-Term Parallel Work

Safe while P5 is active:

- Maintain this review directory.
- Inspect import graphs by text search.
- Draft Q2 browser opt-in decision.
- Draft provider lazy matrix.
- Define measurement commands for a capable machine.

Not safe while P5 is active:

- Edit `main.ts` dispatch.
- Edit `modes/index.ts`.
- Move `extensions/builtin/browser`.
- Change package `files` or root exports.
- Change `core/lib/ai` provider/model loading.
