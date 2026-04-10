/**
 * [WHO]: SecurityAudit extension - audit logging and dangerous pattern detection
 * [FROM]: Depends on node:fs, node:path, node:crypto, node:os, core/extensions/types, ./interface
 * [TO]: Consumed by builtin-extensions.ts as default extension
 * [HERE]: extensions/defaults/security-audit/index.ts - security auditing for NanoPencil operations
 *
 * Features:
 * - Audit logging for all operations
 * - Dangerous pattern detection
 * - Optional interception for dangerous operations
 */


import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ToolExecutionStartEvent,
} from "../../../core/extensions/types.js";
import type { SecurityConfig, SecurityCheckResult, AuditEvent, LogQueryOptions, SecurityStats, SecurityLevel, AuditEventType, AuditEventStatus } from "./interface.js";
import { DEFAULT_SECURITY_CONFIG } from "./interface.js";

// ============================================================
// Types
// ============================================================

interface InterceptorResult {
	proceed: boolean;
	event?: AuditEvent;
	message?: string;
}

// ============================================================
// Utility Functions
// ============================================================

function generateId(): string {
	return randomBytes(8).toString("hex");
}

function expandHome(path: string): string {
	if (path.startsWith("~")) {
		return join(homedir(), path.slice(1));
	}
	return path;
}

function getLogPath(): string {
	const agentDir = process.env.NANOPENCIL_AGENT_DIR || join(homedir(), ".nanopencil", "agent");
	return join(agentDir, "security-audit.json");
}

function loadLogs(): AuditEvent[] {
	const logPath = getLogPath();
	try {
		if (existsSync(logPath)) {
			const content = readFileSync(logPath, "utf-8");
			const logs = JSON.parse(content);
			return Array.isArray(logs) ? logs : [];
		}
	} catch {
		// If error, return empty array
	}
	return [];
}

function saveLogs(logs: AuditEvent[]): void {
	const logPath = getLogPath();
	const dir = dirname(logPath);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	writeFileSync(logPath, JSON.stringify(logs, null, 2), "utf-8");
}

// ============================================================
// Danger Detector
// ============================================================

const DEFAULT_DANGEROUS_PATTERNS = [
	"rm\\s+-rf",
	"rmdir\\s+/s",
	"del\\s+/s",
	"sudo\\s+",
	"chmod\\s+777",
	"chown\\s+",
	"kill\\s+-9",
	"pkill\\s+-9",
	"killall\\s+",
	"curl\\s+.*\\|\\s*sh",
	"wget\\s+.*\\|\\s*sh",
	"git\\s+push\\s+--force",
	"git\\s+push\\s+-f",
	"docker\\s+rm\\s+-f",
	"docker\\s+run\\s+--rm",
	"systemctl\\s+stop",
	"systemctl\\s+restart",
];

const DEFAULT_SENSITIVE_PATHS = [
	"~/.ssh/",
	"~/.aws/",
	"~/.azure/",
	".env",
	".env.local",
	".env.production",
];

function checkDangerousCommand(command: string): SecurityCheckResult {
	const normalized = command.toLowerCase().trim();

	// Check dangerous patterns
	for (const pattern of DEFAULT_DANGEROUS_PATTERNS) {
		const regex = new RegExp(pattern, "i");
		if (regex.test(command)) {
			return {
				allowed: false,
				level: "dangerous",
				reason: `Command matches dangerous pattern: ${pattern}`,
				pattern,
				requiresConfirm: true,
			};
		}
	}

	return {
		allowed: true,
		level: "safe",
		reason: "Command appears safe",
	};
}

function checkSensitiveFile(path: string): SecurityCheckResult {
	const expanded = expandHome(path);

	for (const sensitive of DEFAULT_SENSITIVE_PATHS) {
		const expandedSensitive = expandHome(sensitive);
		if (expanded.includes(expandedSensitive)) {
			return {
				allowed: false,
				level: "dangerous",
				reason: `Path contains sensitive data: ${sensitive}`,
				requiresConfirm: true,
			};
		}
	}

	return {
		allowed: true,
		level: "safe",
	};
}

// ============================================================
// Audit Logger
// ============================================================

class AuditLogger {
	private logs: AuditEvent[] = [];

	constructor() {
		this.logs = loadLogs();
	}

	log(event: Omit<AuditEvent, "id" | "timestamp">): AuditEvent {
		const auditEvent: AuditEvent = {
			...event,
			id: generateId(),
			timestamp: new Date().toISOString(),
		};

		this.logs.push(auditEvent);

		// Keep only last 10000 entries
		if (this.logs.length > 10000) {
			this.logs = this.logs.slice(-10000);
		}

		saveLogs(this.logs);
		return auditEvent;
	}

