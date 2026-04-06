import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

// Packages to bundle to dist/packages/
const PACKAGES_TO_BUNDLE = ["mem-core", "soul-core"];

// Critical dependencies that must be in top-level node_modules for peerDependency resolution
// These are dependencies of bundled packages that other packages (like @agentclientprotocol/sdk)
// declare as peerDependencies
const CRITICAL_DEPS = [
  "zod",
];

function bundleDependencies() {
  const distDir = path.join(process.cwd(), "dist");
  const packagesDir = path.join(process.cwd(), "packages");

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

  // Ensure critical dependencies are in dist/node_modules for peerDependency resolution
  bundleCriticalDependencies(distDir);
}

/**
 * Bundle critical dependencies that must be resolvable by peerDependency consumers.
 * This ensures packages like @agentclientprotocol/sdk (which declares zod as peerDependency)
 * can find these dependencies at runtime.
 */
function bundleCriticalDependencies(distDir) {
  const rootModulesDir = path.join(process.cwd(), "node_modules");
  const distModulesDir = path.join(distDir, "node_modules");

  console.log("\n📦 Bundling critical dependencies for peerDependency resolution...\n");

  for (const dep of CRITICAL_DEPS) {
    const srcDepDir = path.join(rootModulesDir, dep);
    const destDepDir = path.join(distModulesDir, dep);

    if (!fs.existsSync(srcDepDir)) {
      console.warn(`  ⚠️  Dependency ${dep} not found in node_modules, skipping...`);
      continue;
    }

    console.log(`  📋 Copying ${dep} to dist/node_modules/...`);

    // Create destination
    if (!fs.existsSync(destDepDir)) {
      fs.mkdirSync(destDepDir, { recursive: true });
    }

    // Copy package.json
    const pkgJsonPath = path.join(srcDepDir, "package.json");
    if (fs.existsSync(pkgJsonPath)) {
      fs.copyFileSync(pkgJsonPath, path.join(destDepDir, "package.json"));
    }

    // Copy README and LICENSE if they exist
    for (const file of ["README.md", "LICENSE"]) {
      const srcFile = path.join(srcDepDir, file);
      if (fs.existsSync(srcFile)) {
        fs.copyFileSync(srcFile, path.join(destDepDir, file));
      }
    }

    // Copy main entry point and type definitions
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
    const mainFiles = [];

    // Add main entry
    if (pkgJson.main) {
      mainFiles.push(pkgJson.main);
    }
    // Add types
    if (pkgJson.types || pkgJson.typings) {
      mainFiles.push(pkgJson.types || pkgJson.typings);
    }
    // Add exports
    if (pkgJson.exports) {
      if (typeof pkgJson.exports === "string") {
        mainFiles.push(pkgJson.exports);
      } else if (pkgJson.exports["."]) {
        const exp = pkgJson.exports["."];
        if (typeof exp === "string") {
          mainFiles.push(exp);
        } else if (exp.import) {
          mainFiles.push(exp.import);
        }
      }
    }

    // Copy the main directory structure (src, lib, v4, etc.)
    for (const entry of fs.readdirSync(srcDepDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const srcDir = path.join(srcDepDir, entry.name);
        const destDir = path.join(destDepDir, entry.name);

        // Skip test directories
        if (entry.name === "test" || entry.name === "tests") {
          continue;
        }

        copyDirectory(srcDir, destDir);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        // Copy JS, TS definition, and JSON files
        if (ext === ".js" || ext === ".mjs" || ext === ".cjs" ||
            ext === ".d.ts" || ext === ".d.mts" || ext === ".d.cts" ||
            ext === ".json") {
          fs.copyFileSync(path.join(srcDepDir, entry.name), path.join(destDepDir, entry.name));
        }
      }
    }

    console.log(`  ✅ Bundled ${dep}\n`);
  }

  console.log("✅ All critical dependencies bundled!");
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
