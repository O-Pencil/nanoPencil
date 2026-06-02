# P5 — UI god 拆（B3）

```yaml
phase: P5
macro_stage: B        # 功能级
batch: B3
status: recon          # 摸底完成(2026-06-02)；待建 interactive-ui-review + 补 TUI 基线后开拆
risk: medium-high
depends_on: [P4]       # ★ 改串行：P4 runtime 契约稳定后再拆 UI（P4 已 completed 2026-06-02）
blocks: [P6]
findings: [F02, F05-partial]
seams: []
gate: gates.md#门组-b
```

## 目标

拆分 `interactive-mode.ts`（~7958 行）为 controllers + state + mount 入口；TUI **行为零回归**。

## 进入条件

- [ ] [P2 DoD](./P2-cycles-gate.md#验证门控dod) 全过
- [ ] [P0](./P0-prepare.md) 来自冻结 `main` 的 characterization cassette/golden + 公共 API snapshot 基线就绪
- [ ] [P4 DoD](./P4-runtime-split.md#验证门控dod) 全过（串行：runtime 契约稳定后再拆 UI）

## 任务清单

- [ ] `modes/_shell/cancellation.ts` 抽出（Q7：只抽 cancellation）
- [ ] `modes/interactive/controllers/`：5 个 controller
  - slash-dispatcher / model-overlay / session-tree / auth-controller / image-pipeline
- [ ] `modes/interactive/state/`：UI 状态合一
- [ ] `interactive-mode.ts` → mount 入口（< 500 行）
- [ ] **F05** 步骤 4-5：扩展类型 UI / commands 部分

## 现状摸底（2026-06-02）

`interactive-mode.ts` = **单一 `InteractiveMode` class，7960 行 / 182 方法 / ~80 个 `this._` 响应式状态字段 / import 头 199 行横跨 18 个 core 内部**。比 `agent-session.ts`（拆前 3550）大 2.2×，是仓库最大非生成 TS 文件。不能盲拆；按下方簇逐个抽、逐个 tsc + V5-1 回放。

### 方法簇 → 目标模块（含对 F02 5-controller 计划的偏差）

| 目标模块 | 方法簇（代表，行号）| 自带状态 | 对计划 |
|---------|--------------------|---------|--------|
| **slash-dispatcher.ts** | `executeBuiltinSlashCommand`(3021 调度表) + 各 `handle*Command`(thinking/agentLoop/export/share/copy/status/usage/name/session/changelog/hotkeys/clear/renderDebug/showResources/soul/persona/memory/mcp/language/bash/compact) + `isExtensionCommand` + 彩蛋(armin/daxnuts) | skillCommands | 计划内 |
| **model-overlay-controller.ts** | `cycleThinkingLevel`/`cycleModel`/`handleModelCommand`/`show{Model,Models,ProviderThenModel,Settings}Selector`/`findExactModelMatch`/`getModelCandidates`/provider 配置簇(`ensureProviderConfigured`/`configureCustomProtocolProvider`/`refreshCurrentModelForProvider`/`selectConfiguredCustomProvider`/`resolveProviderId`) | — | 计划内 |
| **auth-controller.ts** | `handleApiKeyCommand`/`getStoredApiKey`/`promptForProviderApiKey`/`handleLoginCommand`/`handleProviderCredentialsCommand`/`showOAuthSelector`/`getLoginSelectorProviders`/`showLoginDialog` | — | 计划内 ⚠️ provider 配置簇与 model-overlay 重叠，边界待评审 |
| **session-tree-controller.ts**(UI) | `showUserMessageSelector`/`showTreeSelector`/`showSessionSelector`/`handleResumeSession`/`addSessionNavigationBanner` | — | 计划内（注意与 P4 的 runtime `session-tree-controller` 同名不同层）|
| **image-pipeline-controller.ts** | `handleClipboardImagePaste`/`loadClipboardImageIntoAttachments`/`updateAttachmentsBar`/`deleteAttachment`/`handleAttachmentKeyNavigation`/`processAttachmentFiles`/`extractImagesFromText`/`cleanup{Stale,}Clipboard{Files,Images}` | clipboardImageFiles/clipboardPastePromise/attachments/selectedAttachmentIndex | 计划内 |
| **★ extension-ui-controller.ts** | ~32 方法:`initExtensions`/`setupExtensionShortcuts`/`set/clearExtensionWidget(s)`/`render{Widgets,WidgetContainer}`/`setExtension{Status,Footer,Header}`/`create ExtensionUIContext`/`show/hide/dismissExtension{Selector,Input,Editor,Confirm,Notify,Custom,Error}`/`setCustomEditorComponent`/`hasActiveExtensionPrompt`/`restoreEditorFocusIfPossible` | extensionSelector/Input/Editor + widgetsAbove/Below + terminalInputUnsubscribers | **★ 计划外** — 比多数计划 controller 还大，必须独立 owner |
| **★ self-update-controller.ts** | `checkForNewVersion`/`showNewVersionNotification`/`handleUpdateCommand`/`showUpdateOptions`/`handleReinstallCommand`/`performUpdate`/`showRetryOptions`/`waitForKeyPress`/`restartNanoPencil`/`compareVersion`/`checkAutoUpdateOnStartup` + 顶层 `spawnNpm` | — | **★ 计划外** — 自更新与 TUI 无本质耦合，宜独立（甚至移出 interactive）|
| **_shell/cancellation.ts** | `handleCtrlC`/`handleCtrlD`/`handleCtrlZ`/`checkShutdownRequested` + `shutdown` 的信号部分 | lastSigintTime/lastEscapeTime/shutdownRequested | 计划内（Q7：仅抽 cancellation 跨 mode）|
| **state/interactive-state.ts** | ~80 字段合一:streaming(component/message/customStream)、tools(pendingTools/expanded)、bash(isBashMode/component/pending)、queues(compaction/optimistic)、timers、buddyPet、header/footer 槽 | （状态容器）| 计划内 |
| **保留在 mount(interactive-mode.ts)** | `constructor`/`init`/`run`/`stop`/`setup{Autocomplete,KeyHandlers,EditorSubmitHandler}`/`subscribeToAgent`/**`handleEvent`(3259，单方法 336 行=流式渲染核心)**/`addMessageToChat`/`render{SessionContext,InitialMessages}`/`rebuildChatFromMessages`/working-message+timer 簇/buddyPet 簇/path-format 簇 | UI 根容器引用 | 组合根 |

### 摸底发现（待开 interactive-ui-review 立卡）

| # | 发现 | 影响 |
|---|------|------|
| **UI-1** | **TUI 零回归基线缺失（命门）** | characterization 只有 print 模式 `hello`/`read-file`；`core/lib/tui/test/` 只测**库原语**，无 interactive-mode 级（键位/overlay/dispatch）快照。**V5-1 当前无可比基线** —— 与 P4 的 C4 同型坑，**开拆前必须先补 TUI characterization 脚手架**（在冻结 main 上录），否则零回归无法证明 |
| **UI-2** | **F02 的 5-controller 计划欠拆 2 个** | 实际簇暴露 **extension-ui-controller(~32 方法)** 与 **self-update-controller(~12 方法)** 两个计划外 owner；前者比多数计划 controller 还大。等同 P4 评审里 AS09–AS12 对原计划的补充 |
| **UI-3** | **import 泄漏 = seam 清单** | 18 个 core 内部直接 import（custom-providers/agent-session/compaction/mcp-config/persona/model-resolver/resource-loader/...）。每条都是"本应封装在 AgentSession 内的能力泄漏到 UI"。controllers 抽取时应顺带把这些收敛到 **AgentSession facade / 各 controller 的窄 context**（沿用 P4 的 capability-context 模式），而非平移 import |
| **UI-4** | **`handleEvent` 336 行是二级 god** | 流式渲染事件路由本身需要独立"render 层"评估；先随 mount 保留，作为后续切片 |
| **UI-5** | **同名歧义** | UI 侧 `session-tree-controller` 与 P4 runtime 侧 `session-tree-controller` 同名不同层；命名需消歧（如 `tree-overlay-controller`）|

### 下一步（开拆前置）

1. ✅ **已建 [`interactive-ui-review/`](../interactive-ui-review/README.md)**（镜像 runtime-session-review）：5 个发现立成卡 [UI01–UI05](../interactive-ui-review/README.md#current-finding-set)，门组 [UI-G1…UI-G7](../interactive-ui-review/gates.md) 定稿，抽取顺序见 [refactor-plan.md](../interactive-ui-review/refactor-plan.md)。
2. 🚫 **补 TUI characterization**（[UI01](../interactive-ui-review/findings/UI01-tui-characterization-baseline.md) blocker，命门）：在冻结 `main` 上为 interactive 关键流录快照基线（键位/`/command`/overlay），否则 V5-1 无从谈起。**未解除前禁止任何 controller 抽取。**
3. 评审定稿后再按 controller 分批抽（沿用 P4 capability-context + 逐 tsc + 回放）。

## 验证门控（DoD）

> 出口以 [gates.md 门组 B](./gates.md#门组-b--功能级出口大阶段二逐域草案--待你定稿) 为准。本 phase 最高风险，TUI 零回归是命门（依赖 P0 的 TUI characterization 脚手架）。本域补充：

| # | 检查项 | 通过标准 | 门组 B |
|---|--------|---------|--------|
| V5-1 | TUI 零回归（硬）| interactive-mode 级 TUI snapshot/characterization **全过** ⚠️ **基线尚不存在（UI-1）→ 开拆前必须先在冻结 main 上录** | GB-2 |
| V5-2 | 边界守恒（硬）| controllers/state 不反向依赖 mount；UI 不直接碰 runtime 内部（经契约）| **GB-1** |
| V5-3 | 公共 API | 符号表不变 | GB-2 |
| V5-4 | 单一职责 | controller 职责单一（行数仅信号）| GB-4 |
| V5-5 | 冒烟 | interactive 完整会话 smoke 通过 | GB-2 |

## 提交建议

- 建议拆 ≤5 个 PR 合入执行分支（按 controller 分批）
- 每 PR 合入前跑 V5-1

## 决策门控

无新增 ✦（Q7 已决议：只抽 cancellation）。

## 参考

- Finding：`../findings/F02-interactive-mode-god-file.md`
