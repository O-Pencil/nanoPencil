# Catui Rebrand Review

```yaml
review_id: catui-rebrand-review
status: accepted-for-minimal-implementation
created_at: 2026-06-13
scope:
  - package.json package identity
  - CLI bin name
  - config.ts global filesystem root
  - agent-dir documentation
  - user-facing install/path documentation
```

## Purpose

This review records the first Catui rebrand step: the public host package becomes `@catui/agent`, the primary CLI command becomes `catui`, and the global ecosystem root changes from `~/.pencils` to `~/.catui`.

## Decision

Use `@catui/agent` for the main published package. npm scoped packages require the `@scope/name` shape, so `@catui` alone is not a valid package name.

Use `catui` as the primary executable name. Keep `nanopencil` as a compatibility bin during the migration window so existing scripts keep working while docs and install instructions move to Catui.

Change only the global root directory:

```text
~/.pencils/agents/<id> -> ~/.catui/agents/<id>
```

Do not rename the `agents/`, `workspaces/`, `channels/`, or `evals/` subtrees in this step.

## Compatibility

New canonical environment variables:

```text
CATUI_HOME
CATUI_AGENTS_DIR
CATUI_CODING_AGENT_DIR
```

Compatibility aliases remain accepted:

```text
PENCILS_HOME
PENCILS_AGENTS_DIR
NANOPENCIL_HOME
NANOPENCIL_CODING_AGENT_DIR
```

## Finding Set

| Finding | Status | Purpose |
|---------|--------|---------|
| [CR01](./findings/CR01-package-and-root-scope.md) | accepted | Keep this phase to package identity and root path only |

## Acceptance

- `package.json` publishes as `@catui/agent`.
- `bin.catui` points to the existing CLI entry.
- Default multi-agent root resolves to `~/.catui/agents/<id>`.
- Existing `PENCILS_*` and `NANOPENCIL_*` environment variables still work.
- User-facing docs mention `@catui/agent`, `catui`, and `~/.catui/agents/default`.
- No subtree rename is introduced in this phase.
