# Interactive UI Refactor Plan — 实际顺序与验证记录

```yaml
plan_for: interactive-ui-review
parent: ./README.md
status: pre-implementation   # 卡已立，等 UI01 blocker 解除后开拆
```

## 硬序

```
UI01 (blocker: 录 TUI 基线)  ──► 必须先解
        │
        ▼
UI05 改名定稿 ──► 各 controller 抽取（每抽一个：逐 tsc + V5-1 回放）
        │
        ▼
UI02 七 controller + state 合一（沿用 P4 capability-context）
        │  贯穿：UI03 seam 纪律（import 只减不增，UI-G7）
        ▼
UI04 render 层切片（deferred，最后评估）
```

## 抽取顺序（草案，待 UI01 后定稿）

按"状态独立、风险递增"排，参照 P4 的逐簇节奏：

| 序 | 切片 | 卡 | 自带状态 | 备注 |
|----|------|----|---------|------|
| 0 | **TUI characterization 基线** | UI01 | — | **blocker，先做** |
| 1 | `state/interactive-state` 合一 | UI02 | ~80 字段 | 先立状态容器，后续 controller 经 context 读 |
| 2 | `image-pipeline-controller` | UI02 | 附件/剪贴板 | 状态最独立，先试水（类比 P4 的 bash-runner）|
| 3 | `self-update-controller` | UI02 | — | 与渲染解耦，评估移出 interactive |
| 4 | `extension-ui-controller` | UI02 | 扩展 widget/overlay | 体量大，独立 owner |
| 5 | `slash-dispatcher` | UI02 | skillCommands | 调度表 + handle*Command |
| 6 | `model-overlay-controller` / `auth-controller` | UI02 | — | provider 配置边界（UI02 ⚠️）|
| 7 | `tree-overlay-controller`（UI05 改名）| UI05 | — | 经 facade 调 runtime 导航 |
| 8 | `_shell/cancellation` | — | sigint/escape/shutdown | 跨 mode |
| 9 | `interactive-mode.ts` → mount(<500 行) | — | 根容器 | 退壳 |
| — | `handleEvent` render 层 | UI04 | 流式/工具/loader | **deferred**，最后 |

## 验证记录（每切片回填）

| 切片 | 落地 commit | V5-1 回放 | import 收缩(UI-G7) | 状态 |
|------|------------|-----------|-------------------|------|
| UI01 基线 | _待_ | — | — | ⬜ |
| state 合一 | _待_ | _待_ | _待_ | ⬜ |
| …（随抽取追加）| | | | |

## 与 P5 runbook 的关系

本表 = 实际执行顺序 + 验证状态；[P5-ui-split.md](../../execution-plan/P5-ui-split.md) = 出口门定义（V5-1…V5-5）。卡片（findings/UIxx）= 每个边界的 why。三者随抽取同步回填（同 P4 的三层：llm-wiki/ownership 表/review 卡）。
