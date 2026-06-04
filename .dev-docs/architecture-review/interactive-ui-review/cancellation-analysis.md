# cancellation / interrupt 专项评审（实施前）

```yaml
doc: cancellation-analysis
phase: P5
finding: gates.md#single-owner（Ctrl-C/D/Z + shutdown 信号；esc 单键多目标分派）
status: review
source:
  - modes/interactive/interactive-mode.ts::onEscape (main + 3 swap sites)
  - modes/interactive/interactive-mode.ts::handleCtrlC/handleCtrlD/handleCtrlZ
  - modes/interactive/interactive-mode.ts::shutdown/checkShutdownRequested
  - modes/interactive/interactive-mode.ts signal registration (SIGHUP/SIGTERM)
decision: SELECTED B（仅 interactive interrupt-controller；shutdown/信号留 mount；_shell deferred）— 2026-06-04
```

## 0. 前提

本评审是结构评审，目标是定**抽不抽、抽多少、哪些不能变**，不录 characterization。
与之前切片不同，本刀有两个新性质：

1. **跨 mode candidate**：gates 把 `Ctrl-C/D/Z + shutdown` 归 `modes/_shell/cancellation`（跨 mode），不是 interactive 内部 controller。这意味着可能新建 `modes/_shell/` 目录（新 P2 边界，FATAL-004 风险）。
2. **esc 单键多目标**：gates 明确 “mount 接线，分支委托各 owner”——esc 不应被某个 controller 独占。

## 1. 现象层：当前分布

### 1.1 状态字段（散落 mount）

| 字段 | 作用 |
|------|------|
| `lastEscapeTime` | 空编辑器双击 esc → tree/fork 的计时（<500ms）|
| `lastSigintTime` | 双击 Ctrl-C → shutdown 的计时（<500ms）|
| `shutdownRequested` | 扩展 `shutdownHandler` 设置的延迟退出标志；streaming 时不立即退，靠 `checkShutdownRequested` 补退 |
| `isShuttingDown` | `shutdown()` 重入保护 |
| `state.autoCompactionEscapeHandler` | 自动压缩期间保存的原 onEscape |
| `state.retryEscapeHandler` | 重试期间保存的原 onEscape |

### 1.2 esc 主分派（`onEscape`，单键多目标，按优先级）

```
loadingAnimation 在  → restoreQueuedMessagesToEditor({abort:true})   [queue owner]
else isStreaming     → agent.abort()                                  [cancellation/abort]
else isBashRunning   → session.abortBash()                            [bash]
else isBashMode      → 清 bash 模式（setText/flag/border）             [bash/editor]
else 编辑器空         → 双击 esc → tree/fork selector（按 setting）     [tree-overlay]
```

### 1.3 esc 的 **swap 模式**（关键复杂度）

`onEscape` **不是稳定单一函数**，被三处临时替换后再还原：

| Swap 点 | 保存到 | 替换为 | 还原点 |
|---------|--------|--------|--------|
| 手动压缩 `compact()` | 局部 `originalOnEscape` | `session.abortCompaction()` | `finally` |
| 自动压缩 | `state.autoCompactionEscapeHandler` | 自定义 | 压缩结束 / `agent_start` |
| 重试 | `state.retryEscapeHandler` | 自定义 | `agent_start`(2144) / 重试结束(2450) |

→ 任何 “cancellation controller 独占 onEscape” 的设计都会和这套 save/restore 打架。压缩/重试这两条流目前的 state 归属在**未抽的 UI04 render 层**（`handleEvent`/loader/retry），见 gates `handleEvent` deferred。

### 1.4 Ctrl / 信号 / shutdown

