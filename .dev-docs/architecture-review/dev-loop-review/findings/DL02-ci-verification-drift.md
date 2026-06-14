# DL02: Verification Drift Must Be Fixed Before Automation

```yaml
id: DL02
status: accepted
severity: correctness
classification: verification-boundary
scope:
  - package.json
  - .github/workflows/ci.yml
  - .github/workflows/quality.yml
  - .dev-docs/vibe-coding/verification-plan.json
```

## Problem

The repository has several verification gates, but the local and CI maps are not expressed as one machine-readable contract. One obvious drift exists: the package CI job references `packages/agent-core` and `packages/ai`, while the actual workspace paths are `core/lib/agent-core` and `core/lib/ai`.

Automation built on a drifting verification surface will repair toward the wrong target.

## Decision

Define a repo-level verification plan and align scripts/CI with it:

- Keep the canonical automatic gates: `verify:dip`, `verify:quality`, `verify:package-boundary`, `build`, and `tsc --noEmit`.
- Add focused dev-loop tests as a named local and CI-visible command.
- Correct package workspace commands to the current workspace names.
- Make the dev-loop runner consume the same verification plan instead of hardcoding an unrelated command list.

## Consequences

- Agents can ask "what means green?" by reading a JSON file.
- CI and local repair loops share command names and intent.
- If a full gate is too slow for a machine, the artifact can still record exactly which planned command was skipped or blocked.

## Acceptance

- `npm run dev-loop:plan` prints the verification plan.
- `npm run dev-loop:verify` can run commands from the plan by id.
- GitHub Actions references valid workspace package names.
- New parser/state behavior is covered by `test/dev-loop.test.ts`.
