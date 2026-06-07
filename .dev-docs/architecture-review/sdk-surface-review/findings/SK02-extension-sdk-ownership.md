# SK02: Extension Protocol Belongs In extension-sdk

```yaml
id: SK02
status: reviewed
severity: high
classification: extension-protocol
scope:
  - packages/extension-sdk
  - core/extensions-host/types.ts
  - index.ts
```

## Problem

The host root currently re-exports rich extension-host types. That makes extension authors depend on the full host package and encourages protocol growth inside `index.ts`.

P3 introduced `@pencil-agent/extension-sdk` to invert this dependency. P8 should finish the policy decision:

```text
extension protocol growth -> @pencil-agent/extension-sdk
host root index.ts        -> host embedding SDK only
```

## Current extension-sdk State

`@pencil-agent/extension-sdk` currently owns:

- tool contract shape
- optional tool runtime/permission descriptor seam
- lifecycle context/API basics
- command registration basics
- loose hook event typing

It does **not** yet own every rich host extension event type or UI integration type exported from the host root.

## Recommendation

P8 should not delete host extension exports until the extension-sdk replacement surface is ready.

Safe order:

1. Add missing extension protocol contracts to `@pencil-agent/extension-sdk`.
2. Update first-party packages/extensions to consume extension-sdk where package-boundary appropriate.
3. Mark host root extension exports as legacy/deprecated or remove them only in a major window.

## Boundary Rule

New extension protocol types must not be added to host `index.ts`.

If a type is intended for third-party extension authors, it belongs in `@pencil-agent/extension-sdk`.

## Acceptance If Implemented

- `packages/mem-core` and other public packages do not depend on `@pencil-agent/nano-pencil`.
- extension-sdk is semver-versioned before host release if protocol types change.
- root host extension exports are either aliased with a deprecation plan or intentionally removed in a major release.
- migration guide shows old root import and new extension-sdk import.
