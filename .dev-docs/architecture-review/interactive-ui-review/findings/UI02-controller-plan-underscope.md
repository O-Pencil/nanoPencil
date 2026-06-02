# UI02: F02 的 5-controller 欠拆 2 个 owner

```yaml
finding_id: UI02
severity: structural
lenses: [locality, depth]
files_primary:
  - modes/interactive/interactive-mode.ts
files_secondary:
  - modes/interactive/controllers/   # 待建
status: selected
```

## Problem

F02 草拟了 5 个 controller（slash-dispatcher / model-overlay / session-tree / auth / image-pipeline）。但摸底（182 方法聚类）暴露**两个未被计划覆盖、却体量很大的内聚簇**：

### A. extension-ui-controller（~32 方法，计划外）

扩展的 widget/overlay/输入 表面是一整片自带状态的内聚逻辑：

- `initExtensions`/`setupExtensionShortcuts`/`getRegisteredToolDefinition`
- widget：`set/clearExtensionWidget(s)`、`render{Widgets,WidgetContainer}`、`setExtension{Status,Footer,Header}`
- overlay：`show/hide/dismissExtension{Selector,Input,Editor,Confirm,Notify,Custom,Error}`、`setCustomEditorComponent`
- 焦点/上下文：`createExtensionUIContext`、`hasActiveExtensionPrompt`、`restoreEditorFocusIfPossible`
- 终端输入：`add/clearExtensionTerminalInputListener(s)`

**自带状态**：`extensionSelector/Input/Editor`、`extensionWidgetsAbove/Below`、`extensionTerminalInputUnsubscribers`、`widgetContainerAbove/Below`。

体量比多数计划内 controller 还大，且与 slash-dispatcher（命令）正交（这是 UI 呈现面）。

### B. self-update-controller（~12 方法，计划外）

自更新/版本管理是一整片与 TUI 渲染**无本质耦合**的流程：

- `checkForNewVersion`/`checkAutoUpdateOnStartup`/`showNewVersionNotification`
- `handleUpdateCommand`/`showUpdateOptions`/`handleReinstallCommand`
- `performUpdate`/`showRetryOptions`/`waitForKeyPress`/`restartNanoPencil`/`compareVersion`
- 顶层 helper `spawnNpm`

它调 `npm`/`spawn`、重启进程，本质是**运维流程**，恰好用 TUI 提示。

## Deletion Test

> 若不给这两簇独立 owner，它们会落在哪？

**Result**：全部退回 mount（interactive-mode.ts），让"组合根"继续背 ~44 个方法 + 一片扩展/更新状态 —— 正是 god 没拆干净。它们**不会散到别处**（扩展状态、更新逻辑别处不用）= RS-5/UI-G5 想要的"持真状态"信号，应各自独立。

## Verdict — SELECTED（在 5 个之外补 2 个 owner）

P5 controller 集合定为 **7 个**：

```
slash-dispatcher / model-overlay / auth / tree-overlay(UI05改名) / image-pipeline
+ extension-ui-controller        (本卡 A)
+ self-update-controller         (本卡 B)
```

- `extension-ui-controller`：持扩展 widget/overlay/输入状态 + 焦点管理，经窄 context 读 mount 的容器槽与 ExtensionRunner。
- `self-update-controller`：持版本检查/更新流程；**评估是否移出 `modes/interactive`**（它非 TUI 专属，可落 `modes/_shell` 或 `core/platform`，仅把"显示更新提示"留在 UI）。

## Decision Criteria

- extension-ui / self-update 各为独立 owner，不回流 mount。
- 沿用 capability-context：context 暴露命名能力，不接收整个 `InteractiveMode`（UI-G2）。
- extension widget/overlay 的 set/clear/dismiss 单一归属（UI-G3）。
- self-update 与 TUI 渲染解耦；若移出 interactive，UI 仅保留"提示"薄壳。
- 每抽一个，V5-1 回放绿（依赖 UI01 基线）。

## References

- 母 finding：[F02 §Proposed direction](../../findings/F02-interactive-mode-god-file.md)
- 摸底簇表：[P5 §现状摸底](../../execution-plan/P5-ui-split.md#现状摸底2026-06-02)
- 同型前例：runtime 评审 [AS09](../../runtime-session-review/findings/AS09-reload-runtime-boundary.md)/[AS12](../../runtime-session-review/findings/AS12-teardown-abort-boundary.md)（对原计划的增删）
