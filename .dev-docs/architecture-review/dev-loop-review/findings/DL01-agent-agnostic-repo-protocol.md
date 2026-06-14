# DL01: Dev Loop Must Be Agent-Agnostic Repository Protocol

```yaml
id: DL01
status: accepted
severity: structural
classification: owner-boundary
scope:
  - .dev-docs/vibe-coding
  - scripts/dev-loop
  - .catui/dev-loop
```

## Problem

The repository already has agent-like runtime capabilities, but the desired workflow is broader than CATUI executing itself. The maintainer may use Claude Code, Codex/Cursor, CATUI, or another agent to repair this repository.

If the loop is implemented only as a CATUI extension, non-CATUI agents cannot naturally consume it. If it is implemented inside `core/runtime`, the product runtime gains development-infrastructure responsibilities that do not belong to the shipped agent.

## Decision

The first implementation slice is a repo protocol plus scripts:

```text
.dev-docs/vibe-coding     protocol, verification map, artifact schema
scripts/dev-loop          commands and pure parsing/state helpers
.catui/dev-loop           local run artifacts
```

CATUI may later wrap these commands in an extension, but the source of truth remains repository-level and executable from a plain shell.

## Consequences

- Claude Code, Codex/Cursor, and CATUI can all read the same files and run the same commands.
- The implementation can use `node --import tsx` and `gh` without depending on CATUI runtime internals.
- Artifact formats must be stable enough for humans and agents to resume work after interruption.
- CATUI product code stays untouched unless a future review accepts an extension wrapper.

## Acceptance

- No imports from `core/runtime`, `modes`, or `extensions` are required by `scripts/dev-loop`.
- Every command writes files under a caller-selected artifact directory, defaulting to `.catui/dev-loop`.
- State files expose explicit `continue`, `complete`, or `blocked` decisions.
