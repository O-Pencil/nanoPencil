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

## Resolution（landed 2026-06-04）

Narrow entry-dispatch slice, **main.ts only** (EV-G9 reversibility — its own commit):

- Removed the eager `import { InteractiveMode, runPrintMode, runRpcMode } from "./modes/index.js"`. That
  single static import forced every CLI path (incl. `--print`/`--rpc`) to load the interactive TUI + all
  P5 controllers + tui at startup.
- The three dispatch branches now mirror the pre-existing ACP pattern:
  - `rpc` → `const { runRpcMode } = await import("./modes/rpc/rpc-mode.js")`
  - interactive → `const { InteractiveMode } = await import("./modes/interactive/interactive-mode.js")`
  - print → `const { runPrintMode } = await import("./modes/print-mode.js")`
- `modes/index.ts` **kept unchanged as the public SDK surface** — root `index.ts` re-exports it, so
  narrowing it would break EV-G4 (Q3/P8 owns SDK narrowing). Only its P3 `[TO]` header was corrected
  (now "consumed by root index.ts, not the CLI dispatch path").
- `main.ts` still eagerly imports `modes/interactive/theme/theme.js` (a leaf needed for early theme init);
  that does not pull `interactive-mode.ts`.

Boundary rules honoured: no mode behavior / option-object change; no P5 controller code touched; ACP
equivalent; root exports not narrowed.

**Gate**: EV-G2 ✅ (static graph no longer eager-loads unselected modes) · EV-G3 (dispatch semantics
identical; mode smoke pending capable machine) · EV-G4 ✅ (surface unchanged) · EV-G7 N/A · EV-G9 ✅
(isolated commit) · EV-G10 ✅ (P3 corrected) · verify-quality green. EV-G8 cold-start/dist-size measurement
deferred to maintainer machine (low-perf policy).
