# Loop 扩展（`/loop`）

会话级定时任务：按间隔向当前 Agent 发送用户消息（前缀 `[Loop Task <id>]`），空闲直接触发 turn，忙碌时走 `followUp` 队列。

- 规格与语法：`docs/循环命令计划.md`
- 实现：`loop-parser.ts`、`loop-scheduler.ts`、`index.ts`
- 会话结束或 `/reload` 触发 `session_shutdown` 时会 `dispose` 调度器并清除定时器
- 调度器按 `pi.events`（EventBus）隔离，避免同一 Node 进程内多会话共用模块状态
- 定时触发统一使用 `sendUserMessage(..., { deliverAs: "followUp" })`：忙碌时入队，空闲时仍会走正常 `prompt` 开 turn，并避免与 `isIdle` 检测的竞态
