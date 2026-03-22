import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

const PACKAGES_TO_BUNDLE = ["mem-core", "soul-core"];

function bundleDependencies() {
  const distDir = path.join(process.cwd(), "dist");
  const packagesDir = path.join(process.cwd(), "packages");

  console.log("📦 Bundling mem-core and soul-core packages...\n");

  for (const pkg of PACKAGES_TO_BUNDLE) {
    const srcDir = path.join(packagesDir, pkg);
    const destDir = path.join(distDir, "packages", pkg);

    // Check if source exists
    if (!fs.existsSync(srcDir)) {
      console.warn(`⚠️  Package ${pkg} not found in ${srcDir}, skipping...`);
      continue;
    }

    console.log(`Processing ${pkg}...`);

    // Check if dist already exists (skip build if already built)
    const distPath = path.join(srcDir, "dist");
    if (fs.existsSync(distPath)) {
      console.log(`  📋 dist already exists, skipping build...`);
    } else {
      // Build the package first
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
