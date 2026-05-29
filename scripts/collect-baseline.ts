/**
 * [WHO]: Provides collect-baseline CLI — gathers the 5 pre-refactor baseline metrics
 * [FROM]: Depends on typescript (compiler API), node:child_process, node:fs; uses npx madge on demand
 * [TO]: Consumed by maintainer on the `main` branch to fill execution-plan P0 Baseline Record
 * [HERE]: scripts/collect-baseline.ts — refactor characterization baseline collector
 *
 * Run ON THE BASELINE BRANCH (main), e.g.:
 *   git checkout main
 *   git checkout refactor/arch-candidate-d -- scripts/collect-baseline.ts
 *   npx tsx scripts/collect-baseline.ts          # add --build to also measure dist size
 *   # paste the printed YAML into execution-plan/P0-prepare.md Baseline Record,
 *   # then: git checkout -- scripts/collect-baseline.ts  (discard, keep main clean)
 *
 * Collects:
 *   1. baseline commit SHA + branch
 *   2. circular dependency count        (npx madge --circular --json)
 *   3. tsc --noEmit elapsed ms          (compile-time regression anchor)
 *   4. dist size MB                     (only with --build; F06/F07 volume anchor)
 *   5. public API symbol snapshot       (exports of root index.ts; behavior-unchanged hard anchor)
 */

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import * as ts from "typescript";

const REPO = process.cwd();
const OUT_DIR = resolve(REPO, ".baseline-out");
const PUBLIC_ENTRY = resolve(REPO, "index.ts");
const TSCONFIG = resolve(REPO, "tsconfig.json");
const WANT_BUILD = process.argv.includes("--build");

function sh(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function gitInfo(): { commit: string; branch: string } {
  try {
    return { commit: sh("git", ["rev-parse", "HEAD"]), branch: sh("git", ["rev-parse", "--abbrev-ref", "HEAD"]) };
  } catch {
    return { commit: "UNKNOWN", branch: "UNKNOWN" };
  }
}

function cycleCount(): number | string {
  try {
    const res = spawnSync("npx", ["--yes", "madge", "--circular", "--extensions", "ts,tsx", "--ts-config", TSCONFIG, "--json", "."], {
      cwd: REPO,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    // madge --circular --json prints an array of cycles (each cycle is an array of files)
    const json = JSON.parse(res.stdout || "[]");
    return Array.isArray(json) ? json.length : "PARSE_FAILED";
  } catch {
    return "MADGE_FAILED (run: npx madge --circular .)";
  }
}

function tscNoEmitMs(): { ms: number; exitCode: number } {
  const start = Date.now();
  const res = spawnSync("npx", ["--yes", "tsc", "--noEmit", "-p", TSCONFIG], {
    cwd: REPO,
    encoding: "utf8",
    stdio: ["ignore", "ignore", "ignore"],
  });
  return { ms: Date.now() - start, exitCode: res.status ?? -1 };
}

function distSizeMb(): number | string {
  if (!WANT_BUILD) return "SKIPPED (re-run with --build after `npm run build`)";
  const distDir = join(REPO, "dist");
  if (!existsSync(distDir)) return "NO_DIST (run `npm run build` first)";
  try {
    const bytes = parseInt(sh("du", ["-sb", distDir]).split(/\s+/)[0], 10);
    return Math.round((bytes / 1024 / 1024) * 100) / 100;
  } catch {
    return "DU_FAILED";
  }
}

function publicApiSymbols(): { count: number; names: string[] } {
  const configHost: ts.ParseConfigFileHost = {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: () => {},
  };
  const parsed = ts.getParsedCommandLineOfConfigFile(TSCONFIG, {}, configHost);
  const program = ts.createProgram({
    rootNames: [PUBLIC_ENTRY],
    options: { ...(parsed?.options ?? {}), noEmit: true, skipLibCheck: true },
  });
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(PUBLIC_ENTRY);
  if (!sf) return { count: 0, names: [] };
  const moduleSym = checker.getSymbolAtLocation(sf);
  if (!moduleSym) return { count: 0, names: [] };
  const names = checker
    .getExportsOfModule(moduleSym)
    .map((s) => s.getName())
    .sort((a, b) => a.localeCompare(b));
  return { count: names.length, names };
}

function main(): void {
  mkdirSync(OUT_DIR, { recursive: true });
  // Order: cheap/novel first, slow tool spawns (madge download, whole-repo tsc) last,
  // logging progress so a slow metric never hides the others.
  const { commit, branch } = gitInfo();
  console.error(`[1/5] git           commit=${commit.slice(0, 8)} branch=${branch}`);

  const symbols = publicApiSymbols();
  const symbolsPath = join(OUT_DIR, "public-api-symbols.txt");
  writeFileSync(symbolsPath, symbols.names.join("\n") + "\n", "utf8");
  console.error(`[2/5] public symbols ${symbols.count} exports`);

  const dist = distSizeMb();
  console.error(`[3/5] dist size      ${dist}`);

  console.error(`[4/5] tsc --noEmit   (timing whole-repo compile, may take a while)…`);
  const tsc = tscNoEmitMs();
  console.error(`        → ${tsc.ms}ms (exit ${tsc.exitCode})`);

  console.error(`[5/5] madge circular (npx may download on first run)…`);
  const cycles = cycleCount();
  console.error(`        → ${cycles}`);

  const yaml = [
    "# --- paste into execution-plan/P0-prepare.md Baseline Record ---",
    `llm_wiki_baseline_commit: ${commit}`,
    `cycle_count_before: ${cycles}`,
    `tsc_no_emit_ms: ${tsc.ms}        # tsc exit ${tsc.exitCode}`,
    `dist_size_mb: ${dist}`,
    `public_api_symbols_count: ${symbols.count}`,
    `public_api_symbols_snapshot: .baseline-out/public-api-symbols.txt`,
    `recorded_at: ${new Date().toISOString()}`,
    `recorded_on_branch: ${branch}`,
  ].join("\n");

  const yamlPath = join(OUT_DIR, "baseline.yaml");
  writeFileSync(yamlPath, yaml + "\n", "utf8");

  console.log(yaml);
  console.log(`\n# symbols → ${symbolsPath} (${symbols.count} exported names)`);
  console.log(`# yaml    → ${yamlPath}`);
  if (branch !== "main") console.log(`\n# ⚠️  current branch is "${branch}", not "main" — baseline should be taken on the frozen main branch.`);
}

main();