	query(options?: LogQueryOptions): AuditEvent[] {
		let filtered = [...this.logs];

		if (options?.limit) {
			filtered = filtered.slice(-options.limit);
		}

		return filtered;
	}

	getStats(): SecurityStats {
		const byType: Record<AuditEventType, number> = {
			command: 0,
			file_read: 0,
			file_write: 0,
			file_edit: 0,
			network: 0,
			extension: 0,
			session_start: 0,
			session_end: 0,
		};

		const byLevel: Record<SecurityLevel, number> = {
			safe: 0,
			warning: 0,
			dangerous: 0,
		};

		const byStatus: Record<AuditEventStatus, number> = {
			allowed: 0,
			blocked: 0,
			warning: 0,
			confirmed: 0,
		};

		const patternCounts = new Map<string, number>();

		for (const log of this.logs) {
			if (log.type in byType) byType[log.type]++;
			if (log.level in byLevel) byLevel[log.level]++;
			if (log.status in byStatus) byStatus[log.status]++;
			if (log.pattern) {
				patternCounts.set(log.pattern, (patternCounts.get(log.pattern) || 0) + 1);
			}
		}

		const dangerousPatterns = Array.from(patternCounts.entries())
			.map(([pattern, count]) => ({ pattern, count }))
			.sort((a, b) => b.count - a.count)
			.slice(0, 10);

		return {
			totalEvents: this.logs.length,
			byType,
			byLevel,
			byStatus,
			dangerousPatterns,
			periodStart: this.logs[0]?.timestamp || new Date().toISOString(),
			periodEnd: this.logs[this.logs.length - 1]?.timestamp || new Date().toISOString(),
		};
	}

	clear(): void {
		this.logs = [];
		saveLogs([]);
	}

	exportJson(): string {
		return JSON.stringify(this.logs, null, 2);
	}
}

// ============================================================
// Security Audit Extension
// ============================================================

const SECURITY_MESSAGE_TYPE = "security-audit";

// Security mode: "audit" (warn only), "strict" (block dangerous)
const SECURITY_MODE = process.env.SECURITY_MODE as string || "strict";

const logger = new AuditLogger();

