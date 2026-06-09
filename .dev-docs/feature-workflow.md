# Feature Development Workflow

> **开发前必读。** 把 `.dev-docs/architecture-review/` 的评审思路（如何顶层设计、如何评审功能质量）固化成**每次功能开发都走的判断流程**。
> 入口链接自根 P1 [`AGENTS.md`](../AGENTS.md)。本次重构的收益结论见 [architecture-review/REFACTOR-LEDGER.md §1b](./architecture-review/REFACTOR-LEDGER.md)。

```yaml
doc: feature-workflow
status: canonical
applies_to: 所有新功能 / 重构 / bugfix（按影响面分级，见 §3）
supersedes: REFACTOR-LEDGER §1c（已毕业到本文）
```

---

## 0. 为什么有这份文档

重构（P0–P6）给项目分了层、立了 owner、加了守门规则。但**分层只有"被日常开发持续遵守"才有价值**——否则几个月后又会长出新的 god 文件、反向依赖、重复规则。

这份文档 = 把架构评审从"一次性重构 handbook"沉淀成"**每个功能都走的同一套判断**"。目标是：开发新功能时**能感知到架构**，而不是每次都从头读一遍目录结构才知道往哪写。

---

## 1. 核心心法

> 架构评审**不是**写代码前多写文档。它是写代码前问清同一组问题：

1. **Owner**：这个需求要改变的能力，当前有没有明确的 owner？（core / mode / extension / package / platform / build）
2. **分层契合**：改动是否符合现有分层——不跨层、不反向 import、不在两处重复同一规则？
3. **收益 vs 抽象**：引入的新抽象，收益是否大于它的理解/维护成本？（能删的分支 > 能写对的分支）
4. **可验收**：功能是否不变或按预期变化，且**能自动或人工复现**？

---

## 2. 四步循环（每个功能都走）

| Step | 问题 | 必看材料 | 输出 |
|------|------|----------|------|
| **1. Feature intake** | 要改变什么能力？落在哪一层（core/mode/extension/package/platform/build）？ | [`target-architecture.md`](./architecture-review/target-architecture.md)、相关模块的 P2 `AGENT.md` | 一句话意图 + 影响面清单 |
| **2. Feasibility & boundary** | 当前架构是否已有 owner？会不会跨层 / 反向 import / 重复规则？ | 相关 P2/P3、[`evolution/dev-conventions.md`](./architecture-review/evolution/dev-conventions.md)、历史 review/finding | 落点判断：**纯搬 / 局部改 / hybrid / 需专项评审**（§3）|
| **3. Architecture-fit design** | 如何在现有分层里实现，而不是新增耦合？ | §4 的实现原则 | 设计草案：owner、ports、依赖方向、兼容性、token/perf 影响 |
| **4. Acceptance review** | 功能对不对？文档同步没？守门绿没？ | §5 验收门 | 验收结论：**通过 / 需补测 / 需 ADR 接受 trade-off** |

> Step 1–2 通常几分钟；只有 Step 2 判定"需专项评审"时才走 §3 的重流程。**大多数小改动止于这张表。**

---

## 3. 何时升级为"专项评审"（先评审，后写代码）

满足**任一**条件，不要直接开写，先在 `.dev-docs/architecture-review/<topic>-review/` 建专项评审：

- 改 **load-bearing 区域**：runtime/session、interactive mode、extension host、package/public API、build/release。
- 单文件预计 **> 400 行**，或新 controller/context 需要 **≥ 8 个能力 port**。
- 需要**重写**而非纯搬；或存在 **token 消耗 / 兼容性 / 性能 / 发布体积**影响。
- 会改 **public API / npm deps / 默认启用 extension / CLI·TUI 用户路径**。
- **找不到明确 owner**，或同一规则要在两个模块重复实现。

专项评审最小产物（参考 `runtime-session-review/` `interactive-ui-review/` 的同型）：

```text
<topic>-review/
  README.md        # scope / status / decision / acceptance
  findings/UIxx-*.md   # one card per finding（边界争议 / 归属风险）
  closure.md       # 收尾：实施了什么、deferred 了什么、reopen 条件
```

> 这套流程已被 P4（runtime-session-review，12 卡）/ P5（interactive-ui-review，UI01-08）/ P6（entry-volume-review，EV01-05）/ P7（bundle-redesign-review，BR01-04）验证有效——它们是"如何顶层设计 + 如何评审功能质量"的活样板，新评审照搬即可。

