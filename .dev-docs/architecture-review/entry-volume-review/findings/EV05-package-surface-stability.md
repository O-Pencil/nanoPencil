# EV05: Package Surface Changes Are Stability Decisions

```yaml
id: EV05
status: selected
severity: high
scope:
  - package.json
  - index.ts
  - modes/index.ts
  - scripts/bundle-deps.js
  - package files
classification: package surface
related_decisions:
  - Q3
  - P8
```

## Problem

P6 naturally tempts broad cleanup:

- remove mode exports from root `index.ts`
- change package `files`
- move browser assets
- change bundled workspace package layout
- add subpath exports

Those are public/stability decisions, not incidental implementation details.

## Verdict — SELECTED

P6 may reduce eager loading and package cost, but it must not narrow public SDK/package surface without explicit Q3/P8 decision.

## Boundary Rules

- Root `index.ts` narrowing belongs to P8 unless Q3 explicitly pulls it into P6.
- Package `files`, bin entries, and subpath exports require REVIEW.
- Deprecation beats removal unless the phase explicitly declares a breaking change.
- Build/package changes need a rollback path independent from mode lazy dispatch.

## Acceptance

- Public API snapshot is compared before/after any package surface change.
- Package contents diff is reviewed for missing runtime assets.
- Any intentional public surface change is documented as GB-2.
