/**
 * Loop extension: /loop 定时任务（会话级，关闭/重载扩展时销毁）。
 * 规格见 docs/循环命令计划.md
 */

import type { ExtensionAPI, ExtensionCommandContext } from "../../../core/extensions/types.js";
import type { EventBus } from "../../../core/runtime/event-bus.js";
import { formatInterval, parseLoopCommand } from "./loop-parser.js";
import { LoopScheduler } from "./loop-scheduler.js";
import type { LoopTask } from "./loop-types.js";

/** 按会话 EventBus 隔离：同一进程多 AgentSession / 多次 loadExtensions 时避免共用模块级单例 */
const schedulersByBus = new WeakMap<EventBus, LoopScheduler>();
const notifyByBus = new WeakMap<EventBus, (msg: string, type?: "info" | "warning" | "error") => void>();

function summarizePrompt(p: string, max = 56): string {
	const t = p.trim();
	if (t.length <= max) return t;
	return `${t.slice(0, max - 3)}...`;
}

function formatExpiresAt(ts: number): string {
	try {
		return new Date(ts).toLocaleString();
	} catch {
		return String(ts);
	}
}

function buildHelp(reason?: string): string {
	const lines: string[] = [];
	if (reason) lines.push(`[Loop] ${reason}`);
	lines.push(
		"[Loop] 用法:",
		"  /loop <提示词>                     默认每 10 分钟",
		"  /loop 30m <提示词>               每 30 分钟",
		"  /loop <提示词> every 2h          每 2 小时",
		"  /loop list                       列出任务",
		"  /loop delete <taskId>            删除任务",
		"  /loop clear                      清除全部",
		"",
		"间隔单位: s / m / h / d，最小 1 分钟（秒会向上取整到整分）。",
	);
	return lines.join("\n");
}

function describeTask(t: LoopTask): string {
	const iv = formatInterval(t.intervalMs);
	const last = t.lastExecutedAt ? new Date(t.lastExecutedAt).toLocaleString() : "从未";
	return `  ${t.id}  每${iv}  已执行${t.executionCount}次  上次:${last}  到期:${formatExpiresAt(t.expiresAt)}\n    ${summarizePrompt(t.prompt, 72)}`;
}

export default async function loopExtension(pi: ExtensionAPI) {
	const bus = pi.events;

	function getScheduler(): LoopScheduler {
		let scheduler = schedulersByBus.get(bus);
		if (!scheduler) {
			scheduler = new LoopScheduler(
				{},
				async (task) => {
					const text = `[Loop Task ${task.id}] ${task.prompt}`;
					notifyByBus.get(bus)?.(`[Loop] 正在执行任务 ${task.id}：${summarizePrompt(task.prompt)}`, "info");
					// 始终传 followUp：Agent 忙碌时入队；空闲时 prompt 非流式分支仍会正常开 turn，且避免 isIdle 检测与发送之间的竞态
					pi.sendUserMessage(text, { deliverAs: "followUp" });
				},
				{
					onExpired: (task) => {
						notifyByBus.get(bus)?.(`[Loop] 任务 ${task.id} 已到期并自动删除`, "info");
					},
				},
			);
			schedulersByBus.set(bus, scheduler);
		}
		return scheduler;
	}

	pi.on("session_shutdown", () => {
		schedulersByBus.get(bus)?.dispose();
		schedulersByBus.delete(bus);
		notifyByBus.delete(bus);
	});

	pi.registerCommand("loop", {
		description: "定时循环执行提示词（会话级；list / delete / clear）",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			if (ctx.ui.notify) {
				notifyByBus.set(bus, ctx.ui.notify.bind(ctx.ui));
			}

			const parsed = parseLoopCommand(args.trim());
			if (parsed.type === "help") {
				const reason =
					parsed.reason === "empty"
						? "缺少参数。"
						: parsed.reason === "bad_interval"
							? "无效的时间间隔。"
							: parsed.reason === "empty_prompt"
								? "提示词为空。"
								: parsed.reason === "interval_only"
									? "仅有间隔，缺少提示词。"
									: "";
				ctx.ui.notify?.(buildHelp(reason || undefined), "warning");
				return;
			}

			const sched = getScheduler();

			try {
				switch (parsed.type) {
					case "list": {
						const tasks = sched.list();
						if (tasks.length === 0) {
							ctx.ui.notify?.("[Loop] 当前没有调度任务", "info");
							return;
						}
						const body = tasks.map(describeTask).join("\n");
						ctx.ui.notify?.(`[Loop] 共 ${tasks.length} 个任务:\n${body}`, "info");
						break;
					}
					case "delete": {
						const ok = sched.delete(parsed.taskId);
						ctx.ui.notify?.(
							ok ? `[Loop] 已删除任务 ${parsed.taskId}` : `[Loop] 未找到任务 ${parsed.taskId}`,
							ok ? "info" : "warning",
						);
						break;
					}
					case "clear": {
						sched.clear();
						ctx.ui.notify?.("[Loop] 已清除所有任务", "info");
						break;
					}
					case "create": {
						const task = sched.create(parsed.prompt, parsed.intervalMs);
						const iv = formatInterval(task.intervalMs);
						ctx.ui.notify?.(
							`[Loop] 已创建任务 ${task.id}：每 ${iv} 执行一次 "${summarizePrompt(task.prompt)}"，到期 ${formatExpiresAt(task.expiresAt)}`,
							"info",
						);
						break;
					}
				}
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				ctx.ui.notify?.(`[Loop] ${msg}`, "error");
			}
		},
	});
}