---

## 4. 架构契合的实现原则（重构沉淀的模式）

写 Step 3 设计时，照这些已被守门固化的模式：

| 原则 | 含义 | 反例 |
|------|------|------|
| **capability-context** | controller/服务只接收**命名能力闭包**的窄 context | 整个 `InteractiveMode` / `AgentSession` 传进去（service-locator）|
| **single owner** | 每个副作用/overlay/状态只有一个 owning 模块 | 同一状态散落多处 `this._` |
| **DIP P1/P2/P3** | map 与 terrain 同构：新文件补 P3 头，新模块补 P2，删/移文件同步 P2 | 改代码不同步文档 |
| **依赖方向单一** | `platform/` 零业务、不被业务反向依赖；`core/lib/*` 内部库；`packages/*` 真发布包 | host 反向依赖内部库内部符号 |
| **token / perf 中性** | 重构类改动不得隐性增加 LLM 调用 / prompt-context / 发送体积 | 拆 UI 顺手改了发给模型的内容 |

详细 WHY 见各 review 子目录（历史决策档）：[runtime-session-review](./architecture-review/runtime-session-review/) · [interactive-ui-review](./architecture-review/interactive-ui-review/) · [entry-volume-review](./architecture-review/entry-volume-review/) · [bundle-redesign-review](./architecture-review/bundle-redesign-review/) · [sdk-surface-review](./architecture-review/sdk-surface-review/)。

---

## 5. 验收门（自动 + 人工）

| 门 | 目的 | 命令 | CI 现状 |
|----|------|------|---------|
| **DIP** | map-terrain 同构 | `npm run verify:dip` | ✅ `ci.yml` |
| **Quality** | 无循环 + 边界不污染 | `npm run verify:quality` | ✅ `quality.yml` |
| **Build/Type** | 可编译 | `npm run build && npx tsc --noEmit` | ✅ `ci.yml` |
| **Package boundary** | public 包 vs 内部库边界（BR01）| `npm run verify:package-boundary`（`:dist` 验内嵌库可解析）| ⚠️ **未接 CI（手动）** — 待接进 `quality.yml` |
| **Public API** | 兼容性显式 | 符号 diff 对 `architecture-review/baseline/public-api-symbols-main.txt` | 手动；**默认不破，破必须先声明 intentional API diff（major 窗口）** |
| **Token/perf** | 不隐性涨成本 | 人工 review：LLM 调用链 / provider lazy / prompt 注入是否中性 | 人工 |
| **UX smoke** | 用户路径可用 | 按 [`beta-smoke-checklist.md`](./architecture-review/beta-smoke-checklist.md) | 人工，重点走默认路径 + 错误兜底 |

> **唯一已知缺口**：`verify:package-boundary` 还没接进 CI（BR01 guard 目前只手动）。把它加进 `quality.yml` 是关闭 workflow 自动化的最后一步。

---

## 6. PR 自检清单

提 PR 前过一遍（对应 §5）：

- [ ] 改/加文件都有 P3 头；新模块/目录登记进 P2 `AGENT.md`；删/移文件同步 P2。
- [ ] `verify:dip` / `verify:quality` / `verify:package-boundary` 本地绿。
- [ ] `build` + `tsc --noEmit` 绿。
- [ ] 没新增反向 import / service-locator context / 重复规则。
- [ ] public API 未变；若变，PR 描述显式声明 intentional diff + 影响面。
- [ ] LLM 调用/prompt/发送体积是否 token 中性，已说明。
- [ ] 涉及用户路径的改动，过了相关 UX smoke。
- [ ] 命中 §3 触发条件的，已先建专项评审并链接。

---

## 7. 参考（评审思路来源）

- [`architecture-review/methodology.md`](./architecture-review/methodology.md) — 评审词汇与认知层（Phenomenon/Essence/Philosophy）。
- [`architecture-review/target-architecture.md`](./architecture-review/target-architecture.md) — 端态目录 + 功能域映射。
- [`architecture-review/REFACTOR-LEDGER.md`](./architecture-review/REFACTOR-LEDGER.md) — 重构收益结论、已发现问题、已接受 trade-off、未完成项（P7/P8）。
- [`architecture-review/evolution/dev-conventions.md`](./architecture-review/evolution/dev-conventions.md) — 重构后开发约规。
