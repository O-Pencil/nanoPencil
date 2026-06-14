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

扩展的 prompt/overlay/widget 表面是一整片自带状态的内聚逻辑：

- `initExtensions`/`setupExtensionShortcuts`/`getRegisteredToolDefinition`
- persistent surfaces：`set/clearExtensionWidget(s)`、`render{Widgets,WidgetContainer}`、`setExtension{Status,Footer,Header}`
- prompt/overlay：`show/hide/dismissExtension{Selector,Input,Editor,Confirm,Notify,Custom,Error}`、`setCustomEditorComponent`
- 焦点/上下文：`createExtensionUIContext`、`hasActiveExtensionPrompt`、`restoreEditorFocusIfPossible`
- 终端输入：`add/clearExtensionTerminalInputListener(s)`

**自带状态**：`extensionSelector/Input/Editor`、`extensionWidgetsAbove/Below`、`extensionTerminalInputUnsubscribers`、`widgetContainerAbove/Below`。

体量比多数计划内 controller 还大，且与 slash-dispatcher（命令）正交（这是 UI 呈现面）。

### B. self-update-controller（~12 方法，计划外）

自更新/版本管理是一整片与 TUI 渲染**无本质耦合**的流程，但不是 `core/platform` 原语：

- `checkForNewVersion`/`checkAutoUpdateOnStartup`/`showNewVersionNotification`
- `handleUpdateCommand`/`showUpdateOptions`/`handleReinstallCommand`
- `performUpdate`/`showRetryOptions`/`waitForKeyPress`/`restartcatui`/`compareVersion`
- 顶层 helper `spawnNpm`

它调 `npm`/`spawn`、重启进程，本质是**CLI update workflow**，恰好用 TUI 提示；P5 先在 interactive 内部拆 controller，只有出现 print/rpc/acp 等第二消费者时再上移 `modes/_shell/update`。

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

- `extension-ui-controller`：持扩展 prompt/overlay/widget 状态 + 焦点管理，经窄 context 读 mount 的容器槽与 ExtensionRunner。重写的是生命周期协调层：单活动 prompt、custom overlay handle、keyed persistent surfaces 分开建模，不默认引入 generic overlay stack。
- `self-update-controller`：持版本检查/更新流程；P5 先拆在 `modes/interactive` 内部。若后续有第二个 mode 消费，再把纯 update workflow 上移 `modes/_shell/update`；不落 `core/platform`。

## Decision Criteria

- extension-ui / self-update 各为独立 owner，不回流 mount。
- 沿用 capability-context：context 暴露命名能力，不接收整个 `InteractiveMode`（UI-G2）。
- extension prompt/overlay/widget 的 set/clear/dismiss 单一归属（UI-G3）；persistent surfaces 不被误并进 overlay stack。
- self-update 与 TUI 渲染解耦；P5 不上移 `core/platform`，跨 mode 复用需求出现后再提 `_shell`。
- 每抽一个，V5-1 功能验收通过（依赖 feature-inventory v1）。

## References

- 母 finding：[F02 §Proposed direction](../../findings/F02-interactive-mode-god-file.md)
- 摸底簇表：[P5 §现状摸底](../../execution-plan/P5-ui-split.md#现状摸底2026-06-02)
- 同型前例：runtime 评审 [AS09](../../runtime-session-review/findings/AS09-reload-runtime-boundary.md)/[AS12](../../runtime-session-review/findings/AS12-teardown-abort-boundary.md)（对原计划的增删）
