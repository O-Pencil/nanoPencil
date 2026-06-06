# Bundle Redesign Refactor Plan

```yaml
plan_for: bundle-redesign-review
phase: P7
status: proposed
created_at: 2026-06-06
```

## Order

| Order | Slice | Finding | Code Allowed Now? | Notes |
|-------|-------|---------|-------------------|-------|
| 0 | Review/postmortem | BR01-BR04 | docs only | This document set |
| 1 | Package boundary hardening | BR01 | yes | Add manifest/dist guards and formalize public packages vs embedded private libs |
| 2 | Browser asset optionalization | BR02 | after Q2 | Biggest real install-size win; user-facing opt-in path required |
| 3 | Model metadata chunking | BR03 | after size/startup metrics | Generator-backed only; preserve synchronous catalog APIs unless explicitly changed |
| 4 | esbuild/chunked build pipeline | BR04 | deferred | Do not start until package boundaries are stable and prior slices are measured |

## Recommended First Implementation Slice

BR01 is the first code slice, and it should stay boring:

- Add `npm run verify:package-boundary` for static manifest checks:
  - public package host dependency ranges match local package versions.
  - public packages declare `publishConfig.access = public`.
  - host package does not publish-resolve private internal libs.
  - root `files` includes `dist/**/*.js`, `dist/**/*.d.ts`, and `dist/**/*.json`.
- Add `npm run verify:package-boundary:dist` for capable-machine post-build checks:
  - `dist/node_modules/@pencil-agent/{ai,agent-core,tui}` exists.
  - embedded package manifests are sanitized and keep `default` export compatibility.
  - `mem-core` publish dist contains `extension.js` and `config.js`.
- Keep npm registry checks outside this script; `npm view`/install smoke remains a release-machine task.

This has higher leverage than esbuild because it prevents repeats of beta.2-beta.6 failures.

## Implementation Not Recommended Yet

Do not start these until BR01 is green:

- replacing `tsc` with esbuild
- publishing `@pencil-agent/ai` as a new public package
- moving browser source/assets
- changing `models.generated.ts` generator output

## Exit Criteria For P7 Review

- Maintainer accepts or rejects BR01-BR04.
- P7 execution plan is updated with the chosen first code slice.
- If P7 code proceeds, it has a capable-machine validation owner.
