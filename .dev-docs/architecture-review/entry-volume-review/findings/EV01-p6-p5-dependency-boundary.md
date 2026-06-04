# EV01: P6 Code Must Wait For P5 Entry Stability

```yaml
id: EV01
status: selected
severity: high
scope:
  - P6-entry-volume
  - P5 interactive split
classification: phase dependency
```

## Problem

P6 depends on P5 in the execution plan. Another Agent is currently changing P5 interactive controllers. Starting P6 code now would create unclear ownership and merge risk around `main.ts`, `modes/index.ts`, and the interactive entry shape.

## Verdict — SELECTED

P6 review can run in parallel. P6 code cannot land until P5 entry shape is stable.

Allowed now:

- P6 review docs.
- import graph inspection.
- Q2/Q6 decision prep.
- validation plan.

Blocked now:

- `main.ts` mode dispatch changes.
- `modes/index.ts` facade changes.
- moving browser extension files.
- package surface changes.
- AI provider lazy implementation.

## Acceptance

- P6 implementation PRs state which P5 stable commit they build on.
- No P6 commit touches P5-active interactive files without explicit coordination.
