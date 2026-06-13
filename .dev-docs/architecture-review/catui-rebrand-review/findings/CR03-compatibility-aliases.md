# CR03 Compatibility Aliases

```yaml
finding_id: CR03
status: accepted
severity: high
owner: config.ts + extension loader + package metadata
```

## Observation

Existing users may have environment variables, extension imports, and data directories that use the old Pencil/nanoPencil names. Removing those names in the same patch that introduces Catui would turn a brand rebuild into a data-loss or startup-failure risk. The CLI executable is the exception: this rebuild intentionally makes `catui` the only bin name.

## Decision

Keep compatibility aliases where they protect users, but never present them as canonical:

| Legacy Surface | Canonical Surface | Policy |
|----------------|-------------------|--------|
| `nanopencil` CLI | `catui` | Remove legacy bin; `catui` is the only executable |
| `@pencil-agent/nano-pencil` extension import | `@catui/agent` | Keep loader alias; new docs use `@catui/agent` |
| `PENCILS_HOME`, `PENCILS_AGENTS_DIR` | `CATUI_HOME`, `CATUI_AGENTS_DIR` | Read as legacy aliases |
| `NANOPENCIL_*` env vars | `CATUI_*` env vars | Read only where needed for compatibility |
| `~/.nanopencil`, `~/.pencils` | `~/.catui` | Copy-first migration sources |

## Constraints

- Alias code must be small, centralized, and documented as compatibility.
- New examples, help text, docs, and default generated files must use Catui only.
- Tests must verify both canonical Catui paths and at least the main legacy migration path.

## Acceptance

- A fresh install creates `~/.catui`.
- An existing `~/.nanopencil` or `~/.pencils` install migrates without destructive moves.
- Legacy env vars still resolve, but help/docs prefer `CATUI_*`.
