/**
 * [WHO]: BuiltinExtension, getBuiltinExtensionPaths(), builtInExtensions
 * [FROM]: Depends on node:fs, node:path, config
 * [TO]: Consumed by main.ts, test files
 * [HERE]: builtin-extensions.ts - built-in extension registry for NanoPencil
 */

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/** Built-in extension paths */
const BUNDLED_NANOMEM_EXTENSION_PACKAGES = join(__dirname, "packages", "mem-core", "extension.js");
const BUNDLED_SIMPLIFY_EXTENSION = join(__dirname, "extensions", "optional", "simplify", "index.js");
const BUNDLED_LINK_WORLD_EXTENSION = join(__dirname, "extensions", "defaults", "link-world", "index.js");
const BUNDLED_SECURITY_AUDIT_EXTENSION = join(__dirname, "extensions", "defaults", "security-audit", "index.js");
const BUNDLED_SOUL_EXTENSION = join(__dirname, "extensions", "defaults", "soul", "index.js");
const BUNDLED_PRESENCE_EXTENSION = join(__dirname, "extensions", "defaults", "presence", "index.js");
const BUNDLED_INTERVIEW_EXTENSION = join(__dirname, "extensions", "defaults", "interview", "index.js");
const BUNDLED_LOOP_EXTENSION = join(__dirname, "extensions", "defaults", "loop", "index.js");
const BUNDLED_SUBAGENT_EXTENSION = join(__dirname, "extensions", "defaults", "subagent", "index.js");
const BUNDLED_MCP_EXTENSION = join(__dirname, "extensions", "defaults", "mcp", "index.js");
const BUNDLED_EXPORT_HTML_EXTENSION = join(__dirname, "extensions", "optional", "export-html", "index.js");

