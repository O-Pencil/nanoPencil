# handleEvent render 层 专项评审（UI04，实施前）

```yaml
doc: handle-event-analysis
phase: P5
finding: UI04（handle-event-render-god，deferred → 现激活）
status: review
source: modes/interactive/interactive-mode.ts::handleEvent (2138-2475, ~337 行, 12 cases)
decision: SELECTED A（单 stream-render-controller，纯搬；retry/compaction overlay state 收为私有）— 2026-06-04
```

## 0. 前提

UI04 在 gates 中长期 deferred（"等 controller 和 state ownership 稳定后再切"）。现在 image/self-update/extension-ui/state/model-overlay/auth/tree/settings/slash/input-submit/interrupt 均已落地，前置条件满足。这是 mount 退壳（#8，目标 <500 行）的**最后一块**：handleEvent 不出 mount，退壳无法收口。

结构评审，不录 characterization。命门是 **UI-G8 token 中性**（渲染不得改发给模型的内容）与 **UI-G9 兼容**（流式/工具/loader/retry/compaction 的可见时序不变）。

## 1. 现象层：12 case 归 6 个渲染关切

| 关切 | cases | 主要动作 |
|------|-------|----------|
| **run 生命周期 / loader / working-msg** | agent_start, agent_end | loader 起停、statusContainer、buddy working/happy、run 计时、working message override、退出收尾（clearAttachments / checkShutdownRequested）|
| **assistant 流式消息** | message_start[assistant], message_update, message_end | streamingComponent/Message 生命周期、updateContent、toolCall→ToolExecutionComponent、abort/error 标记、setArgsComplete |
| **user/custom echo** | message_start[user/custom] | custom→addMessageToChat；user→optimistic 去重（match 则 shift）|
| **工具执行展示** | tool_execution_start/update/end | pendingTools map 增改删 ToolExecutionComponent |
| **auto-compaction overlay** | auto_compaction_start/end | escape 覆盖、loader、rebuild chat、compaction summary、flushCompactionQueue |
| **auto-retry overlay** | auto_retry_start/end | escape 覆盖、loader、最终失败 showError |

## 2. 本质层：state 不可干净拆分（关键证据）

handleEvent 触碰 13 个 render state 字段。按"在 handleEvent **外**的读写数"统计：

| 字段 | 外部读写 | 含义 |
|------|----------|------|
| `loadingAnimation` | **21** | 与 interrupt（`queue.isLoadingAnimationActive`）、working-message、计时强耦合 |
| `pendingTools` | **8** | 与 toggleToolOutputExpansion、工具 helper 共享 |
| `toolOutputExpanded` | **8** | toggle（Ctrl-T）+ 工具组件 |
| `streamingComponent` | **7** | rebuild/working-message 等 |
| `streamingMessage` | **5** | 同上 |
| `optimisticUserMessages` | **5** | input-submit render port 写、handleEvent 去重读 |
| `agentRunStartMs` | **4** | start/stopAgentRunTimer、updateWorkingMessage |
| `workingMessageOverride` | **3** | working-message |
| `pendingWorkingMessage` | **1** | working-message |
| `retryEscapeHandler` | **0** | **仅 handleEvent**（agent_start 也读，仍属本层）|
| `autoCompactionEscapeHandler` | **0** | **仅 handleEvent** |
| `retryLoader` | **0** | **仅 handleEvent** |
| `autoCompactionLoader` | **0** | **仅 handleEvent** |

**结论**：render 核心状态（loadingAnimation/pendingTools/streamingComponent/toolOutputExpanded）**外部读写极多**，强行"按 case 拆多个子 controller 各持一片 state"会制造跨 controller 共享 state 契约（pendingTools 被流式/工具/生命周期三组写；loadingAnimation 还被 interrupt 读）→ 重演 service-locator。唯一干净自持的是 retry/auto-compaction 的 escape+loader（外部 0）。

## 3. 三个跨切关切（拆 case 必撞）

