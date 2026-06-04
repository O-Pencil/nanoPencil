# Interactive UI Refactor Plan — 实际顺序与验证记录

```yaml
plan_for: interactive-ui-review
parent: ./README.md
status: pre-implementation   # 卡已立，等 feature-inventory v1 后开拆
```

## 硬序

```
UI01 (blocker: feature-inventory v0→v1)  ──► 必须先解
        │
        ▼
UI05 改名定稿 ──► 各 controller 抽取（每抽一个：逐 tsc + V5-1 功能验收）
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
| 0 | **feature-inventory v1** | UI01 | — | **blocker，先做：校全功能清单，而非录 characterization** |
| 1 | `state/interactive-state` 合一 | UI02 | ~80 字段 | 先立状态容器，后续 controller 经 context 读 |
| 2 | `image-pipeline-controller` | UI02 | 附件/剪贴板 | 状态最独立，先试水（类比 P4 的 bash-runner）|
| 3 | `self-update-controller` | UI02 | — | P5 先在 interactive 内部拆；有第二个 mode 消费者再上移 `_shell` |
| 4 | `extension-ui-controller` | UI02 | 扩展 prompt/overlay/widget surfaces | 体量大，独立 owner；重写生命周期协调层，不把所有 surface 泛化成栈 |
| 5 | `slash-dispatcher` | UI02 | skillCommands | 调度表 + handle*Command |
| 6 | `model-overlay-controller` / `auth-controller` | UI02 | — | provider 配置归 auth/provider-config；model-overlay 只消费 |
| 7 | `tree-overlay-controller`（UI05 改名）| UI05 | — | 经 facade 调 runtime 导航 |
| 8 | `_shell/cancellation` | — | sigint/escape/shutdown | 跨 mode；esc 分派接线留 mount，分支委托 owner |
| 9 | `input-submit-controller` | UI06 | optimistic/bashMode/排队决策 | 委托目标稳定后再抽（slash/image 之后）|
| 10 | `interactive-mode.ts` → mount(post-UI04 目标 <500 行) | — | 根容器 | 退壳；本轮含 handleEvent，未达 500 |
| — | `handleEvent` render 层 | UI04 | 流式/工具/loader | **deferred**，最后 |

## 纯搬 vs 重写 决策（v1 定稿）

> 原则：**内聚且无明显坏味 → 纯搬**（preserve-check：tsc + 符号 diff + 手测，便宜且强）；
> **有结构坏味/分支爆炸/重复 → 重写**（feature-acceptance：按 feature-inventory 逐条验收）。
> hybrid = 逻辑搬、边界/接线重写。
> **per-feature 不单独标**：feature-inventory 每条的 hybrid 决策 = **继承其 owner 簇**本表的决策（如所有 model-overlay 名下功能继承"hybrid：纯搬 selector/cycle + 选模路径归一化"）。

| 簇 | 决策 | 证据 / 理由 | 风险 | 验收方式 |
|----|------|-----------|------|---------|
| **state/interactive-state** | **纯搬** | ~80 字段机械合并到容器，不动逻辑；"行为不变"是定义性的 | 低 | preserve-check（符号/编译）|
| **image-pipeline** | **纯搬** | 内聚、自带状态(attachments/clipboard)、无明显坏味；类比 P4 bash-runner 先试水 | 低 | preserve-check + 手测粘贴/拖入 |
| **self-update** | **纯搬(逻辑) + interactive 内部拆分** | 逻辑(performUpdate/compareVersion/restart)保持；先拆到 `modes/interactive` 内部 controller，隔离更新流程与渲染。暂**不**落 `core/platform`：self-update 依赖 package update UX、settings、spawn/restart、TUI 提示，不是 platform primitive；仅在 print/rpc/acp 出现第二消费者时再抽 `modes/_shell/update` | 低-中 | preserve-check(逻辑) + 确认 `/update`/`/reinstall` 仍工作 |
| **★ extension-ui** | **重写生命周期协调层，组件接线以搬为主** | ~32 方法里多套 show/hide/dismiss + ad-hoc active prompt/focus restore 是重复坏味。重写目标不是“所有 overlay 统一成栈”，而是拆成：`PromptHost`(select/input/editor/confirm 单活动 prompt，替换旧 prompt 并恢复焦点)、`CustomOverlayHost`(保留 overlay handle/onHandle/options)、`PersistentSurfaceRegistry`(widget/footer/header/status keyed surface)、`EditorComponentAdapter`(`setEditorComponent` 保持 editor text/callback/shortcut/focus)。generic stack 仅在真实嵌套需求出现后再引入 | **中-高** | feature-acceptance：逐 prompt/overlay/surface 类型验收(C 表 + E 表 extension widget)|
| **★ slash-dispatcher** | **重写（限内置命令 dispatch）** | `executeBuiltinSlashCommand` = **188 行 if-else 链 / 33 个 `if (text===\"/x\")` 分支**(CLAUDE.md「分支爆炸是设计信号」)。重写为 **dispatch 表**。输入提交管线（嵌入 `/persona`、bash、streaming steer、附件、extension command 立即执行）先独立验收，避免被 slash 重写误吞 | **中-高** | feature-acceptance：A 表 33 条命令 + F 表 input-submit pipeline |
| **model-overlay** | **hybrid(偏搬 + 选模路径归一化)** | 选择器/cycle/model candidates 逻辑可搬；provider 配置不归它。所有主动选模型入口收口到 `ensureProviderConfiguredForSelection(model)` → `setModel` → footer/border/status/default-model 更新；配置取消不得切换模型或写默认模型。`showSettingsSelector` 不属于本簇 | 中 | feature-acceptance：B/C 表 model 选择与 thinking/provider→model overlay；覆盖 exact `/model provider/id` 与 overlay 选择 |
| **auth / provider-config** | **hybrid(偏写)** | OAuth/apikey 流程逻辑搬；provider 配置子簇(`ensureProviderConfigured`/`configureCustomProtocolProvider`/`refreshCurrentModelForProvider`/`resolveProviderId`)归此，解 custom-providers 耦合(UI03 seam)。返回“provider/model 已可用”的结果，不直接拥有模型选择 overlay | 中 | feature-acceptance：A 表 login/logout/apikey + C 表 oauth/provider config |
| **tree-overlay**(UI05) | **纯搬 + 改名 + facade 委托** | 选择器 UI 逻辑搬；**改名**消歧(UI05) + 经 facade 调 runtime 导航(不 deep import，UI03) | 低-中 | preserve-check(UI) + 确认 `/tree`/`/fork`/`/resume` 行为 |
| **_shell/cancellation** | **hybrid(偏搬)** | sigint/escape/双击时序逻辑**保持**(易回归，不动)；**改进是跨 mode 复用**(print/rpc/acp 去重)→ 改写各 mode call site | 中 | preserve-check(逻辑) + 各 mode 取消 smoke |
| **handleEvent/render**(UI04) | **deferred → 若动则重写** | 流式渲染核心，最敏感；本轮不动 | 高 | (deferred) 动时：D 表逐事件重度验收 |
| **★ input-submit**(UI06) | **重写** | `onSubmit` ~246 行分派,交叉 slash/persona/bash/queue/附件;含死分支(4 命令双处理)。重写为 `input-submit-controller` 总分派,委托各 owner;清死分支。委托目标稳定后(slash/image 之后)再抽 | **中-高** | feature-acceptance：F 表逐条 |
| **mount**(interactive-mode.ts) | **纯搬(退壳)** | 其余抽完后剩组合根;<500 行为 **post-UI04** 目标(本轮含 handleEvent 未达)；行为保持 | 低 | preserve-check |

**决策摘要**：纯搬 5（state/image/tree/mount + self-update 逻辑）· 重写 3（extension-ui lifecycle / slash-dispatcher dispatch / input-submit 分派）· hybrid 3（model-overlay/auth-provider-config/cancellation）· deferred 1（render）。controller 集 = **8**。

> 重写集中在**两处真坏味**：slash 的 188 行 if-else、extension-ui 的重复 prompt lifecycle。extension-ui 只重写生命周期协调，不把 widget/footer/header/status/editor replacement 误并进 overlay stack。其余以搬为主、在 seam(UI03)和边界(UI02)上做最小重写。**先做低风险纯搬热身(image/state)，再啃重写。**

## 验证记录（每切片回填）

| 切片 | 落地 commit | V5-1 功能验收 | import 收缩(UI-G7) | 状态 |
|------|------------|-----------|-------------------|------|
| UI01 feature-inventory v1 | _待_ | — | — | ⬜ |
| state 合一 | _待_ | _待_ | _待_ | ⬜ |
| extension-ui host 3/4: CustomOverlayHost | _待提交_ | preserve-check：`showExtensionCustom` 单方法纯搬；ExtensionUIContext.custom 仍同一路径可达；未跑 build/test（低性能机器策略） | `interactive-mode.ts` 删除 custom 方法与 Overlay 类型/Theme import，新增窄 context host | ✅ |
| model-overlay selection guard | _待提交_ | 行为收紧：`/model provider/id` exact 与 overlay select 均先 ensure provider；配置取消不切换、不写默认模型；未跑 build/test（低性能机器策略） | `ModelSelectorComponent` 移除 provider/default-model side effect，caller 统一 apply selected model | ✅ |
| …（随抽取追加）| | | | |

## 与 P5 runbook 的关系

本表 = 实际执行顺序 + 验证状态；[P5-ui-split.md](../../execution-plan/P5-ui-split.md) = 出口门定义（V5-1…V5-5）。卡片（findings/UIxx）= 每个边界的 why。三者随抽取同步回填（同 P4 的三层：llm-wiki/ownership 表/review 卡）。
