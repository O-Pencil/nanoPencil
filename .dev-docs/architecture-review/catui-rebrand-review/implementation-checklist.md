# Catui Rebrand Implementation Checklist

```yaml
review_id: catui-rebrand-review
artifact: implementation-checklist
status: accepted
updated_at: 2026-06-13
```

## How To Use

Each item must move through:

```text
[x] pending -> [x] in progress -> [x] accepted
```

Do not mark an item accepted unless its local acceptance command or review check has passed. Remaining Pencil/catui matches must be classified as one of:

- legacy compatibility alias
- immutable history
- external future work

## Checklist

### 1. Package Identity

- [x] Rename main package from `@pencil-agent/nano-pencil` to `@catui/agent`.
  - Change: `package.json`, `package-lock.json`, npm badges, install docs.
  - Acceptance: `node -e "console.log(require('./package.json').name)"` prints `@catui/agent`.

- [x] Rename public first-party packages to `@catui/*`.
  - Change: `@pencil-agent/protocol`, `@pencil-agent/mem-core`, `@pencil-agent/soul-core`.
  - Acceptance: `rg -n "@pencil-agent/(protocol|mem-core|soul-core)" package.json package-lock.json packages tsconfig.json` returns only documented legacy compatibility references.

- [x] Decide private package scope policy for internal libs.
  - Change: either rename `@pencil-agent/ai`, `@pencil-agent/agent-core`, `@pencil-agent/tui` to `@catui/*`, or document why private package scope cleanup is deferred.
  - Acceptance: CR02/README contains the final decision and package-boundary checks pass.

- [x] Update workspace path aliases and local dev dependencies.
  - Change: `tsconfig.json`, workspace package manifests, test imports if package names change.
  - Acceptance: `npx tsc --noEmit` passes.

### 2. CLI And Process Identity

- [x] Make `catui` the canonical executable.
  - Change: `bin.catui`, CLI help, README quick start, update/reinstall prompts.
  - Acceptance: `node dist/cli.js --help` shows `Usage: catui`.

- [x] Keep or remove legacy `catui` bin by explicit policy.
  - Change: if kept, mark as deprecated compatibility alias; if removed, document breaking change.
  - Acceptance: `package.json` bin map matches CR03 policy.

- [x] Replace process titles, temp prefixes, and user-visible labels.
  - Change: `process.title`, temp filenames, logs, startup banners.
  - Acceptance: `rg -n "catui|catui|catui" cli.ts main.ts modes core utils` has no unclassified active matches.

### 3. Runtime Config And Filesystem

- [x] Make `~/.catui` the canonical global root.
  - Change: `config.ts`, path comments, UI path hints.
  - Acceptance: `node --import tsx -e "import { getAgentDir } from './config.ts'; console.log(getAgentDir())"` prints a path under `~/.catui/agents/default`.

- [x] Add canonical Catui env vars.
  - Change: `CATUI_HOME`, `CATUI_AGENTS_DIR`, `CATUI_CODING_AGENT_DIR`, plus debug/profile/offline equivalents as needed.
  - Acceptance: env override smoke tests prove `CATUI_*` wins over defaults.

- [x] Keep old env vars only as legacy aliases.
  - Change: `PENCILS_*`, `CATUI_*` reads stay centralized and commented.
  - Acceptance: compatibility tests cover at least `CATUI_CODING_AGENT_DIR` and `PENCILS_HOME`.

- [x] Update migration tool to copy from old roots to `~/.catui`.
  - Change: `core/agent-dir/migration-tool.ts`.
  - Acceptance: dry-run fixture test shows `~/.catui/agent -> ~/.catui/agents/default` and `~/.pencils/agents/<id> -> ~/.catui/agents/<id>`.

- [x] Decide project-local dot directory policy.
  - Change: `.catui` project-local dirs in sub-agent/task/loop storage either become `.catui` or are classified as legacy read aliases.
  - Acceptance: `rg -n "\\.catui|\\.pencils" core extensions modes test` returns only migration/legacy compatibility matches.

### 4. Public SDK And API Names

- [x] Decide `PencilAgent` public symbol policy.
  - Change: either rename to `CatuiAgent` with compatibility export, or keep as a deprecated alias only.
  - Acceptance: migration guide states import path and symbol changes.

- [x] Update public export headers and docs.
  - Change: `index.ts`, `runtime.ts`, `session.ts`, `models.ts`, `tools.ts`, API docs.
  - Acceptance: `rg -n "@pencil-agent/nano-pencil|PencilAgent" index.ts runtime.ts session.ts models.ts tools.ts docs README.md` returns only accepted compatibility mentions.

- [x] Update extension SDK import examples.
  - Change: examples from `@pencil-agent/nano-pencil` to `@catui/agent`.
  - Acceptance: `rg -n "@pencil-agent/nano-pencil" core/extensions-host docs README.md` returns only loader compatibility alias.

### 5. Extension Loader And Compatibility

- [x] Add `@catui/agent` as canonical extension virtual module.
  - Change: `core/extensions-host/loader.ts`.
  - Acceptance: extension smoke test imports from `@catui/agent`.

- [x] Keep `@pencil-agent/nano-pencil` loader alias only as legacy.
  - Change: alias comment and test.
  - Acceptance: one compatibility test proves old extension import still loads.

- [x] Update built-in extension labels and prompts.
  - Change: goal, debug, soul, token-save, browser/link-world messages where old brand appears.
  - Acceptance: `rg -n "catui|catui|catui|Pencil" extensions` has no unclassified active matches.

### 6. Runtime Identifiers

- [x] Rename diagnostic global keys.
  - Change: `Symbol.for("catui...")` to `catui...`, preserving old read bridge only if required.
  - Acceptance: diagnostics tests pass and scan has no unclassified `catui.diagnostic`.

