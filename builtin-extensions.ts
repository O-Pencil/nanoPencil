/**
 * [UPSTREAM]: Depends on node:fs, node:path, config
 * [SURFACE]: BuiltinExtension, getBuiltinExtensionPaths(), builtInExtensions
 * [LOCUS]: builtin-extensions.ts - built-in extension registry for NanoPencil
 * [COVENANT]: Change built-in extensions → update this header
 */

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/** 内置扩展路径 */
const BUNDLED_NANOMEM_EXTENSION_PACKAGES = join(__dirname, "packages", "mem-core", "extension.js");
const BUNDLED_SIMPLIFY_EXTENSION = join(__dirname, "extensions", "optional", "simplify", "index.js");
const BUNDLED_LINK_WORLD_EXTENSION = join(__dirname, "extensions", "defaults", "link-world", "index.js");
const BUNDLED_SECURITY_AUDIT_EXTENSION = join(__dirname, "extensions", "defaults", "security-audit", "index.js");
const BUNDLED_SOUL_EXTENSION = join(__dirname, "extensions", "defaults", "soul", "index.js");
const BUNDLED_INTERVIEW_EXTENSION = join(__dirname, "extensions", "defaults", "interview", "index.js");
const BUNDLED_LOOP_EXTENSION = join(__dirname, "extensions", "defaults", "loop", "index.js");
const BUNDLED_TEAM_EXTENSION = join(__dirname, "extensions", "defaults", "team", "index.js");
const BUNDLED_MCP_EXTENSION = join(__dirname, "extensions", "defaults", "mcp", "index.js");
const BUNDLED_EXPORT_HTML_EXTENSION = join(__dirname, "extensions", "optional", "export-html", "index.js");

/** 从当前模块位置向上查找包根（含 package.json 且 name 为 nano-pencil 相关） */
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
 * 获取 NanoPencil 默认加载的内置扩展路径列表
 *
 * 返回所有默认启用的扩展路径（defaults/）：
 * - NanoMem (持久化记忆)
 * - Soul (AI 人格进化)
 * - LinkWorld (联网搜索)
 * - SecurityAudit (安全审计)
 * - MCP (MCP 协议适配)
 *
 * 可选扩展需要通过配置启用：
 * - Simplify (代码简化) - extensions/optional/simplify/
 * - export-html (HTML 导出) - extensions/optional/export-html/
 */
export function getBuiltinExtensionPaths(): string[] {
	const paths: string[] = [];

	// === NanoMem 扩展 ===
	// 1) 优先使用 build 时打包到 dist/packages 的扩展
	if (existsSync(BUNDLED_NANOMEM_EXTENSION_PACKAGES)) {
		paths.push(BUNDLED_NANOMEM_EXTENSION_PACKAGES);
	} else {
		// 2) require.resolve：开发/本地安装时 node_modules 中的 mem-core
		try {
			const extPath = require.resolve("@pencil-agent/mem-core/extension.js");
			if (existsSync(extPath)) paths.push(extPath);
		} catch {
			// 3) 按包根 + node_modules/@pencil-agent/mem-core/dist/extension.js 查找
			const packageRoot = findPackageRoot(__dirname);
			if (packageRoot) {
				const candidate = join(packageRoot, "node_modules", "@pencil-agent", "mem-core", "dist", "extension.js");
				if (existsSync(candidate)) paths.push(candidate);
			}
		}
	}

	// === Simplify 扩展（可选源码，编译到 dist/extensions/optional/simplify） ===
	if (existsSync(BUNDLED_SIMPLIFY_EXTENSION)) {
		paths.push(BUNDLED_SIMPLIFY_EXTENSION);
	} else {
		// 开发模式：尝试 .ts 源文件
		const simplifyTs = join(__dirname, "extensions", "optional", "simplify", "index.ts");
		if (existsSync(simplifyTs)) paths.push(simplifyTs);
	}

	// === link-world 扩展（内置源码，编译到 dist/extensions/defaults/link-world） ===
	if (existsSync(BUNDLED_LINK_WORLD_EXTENSION)) {
		paths.push(BUNDLED_LINK_WORLD_EXTENSION);
	} else {
		const linkWorldTs = join(__dirname, "extensions", "defaults", "link-world", "index.ts");
		if (existsSync(linkWorldTs)) paths.push(linkWorldTs);
	}

	// === Security Audit 扩展（内置源码，编译到 dist/extensions/defaults/security-audit） ===
	if (existsSync(BUNDLED_SECURITY_AUDIT_EXTENSION)) {
		paths.push(BUNDLED_SECURITY_AUDIT_EXTENSION);
	} else {
		const securityAuditTs = join(__dirname, "extensions", "defaults", "security-audit", "index.ts");
		if (existsSync(securityAuditTs)) paths.push(securityAuditTs);
	}

	// === Soul 扩展（人格进化系统） ===
	if (existsSync(BUNDLED_SOUL_EXTENSION)) {
		paths.push(BUNDLED_SOUL_EXTENSION);
	} else {
		const soulTs = join(__dirname, "extensions", "defaults", "soul", "index.ts");
		if (existsSync(soulTs)) paths.push(soulTs);
	}

	// === Interview 扩展（需求澄清）===
	// Placed after Soul to ensure Interview probe sees both Mem + Soul style/systemPrompt injections.
	if (existsSync(BUNDLED_INTERVIEW_EXTENSION)) {
		paths.push(BUNDLED_INTERVIEW_EXTENSION);
	} else {
		const interviewTs = join(__dirname, "extensions", "defaults", "interview", "index.ts");
		if (existsSync(interviewTs)) paths.push(interviewTs);
	}

	// === Loop 扩展（/loop 定时任务）===
	if (existsSync(BUNDLED_LOOP_EXTENSION)) {
		paths.push(BUNDLED_LOOP_EXTENSION);
	} else {
		const loopTs = join(__dirname, "extensions", "defaults", "loop", "index.ts");
		if (existsSync(loopTs)) paths.push(loopTs);
	}

	// === MCP 扩展（MCP 工具协议适配） ===
	// Built-in team extension
	if (existsSync(BUNDLED_TEAM_EXTENSION)) {
		paths.push(BUNDLED_TEAM_EXTENSION);
	} else {
		const teamTs = join(__dirname, "extensions", "defaults", "team", "index.ts");
		if (existsSync(teamTs)) paths.push(teamTs);
	}

	// Built-in MCP extension
	if (existsSync(BUNDLED_MCP_EXTENSION)) {
		paths.push(BUNDLED_MCP_EXTENSION);
	} else {
		const mcpTs = join(__dirname, "extensions", "defaults", "mcp", "index.ts");
		if (existsSync(mcpTs)) paths.push(mcpTs);
	}

	// === export-html 扩展（可选，HTML 导出功能） ===
	if (existsSync(BUNDLED_EXPORT_HTML_EXTENSION)) {
		paths.push(BUNDLED_EXPORT_HTML_EXTENSION);
	} else {
		const exportHtmlTs = join(__dirname, "extensions", "optional", "export-html", "index.ts");
		if (existsSync(exportHtmlTs)) paths.push(exportHtmlTs);
	}

	return paths;
}

/**
 * @deprecated 请使用 getBuiltinExtensionPaths()
 */
export function getNanopencilDefaultExtensionPaths(): string[] {
	return getBuiltinExtensionPaths();
}
