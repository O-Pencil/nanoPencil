# UI04: handleEvent(336 行) 是二级渲染 god — 先保留，后切

```yaml
finding_id: UI04
severity: load-bearing
lenses: [depth, locality]
files_primary:
  - modes/interactive/interactive-mode.ts
status: deferred
```

## Problem

`handleEvent(event: AgentSessionEvent)`（L3259，~336 行）是 `InteractiveMode` 里**最大的单个方法**，是流式渲染的事件路由核心：把 `AgentSessionEvent`（assistant 流、工具开始/结束、custom message、compaction、retry、session 导航…）翻译成对 chat 容器、streaming 组件、pendingTools、loader、状态行的增量渲染。

它与一大片状态深度交织（`streamingComponent/Message`、`customStreamComponents`、`pendingTools`、`autoCompactionLoader`、`retryLoader`、`optimisticUserMessages`…），是真正的"渲染层"。

## Deletion Test

> 若现在就抽一个 RenderController 出来？

**Result**：它会**带走半个 state/interactive-state**（所有流式/工具/loader 状态）和与 `addMessageToChat`/`renderSessionContext`/`subscribeToAgent` 的紧耦合。在 controller 们（slash/model/auth/…）和 state 容器都还没落地前抽它，**归属面未稳，易抽错**，且它是 V5-1 回放最敏感的部分（流式逐帧）。

## Verdict — DEFERRED（先随 mount 保留，作为后续切片）

**不在第一轮抽取**。理由：

- 它是组合根的渲染心脏，应在 state 容器（`interactive-state`）+ 周边 controller 落地、UI01 基线稳固之后，再作为独立 **render 层**评估。
- 过早抽取会与正在移动的状态归属打架，且最易引入流式回归。

优先级：**低于** UI02 的 7 个 controller 与 state 合一。等其余切片稳定、`handleEvent` 依赖面收敛后再立专卡（render-controller）。

## Decision Criteria（若后续 selected）

- 在 state 容器 + 其余 controller 落地后再动。
- 抽出的 render 层持流式/工具/loader 状态为**自有**，经窄 context 读 chat 容器句柄。
- `subscribeToAgent` → `handleEvent` 的事件顺序与增量渲染**逐帧不变**（V5-1 流式 case 最敏感）。
- 不与 `_shell/cancellation`、compaction loader 的归属重叠。

## References

- 摸底：[P5 §现状摸底 UI-4](../../execution-plan/P5-ui-split.md#现状摸底2026-06-02)
- 同型前例：runtime 评审里把 loop-continuation 留在 AgentSession（[AS04](../../runtime-session-review/findings/AS04-compaction-coordinator-placeholder.md)）
- Gate：[gates.md](../gates.md) UI-G5（不强抽空壳）
