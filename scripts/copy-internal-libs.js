import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const DIST_NODE_MODULES = join(ROOT, "dist", "node_modules", "@pencil-agent");

const INTERNAL_LIBS = [
	{ name: "ai", source: join(ROOT, "core", "lib", "ai") },
	{ name: "agent-core", source: join(ROOT, "core", "lib", "agent-core") },
	{ name: "tui", source: join(ROOT, "core", "lib", "tui") },
];

function ensureBuilt(lib) {
	const distDir = join(lib.source, "dist");
	const packageJsonPath = join(lib.source, "package.json");
	if (!existsSync(distDir)) {
		throw new Error(`Internal lib @pencil-agent/${lib.name} has no dist directory. Run build:deps first.`);
	}
	if (!existsSync(packageJsonPath)) {
		throw new Error(`Internal lib @pencil-agent/${lib.name} has no package.json.`);
	}
}

// These internal libs are embedded purely for runtime resolution (require.resolve
// → .js). The host's own type-check resolves them via the root node_modules
// workspace symlink to core/lib/* (the source libs, which keep their .d.ts), and
// consumers of @pencil-agent/nano-pencil resolve types from dist/index.d.ts — TS
// never looks inside this nested dist/node_modules. So declaration files and
// source maps add ~590K of dead weight to the published tarball. Strip them.
const RUNTIME_DROP_SUFFIXES = [".d.ts", ".d.ts.map", ".d.mts", ".d.cts", ".js.map", ".mjs.map", ".cjs.map", ".map"];

function isRuntimeNeeded(srcPath) {
	return !RUNTIME_DROP_SUFFIXES.some((suffix) => srcPath.endsWith(suffix));
}

function copyPackage(lib) {
	ensureBuilt(lib);

	const target = join(DIST_NODE_MODULES, lib.name);
	rmSync(target, { recursive: true, force: true });
	mkdirSync(target, { recursive: true });

	cpSync(join(lib.source, "dist"), join(target, "dist"), {
		recursive: true,
		// Keep directories; drop dev-only declaration/map files (runtime needs only .js + data assets).
		filter: (src) => isRuntimeNeeded(src),
	});

	const packageJson = JSON.parse(readFileSync(join(lib.source, "package.json"), "utf8"));
	delete packageJson.private;
	delete packageJson.scripts;
	delete packageJson.devDependencies;
	delete packageJson.files;
	delete packageJson.bin;
	normalizeExportsForRuntimeResolution(packageJson);
	writeFileSync(join(target, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
}

function normalizeExportsForRuntimeResolution(packageJson) {
	if (!packageJson.exports || typeof packageJson.exports !== "object") {
		return;
	}

	for (const [key, value] of Object.entries(packageJson.exports)) {
		if (!value || typeof value !== "object" || Array.isArray(value)) {
			continue;
		}
		if (typeof value.import === "string" && typeof value.default !== "string") {
			packageJson.exports[key] = { ...value, default: value.import };
		}
	}
}

for (const lib of INTERNAL_LIBS) {
	copyPackage(lib);
}

console.log("Internal runtime libs copied to dist/node_modules/");
