/**
 * [WHO]: MigrationManager class, handleMigration()
 * [FROM]: Depends on node:fs, node:path, node:os, chalk, config.ts
 * [TO]: Consumed by main.ts (migrate command)
 * [HERE]: core/agent-dir/migration-tool.ts - Safe copy-first migration from ~/.nanopencil and ~/.pencils to ~/.catui
 *
 * Design doc: docs/multi-agent-fs-design.md §12.2
 */

import { existsSync, mkdirSync, cpSync, readFileSync, appendFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import chalk from "chalk";

export interface MigrationOptions {
	dryRun: boolean;
	apply: boolean;
	copy: boolean; // default true
}

export interface MigrationTask {
	id: string;
	source: string;
	target: string;
	label: string;
	description: string;
}

export class MigrationManager {
	private readonly legacyNanoRoot: string;
	private readonly legacyPencilsRoot: string;
	private readonly newRoot: string;
	private readonly migrationLogPath: string;

	constructor(homeDir: string = homedir()) {
		this.legacyNanoRoot = join(homeDir, ".nanopencil");
		this.legacyPencilsRoot = join(homeDir, ".pencils");
		this.newRoot = join(homeDir, ".catui");
		this.migrationLogPath = join(this.newRoot, ".migrations", "applied.jsonl");
	}

	async run(options: MigrationOptions): Promise<void> {
		console.log(chalk.bold("\nCatui Data Migration Tool"));
		console.log(chalk.dim("---------------------------------"));
		console.log(`Source: ${chalk.cyan(this.legacyNanoRoot)} / ${chalk.cyan(this.legacyPencilsRoot)}`);
		console.log(`Target: ${chalk.cyan(this.newRoot)}`);
		console.log(`Mode:   ${options.dryRun ? chalk.yellow("Dry Run (Preview Only)") : chalk.green("Apply Changes")}`);
		console.log(`Method: ${options.copy ? "Copy (Safe)" : "Move"}\n`);

		const tasks = this.plan();

		if (tasks.length === 0) {
			console.log(chalk.green("No migration tasks found. Your data is already in the new format or no legacy data was detected."));
			return;
		}

		console.log(chalk.bold("Migration Tasks:"));
		for (const task of tasks) {
			console.log(`  ${chalk.blue("-")} ${task.label}`);
			console.log(`    ${chalk.dim("From:")} ${task.source}`);
			console.log(`    ${chalk.dim("To:  ")} ${task.target}`);
		}

		if (options.dryRun) {
			console.log(chalk.yellow("\n[!] This was a dry run. No files were changed."));
			console.log(`Run with ${chalk.bold("--apply")} to execute the migration.`);
			return;
		}

		console.log(chalk.bold("\nExecuting migration..."));
		for (const task of tasks) {
			try {
				this.execute(task, options.copy);
				console.log(`${chalk.green("[ok]")} Migrated: ${task.label}`);
				this.logMigration(task);
			} catch (err) {
				console.error(chalk.red(`[fail] Failed to migrate ${task.label}: ${err instanceof Error ? err.message : err}`));
			}
		}

		console.log(chalk.green.bold("\nMigration complete!"));
		console.log(`Legacy data is preserved in ${chalk.cyan(this.legacyNanoRoot)} and ${chalk.cyan(this.legacyPencilsRoot)} for backup.`);
		console.log("You can safely delete it after verifying your data in the new environment.");
	}

	/**
	 * Check if any migration is currently needed (legacy data exists and hasn't been migrated).
	 */
	isMigrationNeeded(): boolean {
		return this.plan().length > 0;
	}

	/**
	 * Run migration silently (no preview, direct apply) and return the list of migrated labels.
	 */
	runSilent(): string[] {
		const tasks = this.plan();
		const migrated: string[] = [];

		for (const task of tasks) {
			try {
				this.execute(task, true);
				this.logMigration(task);
				migrated.push(task.label);
			} catch {
				// Silent fail
			}
		}

		return migrated;
	}

	private plan(): MigrationTask[] {
		const tasks: MigrationTask[] = [];

		// Task 1: Main legacy Catui agent directory
		const legacyAgentDir = join(this.legacyNanoRoot, "agent");
		const newDefaultAgentDir = join(this.newRoot, "agents", "default");

		if (existsSync(legacyAgentDir) && (!this.isAlreadyApplied("nano-agent-to-default") || !existsSync(newDefaultAgentDir))) {
			tasks.push({
				id: "nano-agent-to-default",
				source: legacyAgentDir,
				target: newDefaultAgentDir,
				label: "Global Agent Data",
				description: "Main configuration, sessions, memory, and soul data.",
			});
		}

		// Task 2: Workspaces (browser-workspace, link-world-workspace)
		const workspaces = ["browser-workspace", "link-world-workspace"];
		for (const ws of workspaces) {
			const source = join(this.legacyNanoRoot, ws);
			const target = join(this.newRoot, "workspaces", ws);
			const taskId = `nano-ws-${ws}`;
			if (existsSync(source) && (!this.isAlreadyApplied(taskId) || !existsSync(target))) {
				tasks.push({
					id: taskId,
					source,
					target,
					label: `Workspace: ${ws}`,
					description: "Global extension workspace data.",
				});
			}
		}

		// Task 3: Other dot-prefixed directories in legacy root (excluding agent and workspaces handled above)
		try {
			if (existsSync(this.legacyNanoRoot)) {
				const entries = readdirSync(this.legacyNanoRoot, { withFileTypes: true });
				for (const entry of entries) {
					if (entry.isDirectory() && !workspaces.includes(entry.name) && entry.name !== "agent") {
						const source = join(this.legacyNanoRoot, entry.name);
						const target = join(this.newRoot, entry.name);
						const taskId = `nano-dir-${entry.name}`;
						if (!this.isAlreadyApplied(taskId) || !existsSync(target)) {
							tasks.push({
								id: taskId,
								source,
								target,
								label: `Legacy Directory: ${entry.name}`,
								description: "Additional legacy configuration or data.",
							});
						}
					}
				}
			}
		} catch {
			// Ignore read errors
		}

		// Task 4: Previous multi-agent Pencil root to Catui agents root.
		try {
			const legacyPencilAgentsRoot = join(this.legacyPencilsRoot, "agents");
			if (existsSync(legacyPencilAgentsRoot)) {
				const entries = readdirSync(legacyPencilAgentsRoot, { withFileTypes: true });
				for (const entry of entries) {
					if (!entry.isDirectory()) continue;
					if (entry.name.startsWith(".")) continue;
					const source = join(legacyPencilAgentsRoot, entry.name);
					const target = join(this.newRoot, "agents", entry.name);
					const taskId = `pencil-agent-${entry.name}`;
					if (!this.isAlreadyApplied(taskId) || !existsSync(target)) {
						tasks.push({
							id: taskId,
							source,
							target,
							label: `Catui Agent: ${entry.name}`,
							description: "Previous multi-agent Pencil ecosystem data.",
						});
					}
				}
			}
		} catch {
			// Ignore read errors
		}

		return tasks;
	}

	private execute(task: MigrationTask, copy: boolean): void {
		const targetDir = dirname(task.target);
		if (!existsSync(targetDir)) {
			mkdirSync(targetDir, { recursive: true });
		}

		if (copy) {
			cpSync(task.source, task.target, { recursive: true });
		} else {
			// Move logic if requested (not default)
			// For simplicity in Phase 3, we stick to Copy-first as mandated
			cpSync(task.source, task.target, { recursive: true });
		}
	}

	private isAlreadyApplied(taskId: string): boolean {
		if (!existsSync(this.migrationLogPath)) return false;
		try {
			const content = readFileSync(this.migrationLogPath, "utf-8");
			return content.includes(`"taskId":"${taskId}"`);
		} catch {
			return false;
		}
	}

	private logMigration(task: MigrationTask): void {
		const logDir = dirname(this.migrationLogPath);
		if (!existsSync(logDir)) {
			mkdirSync(logDir, { recursive: true });
		}

		const entry = {
			timestamp: new Date().toISOString(),
			taskId: task.id,
			source: task.source,
			target: task.target,
		};
		appendFileSync(this.migrationLogPath, `${JSON.stringify(entry)}\n`);
	}
}