/** Find package root from current module location (containing package.json with nano-pencil related name) */
function findPackageRoot(startDir: string): string | null {
	let dir = startDir;
	for (let i = 0; i < 20; i++) {
		try {
			const pkgPath = join(dir, "package.json");
			if (existsSync(pkgPath)) {
				const raw = readFileSync(pkgPath, "utf-8");
				const pkg = JSON.parse(raw) as { name?: string };
				if (pkg.name === "@pencil-agent/nano-pencil" || pkg.name === "nanopencil") return dir;
			}
		} catch {
			// ignore
		}
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return null;
}

/**
 * Get the list of built-in extension paths that NanoPencil loads by default
 *
 * Returns all default-enabled extension paths (defaults/):
 * - NanoMem (persistent memory)
 * - Soul (AI personality evolution)
 * - LinkWorld (internet search)
 * - SecurityAudit (security audit)
 * - MCP (MCP protocol adapter)
 *
 * Optional extensions need to be enabled via configuration:
 * - Simplify (code simplification) - extensions/optional/simplify/
 * - export-html (HTML export) - extensions/optional/export-html/
 */
export function getBuiltinExtensionPaths(): string[] {
	const paths: string[] = [];

	// === NanoMem extension ===
	// 1) Prefer extension bundled to dist/packages during build
	if (existsSync(BUNDLED_NANOMEM_EXTENSION_PACKAGES)) {
		paths.push(BUNDLED_NANOMEM_EXTENSION_PACKAGES);
	} else {
		// 2) require.resolve: mem-core in node_modules during development/local install
		try {
			const extPath = require.resolve("@pencil-agent/mem-core/extension.js");
			if (existsSync(extPath)) paths.push(extPath);
		} catch {
			// 3) Look for package root + node_modules/@pencil-agent/mem-core/dist/extension.js
			const packageRoot = findPackageRoot(__dirname);
			if (packageRoot) {
				const candidate = join(packageRoot, "node_modules", "@pencil-agent", "mem-core", "dist", "extension.js");
				if (existsSync(candidate)) paths.push(candidate);
			}
		}
	}

	// === Simplify extension (optional source, compiled to dist/extensions/optional/simplify) ===
	if (existsSync(BUNDLED_SIMPLIFY_EXTENSION)) {
		paths.push(BUNDLED_SIMPLIFY_EXTENSION);
	} else {
		// Development mode: try .ts source file
		const simplifyTs = join(__dirname, "extensions", "optional", "simplify", "index.ts");
		if (existsSync(simplifyTs)) paths.push(simplifyTs);
	}

	// === link-world extension (built-in source, compiled to dist/extensions/defaults/link-world) ===
	if (existsSync(BUNDLED_LINK_WORLD_EXTENSION)) {
		paths.push(BUNDLED_LINK_WORLD_EXTENSION);
	} else {
		const linkWorldTs = join(__dirname, "extensions", "defaults", "link-world", "index.ts");
		if (existsSync(linkWorldTs)) paths.push(linkWorldTs);
	}

	// === Security Audit extension (built-in source, compiled to dist/extensions/defaults/security-audit) ===
	if (existsSync(BUNDLED_SECURITY_AUDIT_EXTENSION)) {
		paths.push(BUNDLED_SECURITY_AUDIT_EXTENSION);
	} else {
		const securityAuditTs = join(__dirname, "extensions", "defaults", "security-audit", "index.ts");
		if (existsSync(securityAuditTs)) paths.push(securityAuditTs);
	}

	// === Soul extension (personality evolution system) ===
	if (existsSync(BUNDLED_SOUL_EXTENSION)) {
		paths.push(BUNDLED_SOUL_EXTENSION);
	} else {
		const soulTs = join(__dirname, "extensions", "defaults", "soul", "index.ts");
		if (existsSync(soulTs)) paths.push(soulTs);
	}

	if (existsSync(BUNDLED_PRESENCE_EXTENSION)) {
		paths.push(BUNDLED_PRESENCE_EXTENSION);
	} else {
		const presenceTs = join(__dirname, "extensions", "defaults", "presence", "index.ts");
		if (existsSync(presenceTs)) paths.push(presenceTs);
	}

	// === Interview extension (requirement clarification) ===
	// Placed after Soul to ensure Interview probe sees both Mem + Soul style/systemPrompt injections.
	if (existsSync(BUNDLED_INTERVIEW_EXTENSION)) {
		paths.push(BUNDLED_INTERVIEW_EXTENSION);
	} else {
		const interviewTs = join(__dirname, "extensions", "defaults", "interview", "index.ts");
		if (existsSync(interviewTs)) paths.push(interviewTs);
	}

	// === Loop extension (/grub autonomous task, /loop scheduler) ===
	if (existsSync(BUNDLED_LOOP_EXTENSION)) {
		paths.push(BUNDLED_LOOP_EXTENSION);
	} else {
		const loopTs = join(__dirname, "extensions", "defaults", "loop", "index.ts");
		if (existsSync(loopTs)) paths.push(loopTs);
	}

	// === MCP extension (MCP tool protocol adapter) ===
	// Built-in SubAgent extension
	if (existsSync(BUNDLED_SUBAGENT_EXTENSION)) {
		paths.push(BUNDLED_SUBAGENT_EXTENSION);
	} else {
		const subagentTs = join(__dirname, "extensions", "defaults", "subagent", "index.ts");
		if (existsSync(subagentTs)) paths.push(subagentTs);
	}

	// Built-in MCP extension
	if (existsSync(BUNDLED_MCP_EXTENSION)) {
		paths.push(BUNDLED_MCP_EXTENSION);
	} else {
		const mcpTs = join(__dirname, "extensions", "defaults", "mcp", "index.ts");
		if (existsSync(mcpTs)) paths.push(mcpTs);
	}

	// === export-html extension (optional, HTML export functionality) ===
	if (existsSync(BUNDLED_EXPORT_HTML_EXTENSION)) {
		paths.push(BUNDLED_EXPORT_HTML_EXTENSION);
	} else {
		const exportHtmlTs = join(__dirname, "extensions", "optional", "export-html", "index.ts");
		if (existsSync(exportHtmlTs)) paths.push(exportHtmlTs);
	}

	return paths;
}

/**
 * @deprecated Use getBuiltinExtensionPaths() instead
 */
export function getNanopencilDefaultExtensionPaths(): string[] {
	return getBuiltinExtensionPaths();
}