1. **pendingTools 三写者**：message_update（从 toolCall content 生成）+ tool_execution_*（更新）+ agent_end/message_end（清空/标错）。
2. **escape swap × interrupt-controller**：auto_retry_start / auto_compaction_start 保存当前 `onEscape`（= interrupt 的 `dispatchEscape` 闭包）并覆盖为 abortRetry/abortCompaction，agent_start / *_end 还原。render 层与 interrupt 共用 `defaultEditor.onEscape` 这一句柄 → 需定义 seam（见 §5）。
3. **loaders 共用 statusContainer**：loadingAnimation / retryLoader / autoCompactionLoader 互斥地 clear+addChild 同一 statusContainer。

## 4. 哲学层：为什么仍要抽（即便只是搬）

- mount 退壳的硬前置：337 行 render god 不出 mount，#8 无法到 <500。
- handleEvent 持**真渲染逻辑复杂度**（事件→组件编排），抽出满足 UI-G5（非空壳）。
- 抽出后 streaming/tool/loader 渲染可脱离整个 mount 单测。
- token 中性显式化：render 层只读 session 事件、写组件，不向 AgentSession 提交任何消息。

## 5. 候选形状（若选 A）

`modes/interactive/controllers/stream-render-controller.ts`（render layer）

- `handle(event): Promise<void>` —— 把 12-case switch **忠实搬入**（纯搬，preserve-check）。
- 自持状态（外部 0 读写者）：`retryEscapeHandler` / `autoCompactionEscapeHandler` / `retryLoader` / `autoCompactionLoader` 移入 controller 私有字段（真 ownership 增益）。
- 其余 render state 留 `interactive-state`，经 context 读写（它本就是 consolidated holder，符合其职责）。

建议 context 分组：

| Port | 能力 |
|------|------|
| `state` | streamingComponent/Message、pendingTools、loadingAnimation、optimisticUserMessages、toolOutputExpanded、agentRunStartMs、working* 的 get/set（经 interactive-state）|
| `layout` | chatContainer / statusContainer 增删清、addMessageToChat、updatePendingMessagesDisplay、rebuildChatFromMessages、requestRender、footer.invalidate |
| `loaders` | new PencilLoader（working/retry/compaction 文案）、buddy pet、working-message、run 计时、formatElapsedSeconds |
| `toolTrace` | shouldRenderToolTrace、getRegisteredToolDefinition、showImages、ToolExecutionComponent 工厂 |
| `runtime` | session.retryAttempt、abortCompaction、abortRetry、flushCompactionQueue、checkShutdownRequested、imagePipeline.clearAttachments |
| `escape` | getMainEscapeHandler / setEscapeHandler（与 interrupt 共用 `defaultEditor.onEscape` 的唯一受控通道）|
| `surface` | showStatus / showError、promptHost.restoreEditorFocusIfPossible、getMarkdownThemeWithSettings、getUserMessageText、init/isInitialized |

mount 保留薄 `handleEvent(event) → this.streamRender.handle(event)`（subscribe 仍在 mount）。

## 6. 待决：scope（请 maintainer 选）

| 选项 | 抽什么 | 评估 |
|------|--------|------|
| **A 单 `stream-render-controller`（建议）** | 整个 handleEvent 搬入一个 render controller（纯搬）；retry/compaction 的 escape+loader 收为其私有 state；其余 render state 留 interactive-state 经 context | 收益：render god 出 mount、退壳可收口、单测可达；代价：context 偏宽（7 组），但服务单一关切（流式渲染），且 §2 证明拆更细会撞共享 state。**风险最低、达成目标** |
| **B 按关切拆多 controller** | loader/status overlay、streaming-message、tool-trace、overlay-escape 各一 | 收益：概念更细；代价：pendingTools 三写者 + loadingAnimation 跨 interrupt + statusContainer 共用 → 跨 controller 共享 state 契约，service-locator 风险高，多刀 |
| **C 部分抽 + 余留 mount** | 只抽干净的（overlay-escape+loader：retry/compaction，外部 0）；流式/工具/生命周期核心留 mount | 收益：零风险小步；代价：mount 仍背大半 render god，#8 退壳达不到 <500，UI04 名存实亡 |

