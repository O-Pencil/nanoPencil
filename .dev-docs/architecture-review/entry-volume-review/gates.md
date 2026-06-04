# Entry & Volume Gates

```yaml
gate_set: entry-volume
inherits:
  - ../execution-plan/gates.md#门组-b
applies_to:
  - main.ts
  - modes/index.ts
  - modes/* entry files
  - extensions/builtin/browser
  - extensions/optional/browser
  - core/lib/ai/src
  - package.json
  - scripts/build and copy assets
```

## Hard Gates

| Gate | Rule | Validation |
|------|------|------------|
| EV-G0 Top-level calibration | Every P6 slice must classify itself as entry dispatch / optional capability / provider loading / package surface / measurement | review doc / PR notes |
| EV-G1 P5 conflict boundary | No P6 code change may touch P5-active interactive files until P5 owner confirms stability | `git status` + changed-file review |
| EV-G2 One selected mode cost | Runtime dispatch must not eager import unselected heavy modes | import graph review; cold-start validation on capable machine |
| EV-G3 CLI behavior preservation | Existing CLI flags and mode selection semantics remain identical unless GB-2 states otherwise | mode smoke: interactive/print/rpc/acp |
| EV-G4 Public surface stability | Root exports, package `files`, bin entries, and subpath exports cannot be narrowed by accident; Q3/P8 owns SDK narrowing | public API snapshot / package diff |
| EV-G5 Browser opt-in fallback | If browser leaves builtin default load, the user gets a clear install/enable/status path; missing browser package must not break normal startup | Q2 decision + `/browser` path smoke |
| EV-G6 Provider behavior neutrality | Lazy provider/model loading must preserve model availability, API-key/OAuth fallback, custom providers, token usage reporting, and error messages | provider matrix smoke on capable machine |
| EV-G7 Token neutrality | P6 must not change prompt/context/tool result/model request payloads or token accounting | diff review + provider smoke |
| EV-G8 Performance evidence | Cold-start and dist-size claims need repeatable measurements against P0/P6 baselines; no performance claim from low-performance machines | measurement log |
| EV-G9 Reversibility | Each P6 slice must be independently revertible: mode lazy, browser opt-in, provider lazy are separate commits | commit scope review |
| EV-G10 DIP isomorphism | New entry/provider/optional package files need P3 headers; module maps updated when file membership changes | P2/P3 review |

## Review Questions

1. Which cost moved, and from whose startup/install path?
2. Is this entry dispatch, optional capability, provider loading, package surface, or measurement?
3. Does this touch a P5-active file?
4. Does the change affect public imports, `package.json files`, bins, or subpaths?
5. What happens when the optional dependency is missing?
6. What happens when a provider is configured only through env/auth/OAuth/custom provider config?
7. Which mode smokes prove behavior preservation?
8. Which metric proves the performance/size claim, and on which machine?

## Low-Performance Machine Policy

Allowed here:

- `rg`, `sed`, `git diff`, `git diff --check`, `git status`
- import graph inspection by text search
- documentation edits

Requires maintainer/capable machine:

- `npm install`
- `npm run build`
- full mode smoke
- cold-start timing
- dist-size measurement
- provider runtime smoke
