#!/usr/bin/env node
/**
 * [WHO]: CLI entry point, sets process.title, calls main()
 * [FROM]: Depends on main.ts
 * [TO]: Consumed by bin/nanopencil (npm binary)
 * [HERE]: Entry point; orchestrates argument parsing and mode selection
 */
process.title = "nanopencil";

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const args = process.argv.slice(2);

// Fast path: --version, --help don't need full module loading
if (args.includes("--version")) {
	const __filename = fileURLToPath(import.meta.url);
	const __dirname = dirname(__filename);
	// In dev, package.json is in project root; in bundle, it's two levels up from dist/cli.js
	const pkgPath = __dirname.endsWith("dist") ? join(__dirname, "..", "package.json") : join(__dirname, "package.json");
	const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
	console.log(pkg.version);
	process.exit(0);
}

if (args.includes("--help") || args.includes("-h")) {
	console.log(`nanoPencil AI coding agent`);
	console.log(`Usage: nanopencil [options]`);
	console.log(`       nanopencil [command] [options]`);
	console.log(`Options:`);
	console.log(`  --version    Show version`);
	console.log(`  --help, -h   Show this help`);
	process.exit(0);
}

import { main } from "./main.js";

main(args);