export default function securityAuditExtension(pi: ExtensionAPI) {
	// /security - Show security dashboard
	pi.registerCommand("security", {
		description: "Show security audit dashboard and logs",
		handler: async (_args: string, _ctx: ExtensionCommandContext) => {
			const stats = logger.getStats();
			const logs = logger.query({ limit: 20 });

			let content = `# 🔒 Security Audit\n\n`;
			content += `## Statistics\n`;
			content += `- Total Events: ${stats.totalEvents}\n`;
			content += `- Dangerous: ${stats.byLevel.dangerous}\n`;
			content += `- Warnings: ${stats.byLevel.warning}\n`;
			content += `- Blocked: ${stats.byStatus.blocked}\n\n`;

			if (stats.dangerousPatterns.length > 0) {
				content += `## Dangerous Patterns\n`;
				for (const p of stats.dangerousPatterns.slice(0, 5)) {
					content += `- \`${p.pattern}\`: ${p.count}\n`;
				}
				content += `\n`;
			}

			content += `## Recent Events\n`;
			content += `| Time | Type | Level | Target |\n`;
			content += `|------|------|-------|--------|\n`;
			for (const log of logs) {
				const time = log.timestamp.split("T")[1].split(".")[0];
				content += `| ${time} | ${log.type} | ${log.level} | \`${log.target.slice(0, 30)}...\` |\n`;
			}

			pi.sendMessage(
				{
					customType: SECURITY_MESSAGE_TYPE,
					content,
					display: true,
				},
				{ triggerTurn: false },
			);
		},
	});

	// /security-logs - Show detailed logs
	pi.registerCommand("security-logs", {
		description: "Show detailed security audit logs",
		handler: async (args: string, _ctx: ExtensionCommandContext) => {
			const limit = parseInt(args) || 50;
			const logs = logger.query({ limit });

			let content = `# Security Audit Logs (${logs.length} entries)\n\n`;

			for (const log of logs) {
				const icon = log.status === "blocked" ? "🔴" : log.level === "dangerous" ? "⚠️" : "✅";
				content += `${icon} [${log.timestamp}] ${log.type}: ${log.operation}\n`;
				content += `   Target: ${log.target}\n`;
				content += `   Level: ${log.level}, Status: ${log.status}\n`;
				if (log.reason) {
					content += `   Reason: ${log.reason}\n`;
				}
				content += "\n";
			}

			pi.sendMessage(
				{
					customType: SECURITY_MESSAGE_TYPE,
					content,
					display: true,
				},
				{ triggerTurn: false },
			);
		},
	});

	// /security-stats - Show statistics
	pi.registerCommand("security-stats", {
		description: "Show security audit statistics",
		handler: async (_args: string, _ctx: ExtensionCommandContext) => {
			const stats = logger.getStats();

			let content = `# Security Statistics\n\n`;
			content += `## Overview\n`;
			content += `- Period: ${stats.periodStart.split("T")[0]} ~ ${stats.periodEnd.split("T")[0]}\n`;
			content += `- Total Events: ${stats.totalEvents}\n\n`;

			content += `## By Level\n`;
			content += `- Safe: ${stats.byLevel.safe}\n`;
			content += `- Warning: ${stats.byLevel.warning}\n`;
			content += `- Dangerous: ${stats.byLevel.dangerous}\n\n`;

			content += `## By Status\n`;
			content += `- Allowed: ${stats.byStatus.allowed}\n`;
			content += `- Blocked: ${stats.byStatus.blocked}\n`;
			content += `- Confirmed: ${stats.byStatus.confirmed}\n\n`;

			if (stats.dangerousPatterns.length > 0) {
				content += `## Dangerous Patterns\n`;
				for (const p of stats.dangerousPatterns) {
					content += `- \`${p.pattern}\`: ${p.count}\n`;
				}
			}

			pi.sendMessage(
				{
					customType: SECURITY_MESSAGE_TYPE,
					content,
					display: true,
				},
				{ triggerTurn: false },
			);
		},
	});

	// /security-clear - Clear logs
	pi.registerCommand("security-clear", {
		description: "Clear security audit logs",
		handler: async (_args: string, _ctx: ExtensionCommandContext) => {
			logger.clear();
			pi.sendMessage(
				{
					customType: SECURITY_MESSAGE_TYPE,
					content: "✅ Security audit logs cleared.",
					display: true,
				},
				{ triggerTurn: false },
			);
		},
	});

	// Tool execution start - log all operations
	pi.on("tool_execution_start", async (event: ToolExecutionStartEvent) => {
		const toolName = event.toolName;
		const args = event.args || {};

		let level: SecurityLevel = "safe";
		let status: AuditEventStatus = "allowed";
		let reason: string | undefined;

		// Check bash commands
		if (toolName === "bash" || toolName === "Bash") {
			const command = args.command as string;
			if (command) {
				const result = checkDangerousCommand(command);
				level = result.level;
				reason = result.reason;
				if (result.level === "dangerous") {
					status = "warning";
				}

				logger.log({
					type: "command",
					operation: "bash",
					target: command,
					cwd: process.cwd(),
					level,
					status,
					reason,
					pattern: result.pattern,
				});

				// Handle dangerous commands based on mode
				if (result.level === "dangerous") {
					if (SECURITY_MODE === "strict") {
						// Strict mode: show blocking message
						pi.sendMessage(
							{
								customType: SECURITY_MESSAGE_TYPE,
								content: `🔴 SECURITY BLOCKED: ${result.reason}\n\nCommand: \`${command}\`\n\n❌ This command was BLOCKED for security reasons.\n\nDo NOT execute this command. Find an alternative safer approach or ask the user for confirmation before proceeding.`,
								display: true,
							},
							{ triggerTurn: true },
						);
					} else {
						// Audit mode: just warn
						pi.sendMessage(
							{
								customType: SECURITY_MESSAGE_TYPE,
								content: `⚠️  Security Warning: ${result.reason}\n\nCommand: \`${command}\`\n\nThis will be logged to security audit.`,
								display: true,
							},
							{ triggerTurn: true },
						);
					}
				}
			}
		}

		// Check file operations
		if (toolName === "write" || toolName === "Write" || toolName === "edit" || toolName === "Edit") {
			const filePath = args.file_path || args.path || args.filePath;
			if (filePath) {
				const result = checkSensitiveFile(filePath as string);
				level = result.level;
				reason = result.reason;
				if (result.level === "dangerous") {
					status = "blocked";
				}

				const operation = toolName === "write" || toolName === "Write" ? "write" : "edit";

				logger.log({
					type: `file_${operation}` as AuditEventType,
					operation,
					target: filePath as string,
					cwd: process.cwd(),
					level,
					status,
					reason,
				});

				// Block access to sensitive files
				if (result.level === "dangerous") {
					pi.sendMessage(
						{
							customType: SECURITY_MESSAGE_TYPE,
							content: `🔴 Security Blocked: ${result.reason}\n\nPath: \`${filePath}\``,
							display: true,
						},
						{ triggerTurn: true },
					);
				}
			}
		}
	});
}
