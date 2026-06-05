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

function copyPackage(lib) {
	ensureBuilt(lib);

	const target = join(DIST_NODE_MODULES, lib.name);
	rmSync(target, { recursive: true, force: true });
	mkdirSync(target, { recursive: true });

	cpSync(join(lib.source, "dist"), join(target, "dist"), { recursive: true });

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
