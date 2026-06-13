# npm-unscoped-publish-review

Status: accepted

## Scope

Change the public npm package identities from the unavailable `@catui/*` scope
to unscoped package names that the current maintainer account can publish.

## Decision

Use these public package names:

- Main CLI package: `catui-agent`
- Protocol package: `catui-protocol`
- Memory package: `catui-mem`
- Soul package: `catui-soul`

Private workspace libraries keep their existing internal names:

- `@catui/ai`
- `@catui/agent-core`
- `@catui/tui`

Those private names are internal module aliases and are not part of this npm
publish surface change.

## Boundary

This is a package/release identity change. It does not change runtime behavior,
protocol contracts, or extension semantics.

## Acceptance

- Root and first-party published package manifests use the unscoped names.
- Published package dependencies resolve to the unscoped names.
- Protocol imports use `catui-protocol`.
- Build and package-boundary verification pass.
