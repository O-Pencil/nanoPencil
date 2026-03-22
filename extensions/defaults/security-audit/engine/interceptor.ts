/**
 * Interceptor
 *
 * Handles the interception and user confirmation flow for dangerous operations.
 *
 * [POS]: Engine layer - implements interception mechanism
 */

import type { SecurityCheckResult, SecurityConfig, AuditEvent, AuditEventType } from "../interface.js";
import { DangerDetector } from "./detector.js";
import { AuditLogger } from "./logger.js";

/**
 * Interceptor Result
 */
export interface InterceptorResult {
	/** Whether to proceed with the operation */
	proceed: boolean;
	/** The audit event */
	event?: AuditEvent;
	/** Message to display to user */
	message?: string;
}

/**
 * Interceptor class
 */
export class Interceptor {
	private detector: DangerDetector;
	private logger: AuditLogger;
	private config: SecurityConfig;

	constructor(
		detector: DangerDetector,
		logger: AuditLogger,
		config: SecurityConfig,
	) {
		this.detector = detector;
		this.logger = logger;
		this.config = config;
	}

	/**
	 * Intercept a bash command
	 */
	interceptCommand(command: string, cwd: string): InterceptorResult {
		// Always log the command
		const checkResult = this.detector.checkCommand(command);

		const event = this.logger.log({
			type: "command",
			operation: "bash",
			target: command,
			cwd,
			level: checkResult.level,
			status: "allowed",
			reason: checkResult.reason,
			pattern: checkResult.pattern,
		});

		// Check if interception is enabled
		if (!this.config.enableInterception) {
			// Just return the result, no blocking
			return {
				proceed: true,
				event,
			};
		}

		// Handle based on mode
		switch (this.config.mode) {
			case "audit":
				// Just log, don't block
				return {
					proceed: true,
					event,
				};

			case "confirm":
				// Block dangerous operations until confirmed
				if (checkResult.level === "dangerous" && checkResult.requiresConfirm) {
					return {
						proceed: false,
						event: { ...event, status: "warning" },
						message: this.formatWarningMessage(command, checkResult),
					};
				}
				return {
					proceed: true,
					event,
				};

			case "strict":
				// Block everything except whitelist
				if (checkResult.level === "dangerous") {
					return {
						proceed: false,
						event: { ...event, status: "blocked" },
						message: this.formatBlockedMessage(command, checkResult),
					};
				}
				return {
					proceed: true,
					event,
				};

			default:
				return {
					proceed: true,
					event,
				};
		}
	}

	/**
	 * Intercept a file operation
	 */
	interceptFile(
		operation: "read" | "write" | "edit",
		path: string,
		cwd: string,
	): InterceptorResult {
		// Always log the operation
		const checkResult = this.detector.checkFileOperation(operation, path);

		const event = this.logger.log({
			type: `file_${operation}` as AuditEventType,
			operation,
			target: path,
			cwd,
			level: checkResult.level,
			status: "allowed",
			reason: checkResult.reason,
		});

		// Check if interception is enabled
		if (!this.config.enableInterception) {
			return {
				proceed: true,
				event,
			};
		}

		// Handle based on mode
		switch (this.config.mode) {
			case "audit":
				return {
					proceed: true,
					event,
				};

			case "confirm":
				if (checkResult.level === "dangerous" && checkResult.requiresConfirm) {
					return {
						proceed: false,
						event: { ...event, status: "warning" },
						message: this.formatFileWarningMessage(operation, path, checkResult),
					};
				}
				return {
					proceed: true,
					event,
				};

			case "strict":
				if (checkResult.level !== "safe") {
					return {
						proceed: false,
						event: { ...event, status: "blocked" },
						message: this.formatFileBlockedMessage(operation, path, checkResult),
					};
				}
				return {
					proceed: true,
					event,
				};

			default:
				return {
					proceed: true,
					event,
				};
		}
	}

	/**
	 * Format warning message for command
	 */
	private formatWarningMessage(command: string, result: SecurityCheckResult): string {
		return `⚠️  危险操作检测

命令: ${command}

风险: ${result.reason || "匹配危险模式"}

操作将被记录到审计日志中。`;
	}

	/**
	 * Format blocked message for command
	 */
	private formatBlockedMessage(command: string, result: SecurityCheckResult): string {
		return `🔴 操作被阻止

命令: ${command}

原因: ${result.reason || "安全策略阻止"}

此操作需要管理员权限或从白名单中移除。`;
	}

	/**
	 * Format warning message for file operation
	 */
	private formatFileWarningMessage(
		operation: string,
		path: string,
		result: SecurityCheckResult,
	): string {
		return `⚠️  敏感文件操作

操作: ${operation}
路径: ${path}

风险: ${result.reason || "文件包含敏感信息"}

操作将被记录到审计日志中。`;
	}

	/**
	 * Format blocked message for file operation
	 */
	private formatFileBlockedMessage(
		operation: string,
		path: string,
		result: SecurityCheckResult,
	): string {
		return `🔴 访问被拒绝

操作: ${operation}
路径: ${path}

原因: ${result.reason || "安全策略阻止对此文件的访问"}

此文件被安全策略保护。`;
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: SecurityConfig): void {
		this.config = config;
	}

	/**
	 * Update detector
	 */
	updateDetector(detector: DangerDetector): void {
		this.detector = detector;
	}
}
