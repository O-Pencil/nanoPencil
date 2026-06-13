# CR01 Package And Root Scope

```yaml
finding_id: CR01
status: accepted
severity: high
owner: config.ts + package.json
```

## Observation

The rebrand touches public package identity, the executable name, and user data paths. Combining that with a subtree redesign would couple npm migration, shell migration, and filesystem migration into one release.

## Decision

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

A later review can rename product concepts such as `agents/` to `cats/` if the migration cost is justified and a copy-first migrator exists.
