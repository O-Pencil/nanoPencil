import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

// Packages to bundle to dist/packages/
const PACKAGES_TO_BUNDLE = ["mem-core", "soul-core"];

function bundleDependencies() {
  const distDir = path.join(process.cwd(), "dist");
  const packagesDir = path.join(process.cwd(), "packages");

  // Legacy copy target; zod is now shipped via package.json bundledDependencies (root node_modules/zod).
  const staleDistNm = path.join(distDir, "node_modules");
  if (fs.existsSync(staleDistNm)) {
    console.log("🧹 Removing stale dist/node_modules (zod is bundled at package root)...\n");
    fs.rmSync(staleDistNm, { recursive: true, force: true });
  }

  console.log("📦 Bundling packages...\n");

  // First, bundle mem-core and soul-core to dist/packages/
  for (const pkg of PACKAGES_TO_BUNDLE) {
    const srcDir = path.join(packagesDir, pkg);
    const destDir = path.join(distDir, "packages", pkg);

    // Check if source exists
    if (!fs.existsSync(srcDir)) {
      console.warn(`⚠️  Package ${pkg} not found in ${srcDir}, skipping...`);
      continue;
    }

    console.log(`Processing ${pkg}...`);

    const distPath = path.join(srcDir, "dist");
    const tsBuildInfoPath = path.join(srcDir, "tsconfig.tsbuildinfo");

    // Always rebuild bundled packages from a clean state. Incremental
    // TypeScript metadata can claim outputs are up to date even when dist
    // is incomplete, which leads to broken published tarballs.
    if (fs.existsSync(distPath)) {
      console.log(`  🧹 Removing stale dist...`);
      fs.rmSync(distPath, { recursive: true, force: true });
    }
    if (fs.existsSync(tsBuildInfoPath)) {
      console.log(`  🧹 Removing stale tsbuildinfo...`);
      fs.rmSync(tsBuildInfoPath, { force: true });
    }

    const pkgJsonPath = path.join(srcDir, "package.json");
    if (fs.existsSync(pkgJsonPath)) {
      try {
        console.log(`  🔨 Building ${pkg}...`);
        execSync("npm run build", {
          cwd: srcDir,
          stdio: "inherit",
        });
      } catch (error) {
        console.warn(`  ⚠️  Build failed or no build script: ${error}`);
      }
    }

    // Determine source directory (dist or root)
    const fromDir = fs.existsSync(path.join(srcDir, "dist"))
      ? path.join(srcDir, "dist")
      : srcDir;

    console.log(`  📋 Copying from ${fromDir} to ${destDir}...`);

    // Create destination and copy files
    copyDirectory(fromDir, destDir);

    // Create a minimal package.json for the bundled package
    const bundledPkgJson = {
      name: `@pencil-agent/${pkg}`,
      version: "1.0.0",
      private: true,
      type: "module",
      main: "./index.js",
      exports: {
        ".": "./index.js",
      },
    };
    fs.writeFileSync(
      path.join(destDir, "package.json"),
      JSON.stringify(bundledPkgJson, null, 2),
    );

    console.log(`  ✅ Bundled ${pkg}\n`);
  }

  console.log("✅ All packages bundled!");
}

function copyDirectory(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules, test, and directories we don't need
      if (
        entry.name === "node_modules" ||
        entry.name === "test" ||
        entry.name === "tests" ||
        entry.name === ".git"
      ) {
        continue;
      }
      copyDirectory(srcPath, destPath);
    } else {
      // Only copy .js, .d.ts, .json files
      if (
        entry.name.endsWith(".js") ||
        entry.name.endsWith(".d.ts") ||
        entry.name.endsWith(".json") ||
        entry.name === "LICENSE" ||
        entry.name === "README.md"
      ) {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}

bundleDependencies();
