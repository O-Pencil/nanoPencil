# EV03: Browser Automation Is Optional Capability Cost

```yaml
id: EV03
status: selected
severity: high
scope:
  - extensions/builtin/browser
  - extensions/optional
  - builtin extension loading
  - package files
classification: optional capability
decision: Q2
```

## Problem

Browser automation is valuable but heavy. F07 shows the browser harness dominates default extension size. Users who never run browser automation still pay install/package cost today.

Moving it out of builtin default load is not just a refactor; it changes default capability availability.

## Verdict — SELECTED

Treat browser automation as an optional capability. The exact opt-in shape is Q2:

- independent package
- lazy-extract while still shipped
- status quo

P6 must not move browser files until Q2 is accepted.

## Boundary Rules

- Normal startup must not fail when browser support is absent.
- `/browser` or equivalent discovery path must explain how to enable it.
- Builtin extension loading must distinguish "not installed" from "broken".
- Privacy/terminal-first charter remains intact; browser is user-initiated capability.
- Package `files` changes require REVIEW.

## Acceptance

- Browser tools remain available after following the opt-in path.
- Missing browser harness produces clear status/install guidance.
- Non-browser sessions do not load or require browser assets.
- The behavior change is recorded as GB-2 intentional change.
