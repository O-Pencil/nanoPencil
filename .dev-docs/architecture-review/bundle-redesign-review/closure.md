# P7 Bundle Redesign Closure

```yaml
review_id: bundle-redesign-review
phase: P7
status: closed-as-gated
closed_at: 2026-06-07
code_scope:
  implemented:
    - BR01 package-boundary guard
    - BR05 strip embedded runtime-lib .d.ts from tarball (2026-06-10)
  deferred:
    - BR02 browser package move
    - BR03 model metadata chunking (metrics captured 2026-06-10 → ~0 win, not pursued)
    - BR04 esbuild bundling
```

## Closure Verdict

P7 should close as a **gated review and package-boundary hardening slice**, not as a broad bundle rewrite.

The beta.2-beta.6 loop proved that the urgent problem was not "too many bytes"; it was unstable package ownership:

```text
public packages                 -> npm semver dependencies
private core/lib runtime libs    -> host-embedded dist/node_modules packages
optional capabilities            -> UX-first extension decisions, not raw asset moves
build pipeline                   -> measured target before replacement
```

BR01 fixed the load-bearing release boundary. BR02-BR04 now have explicit gates and should not proceed without new evidence.

## Final Finding State

| Finding | State | Decision |
|---------|-------|----------|
| [BR01](./findings/BR01-package-boundary-hardening.md) | implemented | Keep public package vs embedded-private-lib guard. This is the only P7 code slice accepted now. |
| [BR02](./findings/BR02-browser-asset-optionalization.md) | recalibrated-ux-first | Browser is one extension capability. Do not split raw Browser Harness assets first. |
| [BR03](./findings/BR03-model-metadata-chunking.md) | reviewed-metrics-gated | Do not split `models.generated.ts` because of line count. Require startup/import/churn metrics. |
| [BR04](./findings/BR04-esbuild-risk-deferral.md) | reviewed-deferred | Esbuild may help build speed, but bundling is deferred. If reopened, start transpile-only. |

## What Changed

Implemented guardrails:

- `npm run verify:package-boundary`
- `npm run verify:package-boundary:dist`
- `packages/soul-core/package.json` declares `publishConfig.access = public`
- P7 docs now encode public package vs embedded private lib boundaries.

No broad runtime behavior rewrite was accepted.

## What Did Not Change

- Browser remains a complete optional extension capability.
- Browser Harness remains an implementation asset of that extension.
- `models.generated.ts` remains monolithic until metrics justify generator-backed chunking.
- The build pipeline remains `tsc`-based.
- Provider request payloads, prompts, token accounting, model selection, and extension loader behavior are not intentionally changed by P7.

## Why Not Continue P7 Code Now

### BR02: Browser

Moving raw Browser Harness assets to a package optimizes first install size but worsens first-use UX. Users think in terms of the Browser extension, not an extension shell plus an asset package.

Future move condition:

```text
package the whole Browser extension only after a first-class install/enable UX exists
```

### BR03: Model Metadata

`models.generated.ts` is large in lines but small when compressed. It is a startup/import/churn question, not a release-boundary emergency.

Future move condition:

```text
capture startup/import/churn metrics and preserve sync getModel/getModels/getProviders
```

### BR04: Esbuild

Esbuild's strongest benefits require bundling or minification, which can disturb internal package embedding, extension aliases, dynamic imports, and asset-relative paths.

Future move condition:

```text
prove a concrete build/startup/size target; start with transpile-only, no bundling
```

## Validation State

P7 static validation:

```bash
npm run verify:package-boundary
```

P7 capable-machine validation:

```bash
npm run build
npm run verify:package-boundary:dist
npm publish --dry-run --tag beta
npm install -g @pencil-agent/nano-pencil@beta
nanopencil -v
```

Notes:

- prerelease publishes must use `npm publish --tag beta`.
- `npm publish --dry-run` for prerelease versions also needs `--tag beta`.
- If a size win is claimed later, attach tarball and unpacked before/after data.

## Reopen Matrix

| Reopen Area | Required Evidence | First Allowed Slice |
|-------------|-------------------|---------------------|
| Browser package move | User-facing install/enable UX exists and browser opt-in smoke is defined | Move/package whole Browser extension, not raw harness assets |
| Model metadata chunking | Startup/import/churn metrics justify generator complexity | Generated provider chunks plus sync aggregate compatibility wrapper |
| Esbuild | Build/startup/size target is measured and unmet by safer slices | Transpile-only esbuild plus TypeScript declarations; no bundling |

## 2026-06-10 Addendum — size metrics + first size slice

A "package size" request reopened the size line. **Measured before acting** (the
gate BR03 demanded):

### BR03 (model metadata chunking) — measured, NOT pursued

| Metric | Value |
|--------|-------|
| `models.generated.js` import/parse | ~30–43ms (one-time) on a now ~1.9s startup |
| built JS | 460K raw / **24K gzip** |
| providers / models | 25 / 846 |

Verdict: chunking into per-provider files behind a **sync** aggregate index (the
only API-preserving option; async load is rejected) **still eager-imports every
chunk** → parse cost unchanged, and 25 small files gzip to ~the same 24K (file
headers may even grow it). models.generated is **~1.3% of the 1.8MB tarball**.
BR03 delivers no size/startup win — only generator-churn localization. **Not
done.** The metrics gate is now satisfied with data: keep the monolith.

The real tarball weight is browser `agent-workspace` markdown (~1.6M) — that is
BR02, still UX-gated.

### BR05 (implemented) — strip embedded runtime-lib `.d.ts`

`scripts/copy-internal-libs.js` copied the full `dist` of each internal lib
(`@pencil-agent/{ai,agent-core,tui}`) into `dist/node_modules/`, including `.d.ts`
and `.map`. Those libs are embedded **purely for runtime `require.resolve` (.js)**:
the host's own type-check resolves them via the root workspace symlink to
`core/lib/*` (source, keeps `.d.ts`), and consumers resolve types from
`dist/index.d.ts` — TS never reads a package's nested `dist/node_modules`. So the
embedded declarations are dead weight. Added a copy filter dropping
`.d.ts`/`.d.*ts`/`.map`.

Same-dist before/after (`npm pack`):

| Metric | before | after | Δ |
|--------|--------|-------|---|
| files | 1075 | 988 | **−87** (the embedded .d.ts) |
| gzip tarball | 1,805,318 B | 1,750,161 B | **−55,157 B (−3.05%)** |
| unpacked | 7.5 MB | 6.9 MB | −589K |

Behavior-neutral: `verify:package-boundary:dist` green (embed still resolves),
`--list-models` loads the embedded ai registry, `verify:quality`/`verify:dip`
green. Bigger size lever remaining is dist `.js` minify (BR04 transpile/minify-only,
separate risk decision).

## Handoff

P7 can be treated as closed for the current refactor branch once:

- BR01 guard passes on the release machine.
- fresh beta install has no extension/package load errors.
- maintainers accept that BR02-BR04 are gated follow-up work, not current-scope blockers.
