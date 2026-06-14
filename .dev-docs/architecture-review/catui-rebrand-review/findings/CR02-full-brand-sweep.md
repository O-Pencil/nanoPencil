# CR02 Full Brand Sweep

```yaml
finding_id: CR02
status: accepted
severity: critical
owner: repo-wide
```

## Observation

The current repository still contains active Pencil/catui references across package metadata, runtime config, SDK exports, extension aliases, diagnostics, docs, tests, and charter files. Leaving those references in active surfaces creates a split identity: users install Catui but see Pencil in errors, docs, env vars, storage hints, and import paths.

## Decision

Perform a repo-wide classified sweep. Each match must be assigned to one of four categories:

| Category | Meaning | Action |
|----------|---------|--------|
| Canonical Catui surface | Active package names, commands, docs, runtime defaults | Rename to Catui |
| Legacy compatibility alias | Old env vars, old CLI bin, old package import alias | Keep, but mark as legacy and test |
| Historical record | Old changelog/release notes/issues that describe past behavior | Preserve unless the doc is current guidance |
| External future work | Other repositories or URLs not controlled in this patch | Record as follow-up in docs |

## Required Sweep Areas

- `package.json`, `package-lock.json`, workspace package manifests, and `tsconfig` path aliases.
- Root public SDK headers and exports, including `PencilAgent` naming decisions.
- `config.ts`, migration tooling, env var parsing, debug/profiler/offline flags.
- Extension loader aliases and package imports.
- User-visible CLI/TUI strings, update prompts, slash command descriptions, default prompts.
- Runtime telemetry/debug keys, HTML export meta names, temp file prefixes, test fixture names.
- P1/P2/P3 docs and charter docs that are current architecture guidance.
- README/SECURITY/CONTRIBUTING and npm badge metadata.

## Risk

This is a public-API and user-data-path change. It must not ship as an incidental patch. The implementation should be a deliberate rebrand commit with migration notes and compatibility tests.

## Acceptance

- `rg -n "pencil|Pencil|PENCILS|CATUI|catui|catui|nano-pencil|@pencil-agent|\\.pencils|\\.catui"` has no unclassified active-surface matches.
- Remaining matches are either in `CHANGELOG.md`/historical issue files or explicitly labeled legacy compatibility paths.
- Build and all workflow gates pass.
