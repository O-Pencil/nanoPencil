# UI01: TUI 零回归基线不存在 — 开拆前必须先录

```yaml
finding_id: UI01
severity: blocking
lenses: [risk, leverage]
files_primary:
  - tests/characterization/
  - modes/interactive/interactive-mode.ts
files_secondary:
  - core/lib/tui/test/
  - modes/print-mode.ts
status: blocker
```

## Problem

P5 的命门是 **V5-1 TUI 零回归**，但当前**没有 interactive-mode 级的行为基线**可比对：

- `tests/characterization/` 只有 **print 模式** 两个 case（`hello`/`read-file`）—— 覆盖核心引擎，**不覆盖 TUI 专属流**（键位、`/command` 调度、overlay、流式渲染）。
- `core/lib/tui/test/`、`test/tui-*.test.ts` 只测 **TUI 库原语**（viewport/overlay/render），不驱动 `InteractiveMode`。

即：要拆的 7960 行里**绝大部分行为没有任何回放基线**。在这种状态下抽 controller，等同**裸拆** —— 零回归只能靠肉眼，而 TUI 是产品核心（`.PENCIL.md`），键位/overlay 一旦改路径直接伤体验。

这与 P4 的 C4 缺口**同型**：P4 也是先发现"冻结 main 的 characterization 没录"，补录后才证得行为不变。区别是 P4 至少有 print characterization 间接覆盖引擎，而 interactive-mode 的 UI 流**零覆盖**，所以本卡是 **blocker**，不是普通 finding。

## Deletion Test

> 不补基线直接拆，会怎样？

**Result**：V5-1 失去判据 → P5 任何 controller 抽取都**无法证明**零回归 → 出口门形同虚设。基线缺口不会"返回某处"，它是**前置依赖**，必须先建。

## Verdict — BLOCKER（解除前禁止任何抽取）

在动第一个 controller 前，必须先建 **interactive-mode 级 TUI characterization 脚手架**，在冻结 `main` 上录基线：

- 喂**确定性键序**（含 `/command`、overlay 触发、附件粘贴等关键流）。
- 捕获渲染输出（虚拟终端 buffer / 组件树快照）。
- 归一化掉易变量（**比 print 难**：定时器、动画帧、终端尺寸、buddy pet、loader 帧、时间戳、绝对路径、uuid）。
- 复用已有 VCR（`fetch-cassette.ts`）固定模型响应（沿用 MiMo cassette 思路）。

设计要点（待 UI01 实施时定稿）：

- 用 `@pencil-agent/tui` 是否已有可注入的**虚拟终端/可截帧**入口？（先查 `core/lib/tui/test/tui-render.test.ts` 的 harness）
- 关停或 freeze 非确定源：禁用 welcome banner/agentRun timer、固定 buddy pet 种子、loader 用固定帧、`Date.now` 注入。
- 关键流最小集（建议起步）：①启动渲染 ②一条用户消息→流式 assistant→工具调用渲染 ③`/model` overlay 开关 ④`/help`(hotkeys) ⑤Ctrl-C 取消。

## Decision Criteria

- 基线录在**冻结 main**（与 P4 同纪律，回放在分支）。
- 归一化后**两次录制自身可复现**（先证 harness 确定性，再当基线）。
- 覆盖键位/`/command`/overlay 至少上面 5 条关键流。
- 不在低性能机器跑（tsx/vitest + 渲染，冷启动慢）。
- 解除本 blocker 后，UI02/UI03/UI05 的每次抽取都以该基线回放为 V5-1 判据。

## References

- 同型前例：P4 的 [P4-signoff-checklist §2b C4](../../execution-plan/P4-signoff-checklist.md)、characterization harness [tests/characterization/README.md](../../../../tests/characterization/README.md)
- Gate：[gates.md](../gates.md) UI-G4
- 摸底：[P5 §现状摸底 UI-1](../../execution-plan/P5-ui-split.md#现状摸底2026-06-02)
