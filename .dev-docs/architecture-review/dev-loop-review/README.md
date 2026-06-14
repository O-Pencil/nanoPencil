# Dev Loop Review

```yaml
review_id: dev-loop-review
phase: repo-development-infrastructure
scope:
  - .dev-docs/vibe-coding
  - scripts/dev-loop
  - package.json
  - .github/workflows/ci.yml
  - .github/workflows/quality.yml
status: implementation-open
created_at: 2026-06-14
```

## Purpose

This review defines the repository-level development loop for maintaining CATUI/nanoPencil with any coding agent. CATUI is the target repository being developed here, not the assumed executing agent.

The accepted boundary is:

```text
developer intent
  -> any coding agent
  -> repo dev-loop protocol and scripts
  -> local verification / GitHub checks
  -> structured IssueRecord artifacts
  -> repair iteration owned by the agent
```

## Decision

Implement the first slice as repo development infrastructure:

- `.dev-docs/vibe-coding/` owns human-readable protocol, verification map, and artifact schema.
- `scripts/dev-loop/` owns machine-readable runner, parser, GitHub ingestion, and babysit/watch commands.
- `.catui/dev-loop/` is the default local artifact store. The directory name is repository state, not a requirement that CATUI executes the loop.
- CATUI runtime, modes, and extensions remain unchanged in this slice.

## Findings

| Finding | Status | Purpose |
|---------|--------|---------|
| [DL01](./findings/DL01-agent-agnostic-repo-protocol.md) | accepted | Keep the loop usable by Claude Code, Codex/Cursor, CATUI, or another agent. |
| [DL02](./findings/DL02-ci-verification-drift.md) | accepted | Fix local/CI verification drift before building automation on top. |

## Non-Goals

- Do not add a CATUI extension or slash command in the first implementation slice.
- Do not put dev-loop orchestration inside `core/runtime/`.
- Do not automatically push, commit, or mutate remote GitHub state.
- Do not replace GitHub Actions; only ingest PR/check state through `gh`.
- Do not claim the repository is green from a partial gate.

## Acceptance

- A machine-readable verification plan lists local gates and PR/CI checks with exact commands.
- Focused tests cover failure parsing, fingerprinting, local run artifact shape, GitHub ingestion parsing, and babysit stop decisions.
- `npm run dev-loop:verify` writes structured run artifacts and issue records for failing commands.
- `npm run dev-loop:parse` can turn saved logs into deduplicated `IssueRecord` output.
- `npm run dev-loop:pr -- <number>` ingests this repository's PR checks through `gh` without requiring a specific coding agent.
- `npm run dev-loop:watch` can continue until green or stop with an explicit blocked reason.

## Validation

Focused validation:

```bash
node --test --import tsx test/dev-loop.test.ts
```

Repository gates:

```bash
npm run verify:dip
npm run verify:quality
npm run verify:package-boundary
npm run build
npx tsc --noEmit
```