| 入口 | 行为 |
|------|------|
| `handleCtrlC` | 双击(<500ms)→shutdown；单击→clearEditor |
| `handleCtrlD`（编辑器空时由 CustomEditor 保证）| 直接 shutdown |
| `handleCtrlZ` | `ui.stop()` + `process.kill(0,SIGTSTP)`；`SIGCONT` 时 `ui.start()`+render |
| `SIGHUP`/`SIGTERM`（init 注册）| `shutdown()` |
| 扩展 `shutdownHandler` | 置 `shutdownRequested`；非 streaming 时立即 shutdown |
| `shutdown()` | emit `session_shutdown`(5s 超时守卫) → cleanupClipboardImages → nextTick → `terminal.drainInput(1000)` → `stop()` → 打印 resume 提示 → `process.exit(0)` |

## 2. 本质层：哪部分真的“跨 mode”

把 shutdown 拆开看：

- **真跨 mode 的薄壳**：进程信号注册（SIGHUP/SIGTERM/SIGTSTP/SIGCONT）+ 重入保护 + “优雅退出”编排骨架（emit shutdown → 清理 → exit）。
- **强 interactive 耦合的实体**：`ui.terminal.drainInput`、`ui.stop/start`、`statusContainer/chatContainer`、TUI resume 提示、bash/bashMode/loadingAnimation/queue/tree 的 esc 分派——这些都依赖 TUI。

结论：**shutdown 的“骨架”可跨 mode，“身体”是 interactive 的**。esc 分派整体是 interactive 的（依赖编辑器与 TUI 状态）。

## 3. 哲学层：风险与原则

- **过早抽象风险（calibration）**：现在只有 interactive 一个 consumer 真正实现了完整 shutdown 身体；print/rpc/acp 是否需要同款优雅退出尚无证据。把 `_shell/cancellation` 现在建大，等于在证据不足时造跨 mode service（calibration 明确反对）。
- **FATAL-004 风险**：新建 `modes/_shell/` 必须同时建 P2，否则模块边界在文档中不可见。
- **UI04 牵制**：esc 的 swap 模式（压缩/重试）依赖 UI04 deferred 的 render/retry 状态。在 UI04 之前强行把 esc 分派抽走，controller 会被迫拿 loadingAnimation/retry/compaction 句柄，重演 service-locator。
- **token-neutral**：本刀不涉及发给模型的内容（除 esc 触发 abort/steer 的既有语义），UI-G8 基本 N/A；**命门是 UI-G9 兼容**——每个键（esc 各分支、Ctrl-C 单/双、Ctrl-D、Ctrl-Z、SIGHUP/TERM、扩展延迟退出）必须仍达同一动作、同一时序。

## 4. 候选 controller 形状（若抽 interactive 侧）

`modes/interactive/controllers/interrupt-controller.ts`（**interactive**，非 `_shell`）

| Port | 能力 |
|------|------|
| `state` | get/set lastEscapeTime、lastSigintTime |
| `runtime` | isStreaming/isBashRunning、agent.abort、abortBash、abortCompaction |
| `queue` | loadingAnimation 在否、restoreQueuedMessagesToEditor |
| `bash` | isBashMode、清 bash 模式 |
| `editor` | getText、clearEditor |
| `tree` | showTreeSelector/showForkSelector + getDoubleEscapeAction |
| `lifecycle` | requestShutdown（→ mount 的 shutdown 编排）|

**onEscape 主体仍由 mount 接线**（gates 要求），mount 只判状态、转发到 controller 的 `dispatchEscape()`；swap 点继续用 state.* save/restore，但保存/还原的是 `controller.dispatchEscape` 这一稳定引用。

## 5. 死/重复点

- `checkShutdownRequested` 与 `shutdownHandler` 的 streaming 延迟退出是一对，必须一起处理，不能只搬一半。
- `lastEscapeTime`/`lastSigintTime` 是两套独立双击计时，勿合并语义。

## 6. 待决：scope（请 maintainer 选）

