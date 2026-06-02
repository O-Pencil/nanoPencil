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

## 纯搬 vs 重写 决策（初稿 v0，待 maintainer 评审）

> 原则：**内聚且无明显坏味 → 纯搬**（preserve-check：tsc + 符号 diff + 手测，便宜且强）；
> **有结构坏味/分支爆炸/重复 → 重写**（feature-acceptance：按 feature-inventory 逐条验收）。
> hybrid = 逻辑搬、边界/接线重写。

| 簇 | 决策 | 证据 / 理由 | 风险 | 验收方式 |
|----|------|-----------|------|---------|
| **state/interactive-state** | **纯搬** | ~80 字段机械合并到容器，不动逻辑；"行为不变"是定义性的 | 低 | preserve-check（符号/编译）|
| **image-pipeline** | **纯搬** | 内聚、自带状态(attachments/clipboard)、无明显坏味；类比 P4 bash-runner 先试水 | 低 | preserve-check + 手测粘贴/拖入 |
| **self-update** | **纯搬(逻辑) + 重定位** | 逻辑(performUpdate/compareVersion/restart)保持；**改进点是把它移出 `modes/interactive`**(非 TUI 专属，UI02)→ 落 `_shell`/`core/platform`，UI 仅留"提示"薄壳 | 低-中 | preserve-check(逻辑) + 确认移位后 `/update` 仍工作 |
| **★ extension-ui** | **重写** | ~32 方法里 **6 套并行 show/hide/dismiss 三连**(selector/input/editor/confirm/notify/custom/error) + ad-hoc `hasActiveExtensionPrompt`/`dismissActiveExtensionPrompt`/`restoreEditorFocusIfPossible` = 分支重复坏味。重写为**统一 overlay 生命周期(栈/注册表)** | **中-高** | feature-acceptance：逐 overlay 类型验收(C 表 + E 表 extension widget)|
| **★ slash-dispatcher** | **重写** | `executeBuiltinSlashCommand` = **188 行 if-else 链 / 33 个 `if (text===\"/x\")` 分支**(CLAUDE.md「分支爆炸是设计信号」)。重写为 **dispatch 表**，并按 F02 把**内置 + 扩展命令并到同一路径** | **中-高** | feature-acceptance：A 表 33 条命令逐条 |
| **model-overlay** | **hybrid(偏写)** | 选择器/cycle 逻辑可搬；但 **provider 配置子簇**(ensureProviderConfigured/configureCustomProtocolProvider/refreshCurrentModel/selectConfiguredCustom)与 auth **边界重叠**(UI02)→ 边界重划属重写 | 中 | feature-acceptance：B/C 表 model 相关 + provider 配置 |
| **auth** | **hybrid(偏搬)** | OAuth/apikey 流程逻辑搬；**解 custom-providers 耦合**(UI03 seam)属重写；与 model-overlay 的 provider 配置边界共定 | 中 | feature-acceptance：A 表 login/logout/apikey + C 表 oauth |
| **tree-overlay**(UI05) | **纯搬 + 改名 + facade 委托** | 选择器 UI 逻辑搬；**改名**消歧(UI05) + 经 facade 调 runtime 导航(不 deep import，UI03) | 低-中 | preserve-check(UI) + 确认 `/tree`/`/fork`/`/resume` 行为 |
| **_shell/cancellation** | **hybrid(偏搬)** | sigint/escape/双击时序逻辑**保持**(易回归，不动)；**改进是跨 mode 复用**(print/rpc/acp 去重)→ 改写各 mode call site | 中 | preserve-check(逻辑) + 各 mode 取消 smoke |
| **handleEvent/render**(UI04) | **deferred → 若动则重写** | 流式渲染核心，最敏感；本轮不动 | 高 | (deferred) 动时：D 表逐事件重度验收 |
| **mount**(interactive-mode.ts) | **纯搬(退壳)** | 其余抽完后剩组合根，<500 行；行为保持 | 低 | preserve-check |

**决策摘要**：纯搬 5（state/image/tree/mount + self-update 逻辑）· 重写 2（extension-ui / slash-dispatcher）· hybrid 3（model-overlay/auth/cancellation）· deferred 1（render）。

> 重写集中在**两处真坏味**：slash 的 188 行 if-else、extension-ui 的 6 套重复 overlay 三连。其余以搬为主、在 seam(UI03)和边界(UI02)上做最小重写。**先做低风险纯搬热身(image/state)，再啃重写。**

## 验证记录（每切片回填）

| 切片 | 落地 commit | V5-1 回放 | import 收缩(UI-G7) | 状态 |
|------|------------|-----------|-------------------|------|
| UI01 基线 | _待_ | — | — | ⬜ |
| state 合一 | _待_ | _待_ | _待_ | ⬜ |
| …（随抽取追加）| | | | |

## 与 P5 runbook 的关系

本表 = 实际执行顺序 + 验证状态；[P5-ui-split.md](../../execution-plan/P5-ui-split.md) = 出口门定义（V5-1…V5-5）。卡片（findings/UIxx）= 每个边界的 why。三者随抽取同步回填（同 P4 的三层：llm-wiki/ownership 表/review 卡）。