- [x] Rename debug/profile/offline env vars.
  - Change: `CATUI_DEBUG`, `CATUI_PROFILE_STARTUP`, `CATUI_OFFLINE`, etc. to `CATUI_*`.
  - Acceptance: tests or smoke commands prove both canonical and legacy env behavior.

- [x] Rename HTML export meta names and URL param keys if user-visible.
  - Change: `catui-url-params`, `catui-share-base-url`, share viewer envs.
  - Acceptance: export tests pass and old keys are documented only if preserved for compatibility.

### 7. Defaults, Prompts, And Generated Files

- [x] Rename `catui-defaults.ts` and exported default symbols, or document staged internal cleanup.
  - Change: file name, imports, P3 headers, P2 member lists.
  - Acceptance: DIP passes.

- [x] Replace generated `.PENCIL.md` default with Catui naming.
  - Change: generated context filename/content policy.
  - Acceptance: fresh config smoke creates Catui-branded default context.

- [x] Update default user-facing error messages.
  - Change: startup auth prompts, missing model messages, update notices.
  - Acceptance: `rg -n "catui|catui|nano-pencil" catui-defaults.ts main.ts modes core` has only legacy compatibility matches.

### 8. Documentation And Charter

- [x] Update P1/P2/P3 active architecture docs.
  - Change: `AGENTS.md`, module `AGENT.md` files, P3 headers.
  - Acceptance: `npm run verify:dip` passes.

- [x] Update README, SECURITY, CONTRIBUTING, CODE_OF_CONDUCT.
  - Change: active user docs and links.
  - Acceptance: `rg -n "catui|catui|@pencil-agent|catui" README.md SECURITY.md CONTRIBUTING.md CODE_OF_CONDUCT.md` returns no unclassified active matches.

- [x] Update charter current-state docs or move them to historical status.
  - Change: `charter/` docs that currently define Pencil ecosystem terms.
  - Acceptance: charter either describes Catui or explicitly marks Pencil content as historical.

- [x] Preserve immutable history.
  - Change: do not bulk rewrite old changelog entries or issue reports unless they are current guidance.
  - Acceptance: remaining old-brand matches are classified in the final scan report.

### 9. Tests And Fixtures

- [x] Update test temp names and assertions.
  - Change: `catui-*` temp dirs, import names, expected prompts.
  - Acceptance: relevant test suites pass.

- [x] Add migration compatibility tests.
  - Change: tests for `~/.catui`, `~/.pencils`, legacy env aliases.
  - Acceptance: tests fail before migration code and pass after.

- [x] Add extension import compatibility tests.
  - Change: canonical `@catui/agent` and legacy `@pencil-agent/nano-pencil` import paths.
  - Acceptance: extension smoke covers both paths.

### 10. Final Gates

- [x] Run full brand scan.
  - Command: `rg -n "pencil|Pencil|PENCILS|CATUI|catui|catui|nano-pencil|@pencil-agent|\\.pencils|\\.catui" -S --glob '!dist/**' --glob '!node_modules/**'`.
  - Acceptance: every remaining match is listed as legacy compatibility, immutable history, or external future work.

- [x] Run DIP.
  - Command: `npm run verify:dip`.
  - Acceptance: pass.

- [x] Run quality.
  - Command: `npm run verify:quality`.
  - Acceptance: pass.

- [x] Run package boundary.
  - Command: `npm run verify:package-boundary`.
  - Acceptance: pass.

- [x] Run TypeScript.
  - Command: `npx tsc --noEmit`.
  - Acceptance: pass.

- [x] Run build.
  - Command: `npm run build`.
  - Acceptance: pass.

- [x] Run CLI smoke.
  - Command: `node dist/cli.js --help`.
  - Acceptance: help output uses `catui`.

- [x] Record final scan report.
  - Change: add closure note to this review with residual legacy aliases and deferred external repo renames.
  - Acceptance: reviewer can audit why every remaining old-brand match exists.

## Final Scan Report

Last checked: 2026-06-13

Commands accepted:

```bash
rg -n "pencil|Pencil|PENCILS|CATUI|catui|catui|nano-pencil|@pencil-agent|\.pencils|\.catui" -S --glob '!dist/**' --glob '!node_modules/**' --glob '!CHANGELOG.md' --glob '!issues/**' --glob '!.dev-docs/architecture-review/catui-rebrand-review/**'
npm run verify:dip
npm run verify:quality
npm run verify:package-boundary
npx tsc --noEmit
npm run build
node dist/cli.js --help
node --import tsx test/catui-migration-tool.test.ts
node --import tsx test/extension-loader-catui-aliases.test.ts
```

Residual old-brand matches are accepted only in these categories:

- Legacy filesystem migration sources: `core/agent-dir/migration-tool.ts` and `test/catui-migration-tool.test.ts` intentionally reference `~/.catui`, `~/.pencils`, and Pencil/catui labels so old user data can be copied into `~/.catui/agents/*`.
- Legacy environment aliases: `config.ts`, `core/package-manager.ts`, `core/platform/*`, `core/lib/*`, `utils/*`, `scripts/self-diagnosis/*`, and `extensions/builtin/plan/*` read `CATUI_*` or `PENCILS_*` only as fallback after the canonical `CATUI_*` variable.
- Legacy SDK and extension compatibility aliases: `core/runtime/catui-agent.ts` exports deprecated `PencilAgent` types; `core/extensions-host/loader.ts` keeps `@pencil-agent/nano-pencil` as an extension import alias.
- Immutable history remains outside this checklist scan in `CHANGELOG.md` and `issues/**`.
