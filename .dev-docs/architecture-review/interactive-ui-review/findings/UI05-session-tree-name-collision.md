# UI05: UI 侧 session-tree-controller 与 P4 runtime 侧同名不同层

```yaml
finding_id: UI05
severity: clarity
lenses: [locality]
files_primary:
  - modes/interactive/interactive-mode.ts
files_secondary:
  - core/runtime/session-tree-controller.ts
status: selected
```

## Problem

F02 计划把 UI 侧 fork/switch/tree 的选择器簇命名为 `session-tree-controller`。但 P4 **已经在 `core/runtime/` 落地了一个 `session-tree-controller.ts`**（[AS10](../../runtime-session-review/findings/AS10-tree-navigation-boundary.md)），负责 `navigateTree()` + 分支摘要 + abort slot —— 那是 **runtime 层**的树导航。

UI 侧这一簇（`showTreeSelector`/`showSessionSelector`/`showUserMessageSelector`/`handleResumeSession`/`addSessionNavigationBanner`）是**呈现层**：弹选择器、收用户选择、调用 runtime 的导航能力。两者**同名不同层**，会在导航、import、口头沟通里造成持续混淆（"改 session-tree-controller" 指哪个？）。

## Deletion Test

> 同名会导致什么？

**Result**：reader 必须靠路径前缀区分 `core/runtime/` vs `modes/interactive/controllers/`；grep `session-tree-controller` 命中两层；P3 [TO]/[FROM] 容易写错指向。这是纯粹的**可读性/Opacity** 债，零行为代价即可消除。

## Verdict — SELECTED（UI 侧改名消歧）

UI 侧这一簇命名为 **`tree-overlay-controller.ts`**（或 `session-selector-controller`），明确它是"树/会话**选择器 overlay**"，与 runtime 的 `session-tree-controller`（树**导航**）区分：

- runtime `session-tree-controller`：拥有 `navigateTree()` 行为（P4）。
- UI `tree-overlay-controller`：弹 overlay、收选择、**委托** runtime 能力（经 AgentSession facade / 窄 context，符合 UI03/UI-G7）。

## Decision Criteria

- UI 侧文件名不与 `core/runtime/session-tree-controller.ts` 同名。
- 命名体现"overlay/selector"层语义。
- 它通过 facade/context 调用 runtime 导航，不 deep import runtime 内部（UI-G7）。
- gates.md Single-Owner 表与 P5 任务清单同步更名。

## References

- 冲突对象：[runtime AS10](../../runtime-session-review/findings/AS10-tree-navigation-boundary.md)、`core/runtime/session-tree-controller.ts`
- 摸底：[P5 §现状摸底 UI-5](../../execution-plan/P5-ui-split.md#现状摸底2026-06-02)
- Gate：[gates.md](../gates.md) UI-G6（DIP 命名一致）
