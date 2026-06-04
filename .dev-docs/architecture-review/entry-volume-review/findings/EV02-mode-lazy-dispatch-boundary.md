# EV02: Mode Lazy Dispatch Is An Entry Boundary, Not A Mode Refactor

```yaml
id: EV02
status: selected
severity: high
scope:
  - main.ts
  - modes/index.ts
  - modes/interactive
  - modes/print-mode.ts
  - modes/rpc
  - modes/acp
classification: entry dispatch
```

## Problem

`main.ts` currently imports mode implementations through `modes/index.ts`, which makes startup pay for unselected modes. ACP already proves dynamic import is viable.

The risk is doing too much: P6 should not rewrite the modes while making dispatch lazy.

## Verdict — SELECTED

Implement mode lazy dispatch as a narrow entry boundary:

```text
main.ts parses args/config
  -> determine selected mode
  -> dynamic import selected runner only
```

`modes/index.ts` should not eagerly re-export heavy implementations. It may remain a tiny facade for types or be bypassed by direct dynamic imports.

## Boundary Rules

- Do not change mode behavior.
- Do not change mode option objects.
- Do not move P5 interactive controller code.
- Do not narrow root exports in this slice; Q3/P8 owns that.
- Keep ACP dynamic import behavior equivalent.

## Acceptance

- Unselected heavy modes are not statically imported by `main.ts`.
- interactive/print/rpc/acp CLI paths remain reachable.
- Public imports remain compatible unless Q3 explicitly changes them.
- Cold-start measurement is captured on a capable machine after implementation.
