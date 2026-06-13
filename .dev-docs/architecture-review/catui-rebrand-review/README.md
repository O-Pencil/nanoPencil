# Catui Rebrand Review

```yaml
review_id: catui-rebrand-review
status: accepted
created_at: 2026-06-13
updated_at: 2026-06-13
scope:
  - public npm package identity
  - internal workspace package scopes
  - CLI bin names and help text
  - runtime/config/env/filesystem paths
  - public SDK names and compatibility aliases
  - user-facing docs, charter, and architecture maps
  - tests, fixtures, diagnostics, and telemetry keys
```

## Purpose

This review owns the full Catui brand rebuild. The end state removes the Pencil/nanoPencil brand from current product surfaces, package surfaces, runtime defaults, user-facing documentation, and active developer maps. Historical changelog entries may preserve old names as immutable release history, but active code and docs must converge on Catui.

## Decision

Use `@catui/agent` for the main published package. npm scoped packages require the `@scope/name` shape, so `@catui` alone is not a valid package name.

Use `catui` as the executable name. The legacy `nanopencil` bin is removed for the Catui rebuild; runtime data/import compatibility remains covered separately.

Use `~/.catui` as the canonical global root. The old roots are migration sources only:

```text
~/.nanopencil/agent     -> ~/.catui/agents/default
~/.pencils/agents/<id> -> ~/.catui/agents/<id>
```

The first implementation may keep stable structural nouns such as `agents/`, `workspaces/`, and `sessions/` if changing them would force data migration with no functional gain. Product-facing names, package names, env names, comments, docs, and user-visible strings must move to Catui.

## Compatibility

New canonical environment variables:

```text
CATUI_HOME
CATUI_AGENTS_DIR
CATUI_CODING_AGENT_DIR
```

Compatibility aliases may remain accepted for at least one major migration window, but they must be documented as legacy and not used in new examples:

```text
PENCILS_HOME
PENCILS_AGENTS_DIR
NANOPENCIL_HOME
NANOPENCIL_CODING_AGENT_DIR
NANOPENCIL_DEBUG
NANOPENCIL_OFFLINE
```

## Brand Inventory

The rebrand sweep must classify every match before editing:

| Surface | Examples | Required Action |
|---------|----------|-----------------|
| Public package names | `@pencil-agent/nano-pencil`, `@pencil-agent/protocol`, `@pencil-agent/mem-core`, `@pencil-agent/soul-core` | Rename to `@catui/*`; keep compatibility aliases only where runtime loading requires it |
| Private workspace packages | `@pencil-agent/ai`, `@pencil-agent/agent-core`, `@pencil-agent/tui` | Rename or provide explicit decision if kept private for a staged internal cleanup |
| CLI and process identity | `nanopencil`, help text, update/reinstall text | Make `catui` canonical; legacy command only for migration |
| Filesystem roots | `~/.nanopencil`, `~/.pencils`, `.nanopencil`, `.pencils` | Default to `~/.catui`; old paths are migration/read aliases |
| Environment variables | `NANOPENCIL_*`, `PENCILS_*` | Add `CATUI_*`; old env names are legacy aliases |
| SDK/API symbols | `PencilAgent`, `PencilAgentOptions`, `pencil-agent` terms | Decide alias vs hard rename; any public break must be explicit |
| Runtime identifiers | telemetry slots, debug logs, meta tags, symbol keys | Move active keys to `catui.*`; preserve old read compatibility if needed |
| User-facing docs | README, AGENTS, SECURITY, CONTRIBUTING, charter | Rewrite current docs to Catui; old brand may remain only in historical changelog entries |
| Tests and fixtures | temp dirs, assertions, import paths | Update to Catui unless testing legacy compatibility |
| Repository metadata | npm badges, GitHub URLs, homepage | Update once the target repository/org names are known |

## Non-Goals

- Do not rewrite immutable release history in `CHANGELOG.md` unless the entry is generated for the new release.
- Do not remove legacy path/env/package aliases in the same patch that introduces the new canonical names unless a migration test proves users will not lose data.
- Do not invent new user-data subtrees such as `cats/` or `territories/` without a separate data-layout finding and copy-first migration plan.

## Finding Set

| Finding | Status | Purpose |
|---------|--------|---------|
| [CR01](./findings/CR01-package-and-root-scope.md) | superseded | Initial minimal-scope decision; superseded by full brand rebuild |
| [CR02](./findings/CR02-full-brand-sweep.md) | accepted | Define the full scan surfaces and edit policy |
| [CR03](./findings/CR03-compatibility-aliases.md) | accepted | Preserve old names only as explicit migration aliases |

## Execution

Implementation proceeds through the explicit checklist in [`implementation-checklist.md`](./implementation-checklist.md). Each item must be accepted with its local check before the final gates run.

## Acceptance

- `package.json` publishes as `@catui/agent`.
- `bin.catui` points to the existing CLI entry.
- First-party published dependencies resolve under `@catui/*`.
- Default multi-agent root resolves to `~/.catui/agents/<id>` and migration tests cover `~/.nanopencil` and `~/.pencils`.
- Current docs mention Catui, not Pencil/nanoPencil, except when describing legacy migration.
- Active code contains no unclassified `pencil`, `nanopencil`, `.pencils`, `.nanopencil`, `PENCILS_*`, or `NANOPENCIL_*` references.
- Compatibility aliases have tests and comments marking them as legacy.
- `verify:dip`, `verify:quality`, `verify:package-boundary`, `build`, and `tsc --noEmit` pass.