| 选项 | 抽什么 | 代价/收益 |
|------|--------|-----------|
| **A 全量** | 新建 `modes/_shell/` 放信号+shutdown 骨架 + interactive `interrupt-controller` | 收益：跨 mode shutdown DRY 就位；代价：证据不足的跨 mode 抽象 + 新 P2 + 与 UI04 swap 纠缠，最重 |
| **B 仅 interactive（建议）** | 只抽 `interrupt-controller`（esc 分派 + Ctrl-C/D/Z 分类），shutdown/信号**留 mount** | 收益：收敛 esc 多目标 + 双击计时 + Ctrl 分类，单 owner 清晰；`_shell` 等第二 mode 出现再抽（YAGNI）；代价：shutdown 仍在 mount |
| **C 整刀 defer** | 先做 #8 mount 退壳 / 等 UI04，再回头 | 收益：避开 swap×UI04 纠缠；代价：mount 仍背 esc/Ctrl/shutdown |

## 7. 验收矩阵（无论选 A/B）

| 场景 | 验收 |
|------|------|
| esc：loading 在 | 恢复排队消息到编辑器并 abort |
| esc：streaming | `agent.abort()` |
| esc：bash 运行 | `abortBash()` |
| esc：bash 模式 | 清模式 + 还原边框 |
| esc：空编辑器双击 | 按 setting → tree/fork；单击仅记时 |
| esc：压缩/重试期 | 仍走各自 swap handler（abortCompaction / 自定义），结束后还原主分派 |
| Ctrl-C 单/双 | 单→clearEditor+记时；双(<500ms)→shutdown |
| Ctrl-D（空编辑器）| shutdown |
| Ctrl-Z / SIGCONT | 挂起恢复 TUI 正常 |
| SIGHUP/SIGTERM | 优雅 shutdown（emit + 清理 + exit）|
| 扩展延迟退出 | streaming 时置 flag，结束补退 |
| shutdown 重入 | 第二次调用直接返回 |

## 8. 下一步

~~maintainer 在 §6 选 scope~~ → **已选 B**，已实施。

## 9. Resolution（B 落地，2026-06-04）

`modes/interactive/controllers/interrupt-controller.ts` 新建（6 组 port，零 import）：

- `dispatchEscape()`：§1.2 五分支优先级**逐字保留**；`lastEscapeTime` 双击计时移入 controller。
- `handleCtrlC()`：`lastSigintTime` 双击→`lifecycle.requestShutdown`、单击→`editor.clearEditor`，移入 controller。
- `handleCtrlD()` → `lifecycle.requestShutdown`；`handleCtrlZ()` → `lifecycle.suspend`。
- mount：`onEscape = () => this.interrupt.dispatchEscape()`；Ctrl 键位改指 `this.interrupt.*`；删 `handleCtrlC`/`handleCtrlD` 与 `lastEscapeTime`/`lastSigintTime` 两字段；`handleCtrlZ` body 改名为 mount `suspend()`（`lifecycle.suspend` port 实现）。

**留 mount（B 边界）**：`shutdown()` 优雅退出编排、`isShuttingDown` 重入保护、`SIGHUP`/`SIGTERM` 注册、`shutdownRequested`/`shutdownHandler`/`checkShutdownRequested` 扩展延迟退出、`suspend()` 的 TUI 机制。

**swap 模式无需改**：手动/自动压缩与重试三处 save/restore 的是 `this.defaultEditor.onEscape`，现在捕获的就是 `dispatchEscape` 闭包，存取语义不变。

**Gate**：UI-G1 无反向 import / UI-G2 命名能力闭包（含 lifecycle，不传 InteractiveMode）/ UI-G3 esc+Ctrl 单 owner（onEscape 仍 mount 接线，符合 gates）/ UI-G5 controller 持两个计时器+分类真复杂度 / UI-G7 mount 减 2 方法 2 字段、零新 core import、facade 未变 / UI-G8 N/A（不改提交内容）/ UI-G9 兼容（每键达同动作同时序）/ UI-G11 零 import 构造、lazy 友好。`verify-quality` + `verify-dip` 绿。tsc/TUI 验收交 maintainer。

**Deferred**：`modes/_shell/cancellation` 等 print/rpc/acp 真要共享优雅退出时再抽（YAGNI）。