## 7. 验收矩阵（无论 A/B/C）

| 场景 | 验收 |
|------|------|
| agent_start | loader 出现、buddy working、计时起、retry handler 若残留则还原 |
| 流式 assistant | 增量 updateContent；toolCall 即时生成工具组件 |
| message_end abort/error | 未完成工具标红清空；正常则 setArgsComplete |
| user echo 去重 | optimistic 命中则 shift 不重复渲染 |
| custom message | 直接入 chat |
| tool start/update/end | 工具组件 创建/流式结果/最终结果（isError 透传）|
| agent_end | loader 停、streamingComponent 移除、pendingTools 清、附件清、buddy happy、"Completed in X"、checkShutdownRequested |
| auto-compaction | esc 改 abortCompaction，结束还原；rebuild + summary / 失败错误行；flushCompactionQueue(willRetry) |
| auto-retry | esc 改 abortRetry，结束还原；最终失败 showError |
| **escape 协同** | compaction/retry 期 esc 走覆盖；结束后 esc 回到 interrupt.dispatchEscape |
| **token 中性** | 全程不向 AgentSession 提交任何消息 |

## 8. 下一步

~~maintainer 在 §6 选 scope~~ → **已选 A**，已实施。接 #8 mount 退壳评估。

## 9. Resolution（A 落地，2026-06-04）

`modes/interactive/controllers/stream-render-controller.ts` 新建：

- `handle(event)`：12-case switch **逐字 1:1 搬入**（纯搬，preserve-check），优先级/分支/文案/时序不变。
- 私有 state（外部 0 读写者）：`autoCompactionLoader` / `autoCompactionEscapeHandler` / `retryLoader` / `retryEscapeHandler` 从 `InteractiveState` **移出**到 controller 私有字段。
- 其余 render state 留 `interactive-state`，经 `state.get()` 读写（该 holder 的 P3 已预声明"will be read by the render-layer controller (UI04)"）。
- 7 组 context：`state` / `layout`（containers + addMessageToChat/rebuild/render/footer）/ `loaders`（PencilLoader 文案 + buddy + 计时 + working-message + interrupt key hint）/ `toolTrace`（shouldRender/toolDef/showImages）/ `runtime`（retryAttempt/abortCompaction/abortRetry/flushQueue/checkShutdown/clearAttachments）/ `escape`（get/set onEscape 唯一受控通道）/ `surface`（ensureInitialized/focus/userText/markdownTheme/status/error）。
- mount：`handleEvent(event) → this.streamRender.handle(event)`（subscribeToAgent 仍在 mount）；`InteractiveState` 删 4 字段（25 处引用全在被删的 handleEvent 内）。

**escape × interrupt seam**：compaction/retry 的 escape 覆盖经 `escape` port 存取 `defaultEditor.onEscape`，存的就是 interrupt 的 `dispatchEscape` 闭包，agent_start/*_end 还原——与 interrupt-controller 行为一致。

**Gate**：UI-G1 无反向 import / UI-G2 命名能力闭包（`state.get()` 返回 plain holder，非 InteractiveMode/AgentSession，符合）/ UI-G3 render 单 owner / UI-G5 持整段 render 逻辑真复杂度 + 4 字段真 ownership / UI-G7 mount 无新 core import、facade 未变 / UI-G8 token 中性（render 不 submit）/ UI-G9 兼容（逐 case 时序保留）/ UI-G11 构造仅闭包、无 eager work。`verify-quality`（544 文件无环）+ `verify-dip` 绿。tsc/TUI 验收交 maintainer。

**解锁**：#8 mount 退壳现在可评估（handleEvent god 已出 mount）。
