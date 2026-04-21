/**
 * Generates dist/build-meta.json with version + git info at build time.
 * Called as part of the "build" npm script.
 *
 * Output: { version, commitHash, branch, builtAt }
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const DIST = join(ROOT, "dist");

if (!existsSync(DIST)) mkdirSync(DIST, { recursive: true });

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));

function git(cmd) {
	try {
		return execSync(cmd, { cwd: ROOT, encoding: "utf-8", timeout: 5000 }).trim();
	} catch {
		return undefined;
	}
}

const meta = {
	version: pkg.version,
	commitHash: git("git rev-parse --short HEAD"),
	branch: git("git rev-parse --abbrev-ref HEAD"),
	builtAt: new Date().toISOString(),
};

const outPath = join(DIST, "build-meta.json");
writeFileSync(outPath, JSON.stringify(meta, null, 2), "utf-8");
console.log(`build-meta.json → ${outPath} (v${meta.version}, ${meta.commitHash ?? "no-git"})`);
