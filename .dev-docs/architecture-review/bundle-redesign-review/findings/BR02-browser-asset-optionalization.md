# BR02: Browser Assets Are The Largest Real Install-Size Lever

```yaml
id: BR02
status: recalibrated-ux-first
severity: structural
classification: optional capability
scope:
  - extensions/builtin/browser
  - scripts/copy-assets.js
  - package.json files
  - browser opt-in UX
```

## Problem

P6 made browser registration optional, but the physical Browser Harness assets still ship with the host package. That means non-browser users no longer pay startup registration cost, but still pay install/download size.

Current evidence:

- `builtInExtensions["browser"]` is `category: "optional"` and `defaultEnabled: false`.
- `getBuiltinExtensionPaths()` does not include browser in default load paths.
- `scripts/copy-assets.js` still copies `extensions/builtin/browser/**` into `dist`.
- `package.json` still whitelists `dist/**/*.py`, currently required only so the vendored Browser Harness package is published.
- Local source size is about `1.8M` for `extensions/builtin/browser`, mostly Python harness + markdown skills/workspace assets.
- `extensions/builtin/browser/index.ts` assumes assets are colocated via `__dirname`:
  - `src/` for `PYTHONPATH`
  - `agent-workspace/` for workspace seeding
  - `browser.md`, `install.md`, and `interaction-skills/` for resource discovery

The earlier P7 framing treated this primarily as a package-size problem. That is too narrow.

For browser, user experience is load-bearing:

- Browser automation is an important, user-visible capability, not incidental sample data.
- Package size mostly affects first install; splitting assets affects first **use**, where interruption is more visible.
- A separate "harness asset package" is conceptually leaky: the user does not want to install assets, they want to enable the Browser extension.
- If the capability is removed from the host tarball without a first-class extension install flow, `/browser` becomes a dead-end instruction instead of a smooth feature path.

Therefore BR02 must be judged by **extension capability UX first**, and package size second.

## Deletion Test

If browser assets are removed from the host tarball without a first-class replacement opt-in path, the complexity concentrates in users: browser commands break or become a second manual install step.

If we delete the "asset package" idea, the Browser extension remains coherent and the current user path remains smooth. That means the asset-package split is not load-bearing architecture; it is a size optimization that must wait for a stronger extension/package UX.

## Verdict

Browser is still a high-leverage size slice, but it is **not** safe to optimize as a raw asset-package split first. The correct boundary is the Browser extension capability, not the Browser Harness file tree.

## Options

| Option | Benefit | Cost/Risk |
|--------|---------|-----------|
| keep Browser extension bundled but optional | smoothest user path; no second install; Browser remains coherent as one extension | no install-size reduction |
| move Browser from `extensions/builtin/browser` to `extensions/optional/browser` only | clearer source taxonomy; no behavior or package-size claim | mostly naming/structure; still ships in host if copied |
| independent full browser extension package | cleanest package ownership once extension install UX exists | larger behavior/API change; explicit package-native extension loading is not yet mature |
| independent `@pencil-agent/browser-harness` asset package | host tarball shrinks | leaky concept; second install at first use; extension and assets version independently despite being one capability |
| lazy extract/download on first use | host install shrinks if asset not shipped | network/runtime installer complexity; worse privacy/offline story |
| keep shipped but optional registration | already landed behavior; no further package risk | no install-size reduction |

## Recommendation

Do **not** split `Browser Harness` into a standalone asset package now.

Treat Browser as one coherent extension capability:

```text
Browser extension
  owns: /browser command
  owns: browser and browser_admin tools
  owns: Python Browser Harness
  owns: browser skills and workspace seed
```

The package/distribution shape should follow the extension capability, not split below it.

Near-term recommendation:

- Keep Browser opt-in at registration/runtime level.
- Keep the full Browser extension bundled until there is a first-class extension install flow.
- Optionally move source from `extensions/builtin/browser` to `extensions/optional/browser` for conceptual clarity, but do not claim size reduction from that move.
- Preserve `/browser` as a smooth discovery path.

Future recommendation:

- If package size must be reduced, package the **whole Browser extension** as an optional extension package, not only its harness assets.
- That should happen with a user-facing command such as `catui extension install browser` or an equivalent config/package flow, so first use is guided and reversible.
- The user should never need to understand "asset package" vs "extension shell".

Do **not** add a browser package to host `dependencies` or `optionalDependencies`. npm installs optional dependencies by default, so that would not reduce default install size.

## Implementation Slice

### BR02-A: Taxonomy Hardening

- Define in docs and tests:
  - `extension` = pluggable user-facing capability with commands/tools/resources/lifecycle.
  - `package` = npm distribution/versioning unit.
  - A package may contain an extension, but packages are not automatically extensions.
- Browser is an extension capability. Browser Harness is an implementation asset inside that extension.

### BR02-B: Source Boundary Cleanup

- Keep Browser default-disabled.
- Consider moving `extensions/builtin/browser` to `extensions/optional/browser` because it is not default-loaded.
- Keep `copy-assets.js` behavior unchanged if the host still bundles optional extensions.
- Update paths/tests/docs only if the physical source move is accepted.

### BR02-C: Future Package Boundary

- Only when extension package UX exists, move the whole Browser extension to a package.
- The package should include extension code + harness assets together.
- Host keeps only `/browser` fallback and extension install guidance.
- Host tarball excludes browser assets only at that point.

## Rejected Moves

- Do not publish a raw `@pencil-agent/browser-harness` asset package as the first slice; it optimizes install size at the cost of first-use clarity.
- Do not publish any browser package as a host dependency; it defeats the size goal.
- Do not make first use download arbitrary network assets inside catui; that creates runtime/network/privacy complexity.
- Do not remove `/browser` fallback; it is the discovery path for users who have not installed the optional package.
- Do not claim token savings; this is install-size only and must not alter prompts/request payloads.

## Acceptance

- `catui` normal startup works without browser package.
- `/browser` remains smooth and does not require users to understand internal asset/package boundaries.
- explicit browser opt-in still loads full tools.
- if size reduction is claimed, dry-run package contents show the **whole Browser extension** moved out of host, not just harness assets.
- if source is moved to `extensions/optional/browser`, behavior remains equivalent and host package contents are explicitly documented.
- no prompt/context/tool payload changes outside browser opt-in paths.

## Validation

Low-performance machine:

- static diff review
- `node --test --import tsx test/browser-extension-registration.test.ts` if needed
- package manifest/path resolver checks that do not build

Capable/release machine:

- `npm run build`
- `npm publish --dry-run --tag beta` for host
- fresh host install + `catui -v`
- explicit browser opt-in + `/browser status`
