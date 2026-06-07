# SK03: P8 Requires An Explicit API Migration Strategy

```yaml
id: SK03
status: reviewed
severity: high
classification: migration
scope:
  - index.ts
  - package.json exports
  - CHANGELOG.md
  - docs
```

## Problem

P8 is the one phase where "functionally unchanged" may intentionally not hold for public API symbols. That means it cannot be hidden inside normal refactor sign-off.

## Options

| Option | Description | Benefit | Cost |
|--------|-------------|---------|------|
| Skip for current sign-off | Preserve root exports; document P8 as future API work | keeps current merge functional-equivalence clean | root barrel stays broad for now |
| 2.0 breaking narrow | remove/move root exports before 2.0 final | cleanest long-term API if no stable 2.0 users | requires migration guide and public symbol diff acceptance |
| deprecate + 6 months | keep aliases, add subpaths/extension-sdk guidance | safer for existing users | root remains broad longer; extra maintenance |

## Recommendation

Default for current branch: **skip implementation** and record P8 as future optional API work.

If maintainers choose to include P8 before 2.0 final, prefer a single intentional breaking release instead of a long alias period, because the project is already in a `2.0.0-beta.*` window. However, that choice must update sign-off S-1 from "no public API diff" to "accepted intentional API diff".

## Required Migration Artifacts If Implemented

- export matrix with every removed/moved root symbol.
- migration guide:

```text
before: import { X } from "@pencil-agent/nano-pencil"
after:  import { X } from "@pencil-agent/nano-pencil/<subpath>"
or:     import { X } from "@pencil-agent/extension-sdk"
```

- CHANGELOG breaking-change section.
- external consumer smoke:
  - Gateway/native-host SDK consumer
  - public extension package using extension-sdk
  - root SDK embedding sample

## Acceptance If Implemented

- `npm run wiki:all` symbol diff is attached and intentional.
- `package.json exports` contains any required explicit subpaths.
- no root export is removed without a documented destination or explicit removal reason.
