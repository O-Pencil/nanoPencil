# CR01 Package And Root Scope

```yaml
finding_id: CR01
status: superseded
severity: high
owner: config.ts + package.json
```

## Observation

The rebrand touches public package identity, the executable name, and user data paths. Combining that with a subtree redesign would couple npm migration, shell migration, and filesystem migration into one release.

## Original Decision

This phase changes only:

- package name: `@pencil-agent/nano-pencil` -> `@catui/agent`
- primary executable: `catui`
- ecosystem root: `~/.pencils` -> `~/.catui`

It keeps the existing internal shape:

```text
~/.catui/agents/<id>/
~/.catui/workspaces/
```

## Rationale

The root path is the compatibility boundary users see and scripts reference. Keeping subtrees stable avoids a broad data migration while still establishing the Catui namespace for new installs.

## Follow-Up

Superseded by [CR02](./CR02-full-brand-sweep.md). The user direction changed from a minimal rename to a full Catui brand rebuild, so package identity, docs, SDK names, env vars, telemetry keys, tests, and workspace package scopes must all be swept.
