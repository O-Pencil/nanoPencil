# Target Architecture — Phase 2 综合层（grilling 后修订）

```yaml
phase: 2-synthesis
produced_at: 2026-05-27T15:38:00Z
revised_at: 2026-05-28T01:25:00Z  # Phase 3a grilling 后修订
status: phase_3a_grilled
based_on:
  - findings/F01-agent-session-god-module.md
  - findings/F02-interactive-mode-god-file.md
  - findings/F03-root-barrel-causes-cycles.md
  - findings/F04-residual-small-cycles.md
  - findings/F05-extensions-types-monolith.md
  - findings/F06-modes-static-imports.md
  - findings/F07-dist-bundle-composition.md
  - findings/F08-quality-rules-not-enforced.md
  - top-level-structure-review.md  # ★ Phase 2.5 顶层评审
benchmark_projects:  # ★ grilling 期间业界对标
  - openclaw/openclaw       # 375k★ TS pnpm monorepo
  - continuedev/continue    # 33k★ TS yarn monorepo - 候选 D 同形参考
  - openai/codex            # 86k★ Rust+TS+Py 多语言 monorepo
  - HKUDS/nanobot           # 43k★ Py 单包
  - Aider-AI/aider          # 45k★ Py 单包
product_charter: .PENCIL.md
audience: pencil maintainer
```

> **修订说明（2026-05-28）**：原 §4 目录结构基于"在现有 packages/core/modes/extensions 四分法下做减法"。Phase 2.5 顶层评审揭示 packages/ 是"形式上的多包，实质上的单包"，且 README 三层（Cognitive/Tool/Interface）与代码目录无映射。Phase 3a grilling 选定**候选 D**（详见 top-level-structure-review.md §6.D），§4 据此重写为基于 `core/` + `core/lib/` + `core/platform/` + `packages/` (3 真发布包) 的目标结构。
>
> 本文是 Phase 2 与 Phase 3 之间的**综合层**，把 8 个 finding + 顶层评审综合为一份目标架构愿景。**不取代** finding cards（每个 finding 的 deletion test、benefits 仍在原卡中），但提供一个**单一可争论的整体设计**。
>
> **文档职责**：本文维护"目标是什么"——目录结构、功能域映射、PARP/continuity 协议边界、迁移批次。`top-level-structure-review.md` 只维护"为什么选择候选 D"；`refactor-plan.md` 只维护"按什么顺序执行"。

---

## 1. 综合诊断：8 个 finding 收敛到 4 类根本症结

把 8 个 finding 不再视为 8 件独立的事，而是同一个底层失序的 4 个表面：

### 1.1 边界缺失（Boundary Absence）

**症状**：F03 主因 + F04 部分 + 新补：mem-core 跨包反向 import

仓库**没有"对外 SDK 表面"与"对内 contract"的明显 seam**。一个 barrel（`index.ts`）同时干 SDK 入口、内部 alias、main entry 三件事；`packages/mem-core` 通过 npm 包名 `@pencil-agent/nano-pencil` 反向 import host 类型，使一个"独立可发布的包"在概念上变成了"嵌套在 host 里"的东西。

**本质**：缺一个"内部 / 外部 / package"的三层边界声明。

### 1.2 职责过载（Responsibility Bloat）

**症状**：F01（agent-session 3408 行）+ F02（interactive-mode 7868 行）+ F05（extensions/types.ts 1446 行）

三个文件占了仓库**8% 的代码量**（约 12 700 / 170 030 行），每个都在一个文件内同时承担 5–10 个互相不相干的责任。这不是"做太多事"的问题，是**"把不相干的事物理上塞进同一空间"**。

**本质**：缺一个"按职责轴切分"的强制纪律。

### 1.3 入口非懒（Eager Entry）

**症状**：F06（modes 静态导入）+ F07（dist 整 copy 无 tree-shaking）+ F02 加重

任何调用方（CLI 用户、Gateway SDK、编辑器扩展）都被迫付出"全 mode + 全 provider + 全扩展"的启动 cost，**即使只用其中一小部分**。Browser Harness 1.4MB 是这种"恒付"模式最贵的一例。

**本质**：缺一个"按需加载"的入口契约。

### 1.4 规则与现实脱节（Charter ≠ Terrain）

**症状**：F08

`core/CLAUDE.md` 自身写下 4 条 quality rule（≤400 行 / ≤15 文件/目录 / 无循环 / JSDoc），但**全部被违反**，且无 CI 守门。`scripts/verify-dip.ts` 验证文档存在性全绿，但**不验证规则本身**。

**本质**：缺一个"把规则提升为可执行守门员"的机制。

---

## 2. 功能域识别（Functional Domains）

要谈"目标目录结构"，先要把"pencil 在做什么"理清。今天的目录布局是按"实现层"分（core / modes / packages / extensions），但**问题是每个功能横跨 2-4 个层**。

下表是按**功能域**重新切的视图，每个域回答 "为什么这个域必须存在 + 它的关键不变量"：

| # | 功能域 | 为什么必须存在 | 关键不变量 | 今天散布在 |
|---|--------|---------------|-----------|------------|
| **D1** | **Agent 引擎** | Pencil 的产品本体：模型→工具→输出循环。`.PENCIL.md` 的 "Jarvis-like operator" 体验完全靠它撑 | 跨 4 种 mode 接口稳定；可被 SDK 嵌入（如 Gateway）；不依赖任何 UI | `core/runtime/`、`packages/agent-core/`、`core/tools/`、`core/session/`、`core/prompt/`、`core/soul-integration.ts` |
| **D2** | **扩展运行时** | 让产品保持薄但能力可扩；MCP、grub、loop、team 等行为都靠它 | hook contract 稳定；不向用户态写入（charter §1） | `core/extensions/`、`builtin-extensions.ts`、`extensions/defaults/`、`extensions/optional/` |
| **D3** | **AI Provider 抽象** | 用户不锁厂；多 provider 是 charter §"模型自由" | OpenAI-style 接口契约；新 provider 加入零侵入；可独立发布 | `packages/ai/` |
| **D4** | **存储 / 持久化** | 会话连续性 + 凭据安全 + 设置生效；charter §"Privacy First" | 用户态结构稳定（向后兼容）；凭据零泄漏；多 agent 隔离 | `core/session/`、`core/config/`、`core/agent-dir/`、用户 `~/.pencils/agents/` |
| **D5** | **认知 / 记忆 / 性格 / 连续性** | NanoMem + NanoSoul 是 README 力推的差异化；PencilAgent 要像"同一个人"持续成长，靠的是记忆、性格和自我解释机制的连续性 | 官方定义 canonical state、provenance、merge policy、prompt injection policy；可插拔模块只能提供存储/检索/候选更新/派生模型，不能绕过官方 engine 直接改写长期自我叙事 | `packages/mem-core/`、`packages/soul-core/`、`extensions/defaults/sal/`、`core/soul-integration.ts` |
| **D6** | **UI / 入口形态** | 4 种 mode：interactive TUI（产品旗舰）、print（CI/管道）、rpc（IDE）、acp（外部 agent 协议） | TUI 行为零回归（charter §人格契约）；mode 之间可独立演化 | `modes/`、`packages/tui/` |
| **D7** | **遥测 / 自我观察** | 1.14.3 后的 ext_* 三表 + SAL eval + diagnostics；handbook 三 Agent 程序的数据底座 | 用户态零写入；凭据缺失→noop；隐私字段白名单 | `core/telemetry/`、`extensions/defaults/{diagnostics,sal}/`、`scripts/self-diagnosis/` |
| **D8** | **平台基础设施** | i18n、theme、keybinding、CLI args、migrations、package detection —— 共享低层工具 | 跨域无业务知识；只提供原语 | 散落：`core/i18n/`、`config.ts`、`migrations.ts`、`modes/interactive/theme/`、`utils/`、`core/keybindings.ts`、`core/utils/` |

**关键观察 1**：**D5 认知域跨越了 `packages/`、`extensions/defaults/`、`core/` 三个目录**。`packages/mem-core` 是包，`soul-integration.ts` 是 core 桥接器，`extensions/defaults/sal` 是扩展 —— 三种不同的"集成方式"对应同一类功能。grilling 后对 D5 的解释进一步收窄：官方不预先规定 PencilAgent 的全部"核心身份内容"，但必须规定它如何形成、更新、合并和解释长期状态。换言之，官方拥有 **Continuity Kernel（连续性内核）**，插件只进入受控的 provider / adapter / candidate update seam。

**关键观察 2**：**D6 UI 域里"产品旗舰"interactive TUI 占了 god 文件**，但 print/rpc/acp 三个**非旗舰但 SDK 嵌入更常用**的 mode 反而拆得相对干净。这暗示 god 文件不是"功能多"造成的，而是**"演进时没有同步重构"**。

**关键观察 3**：**D8 平台基础设施完全没有自己的目录**，被散落在 5-6 处。新增一个跨域共享原语没有明显落脚点。

---

## 3. 不合理设计归纳

按"应该是什么样子 vs 实际是什么样子"列出 7 处具体设计错位：

| # | 应该是 | 实际是 | 涉及 finding |
|---|--------|--------|--------------|
| **U1** | `index.ts` 仅服务外部 SDK 用户；内部模块通过 `core/_internal.ts` 共享 | `index.ts` 是 SDK 入口 + 内部 alias + main re-export 三合一 | F03 |
| **U2** | `core/` 单向依赖 `modes/` 反过来不允许（P1 拓扑） | `agent-session.ts:32` 与 `extensions/types.ts:39` 都反向 import `modes/interactive/theme` | F01、F05 |
| **U3** | `packages/mem-core` 等独立 workspace 包 → 通过 host **接口**集成 | mem-core `import from "@pencil-agent/nano-pencil"`，是反向类型依赖 host 包；被 bundle-deps 整 copy 解决 | F03、F07 |
| **U4** | mode selection 应是 dynamic 入口（按需加载） | `modes/index.ts` 12 行全 static export；只有 ACP 偶然走 `await import()` | F06 |
| **U5** | 默认扩展应是"用户大概率用到"的，opt-in 给低频/重资产 | Browser Harness 1.4MB 是默认 vendored；ext-telemetry 是 opt-in（合理）；但 sal/team/grub 都默认 enable | F07 |
| **U6** | quality rule 应是可执行的 invariants | 4 条规则全在文档里没人执行 | F08 |
| **U7** | 类型应按"消费域"分文件（contract by consumer） | `extensions/types.ts` 1446 行单文件囊括 15 个消费方的所有类型 | F05 |

**U2 + U3 合起来**揭示一个深层问题：**Pencil 既想做"轻量库"又想做"重量级应用"**。
- 当成"库"时，`@pencil-agent/ai` 这类包应该独立发布、严格 semver、不被 host 反向引用
- 当成"应用"时，所有代码塞在 `nanoPencil/` 一个仓库，vendor 整 copy，根本不存包发布问题
- 现状是**两者都做了一半**：有 workspace 包 + bundle-deps，但 package 边界并不真的隔离

这是 Phase 3 grilling 的核心议题之一（见 §6.Q1）。

---

## 3.5 上位抽象：Pencil Agent Runtime Protocol（PARP）

候选 D 解决"代码应该怎么摆"；PARP 解释"这些目录共同抽象出什么"。

**定义**：Pencil 的底层不是单一 CLI，而是一套可宿主、可组合、可扩展的 **Agent Runtime Protocol**。CLI 是默认 host profile；Browser 是 browser tool runtime + browser agent profile；Gateway 是 remote host adapter；Editor 是 caller-owned tool runtime。nanoPencil 的长期定位不是"一个 CLI + 插件"，而是 Pencil 生态里能配置出多类 PencilAgent 的 runtime 内核。

### 3.5.1 PARP 的组合公式

```text
PencilAgent =
  Agent Loop
  + Tool Runtime
  + Agent Profile
  + Continuity
  + Host Adapter
  + Permission Policy
```

不同形态只是 profile 与 runtime 组合不同：

```text
CLI PencilAgent
  = local shell/file/edit/grep tools
  + terminal host surface
  + local workspace
  + default continuity

Browser PencilAgent
  = browser tool runtime（open/click/type/screenshot/extract/waitFor）
  + browser session state
  + browser-specific loop policy
  + browser permission policy

Gateway PencilAgent
  = remote tool transport
  + HTTP/SSE host adapter
  + multi-agent isolation
  + usage/billing boundary

Editor PencilAgent
  = caller-owned workspace tools
  + ACP / Remote HTTP bridge
  + document/context runtime
```

### 3.5.2 五层协议边界

| PARP 层 | 责任 | 目标目录 |
|---------|------|----------|
| Agent Loop | 模型 → 工具 → 观察 → 下一步；不关心具体 host | `core/runtime/` + `core/lib/agent-core/` |
| Tool Runtime | CLI / Browser / Editor / MCP / Remote 等工具执行环境 | `core/tools/` + `extensions/*` + `packages/extension-sdk/tools.ts` |
| Agent Profile | 把 loop policy、tool runtime、continuity、权限组合成一种 PencilAgent | `core/agent-profile/` |
| Host Adapter | CLI / ACP / Gateway HTTP / Editor / Browser session 等宿主适配 | `modes/` + Gateway SDK 嵌入 + ACP |
| Continuity | 记忆、灵魂、认知地图、长期状态合并 | `core/continuity/` + `packages/mem-core/` + `packages/soul-core/` |

### 3.5.3 工具也是协议化 endpoint

工具不应只是散落的函数，而是 Agent Loop 可调用的协议化 endpoint：

```ts
interface AgentToolProtocol {
  name: string;
  schema: JsonSchema;
  invoke(input: unknown, context: ToolInvocationContext): Promise<ToolResult>;
  permissions: PermissionSpec;
  runtime: "local" | "remote" | "browser" | "mcp" | "hosted";
}
```

在这个模型下，`bash`、`read_file`、`edit`、`browser.click`、`browser.open`、`editor.insert_text`、MCP tools、remote tools 都是同一套 Tool Protocol 的不同实现。Browser 能力可以作为 `extensions/optional/browser/` 提供的 **Browser Tool Runtime**，而 Browser Agent 则是一个使用该 runtime 的 **Agent Profile**，不是把整个 browser agent 塞进普通插件。

### 3.5.4 与候选 D 的关系

PARP 不替代候选 D，也不新增一个必须立即完成的大批次。它是候选 D 的命名原则和抽象边界：

- `packages/extension-sdk/` 不只是 plugin SDK，而是公开 runtime protocol 的稳定入口
- `extensions/optional/browser/` 从"低频大资产扩展"重新归类为 Browser Tool Runtime
- 新增 `core/agent-profile/`，先承载 profile schema / built-in profiles，不急于做 marketplace 或 UI
- `core/continuity/` 继续保留 Memory/Soul 的官方连续性解释权，profile 只能选择或配置 continuity 策略，不能绕过 merge policy

短期落地只要求类型命名和目录语义向 PARP 对齐；完整多 Agent Profile 平台化留给后续阶段。

---

## 4. 目标目录结构（grilling 后修订到候选 D）

按 §1 四类症结、§2 八个功能域、§3 七处错位推导，**叠加 Phase 2.5 顶层评审的候选 D 决议**（详见 `top-level-structure-review.md §6.D`）。

业界对标依据：Continue.dev 33k★ TS 项目使用 `core/`（顶层业务核心）+ `packages/`（细粒度真发布库，含 SDK）+ `extensions/`（host 适配器）三层布局，与本目标结构同形。

```
nanoPencil/
│
├── cli.ts                              ← CLI 入口（不变）
├── main.ts                              ← 模式分发（变薄；改 dynamic dispatch）
├── index.ts                             ← 【语义变更】仅服务外部 SDK，禁止内部 import
├── builtin-extensions.ts                ← 不变
├── nanopencil-defaults.ts               ← 不变
├── migrations.ts                        ← 不变
│
├── core/                                ← Continue 风："仓库核心"（业务 + 通用库 + 横切）
│   │  ━━━ 业务核心子目录（直接挂 core/）━━━
│   │
│   ├── runtime/                         ← 【F01 拆完】Agent 引擎域
│   │   ├── agent-session.ts             ← 3408 → < 500，退化为 Composition Root
│   │   ├── session-lifecycle.ts         ← 【新】启动/停止/abort 状态机
│   │   ├── model-cycle.ts               ← 【新】CycleModelError + xhigh 兜底
│   │   ├── compaction-pipeline.ts       ← 【新】包装 CompactionCoordinator
│   │   ├── tool-dispatch.ts             ← 【新】ToolOrchestrator + bash 直通
│   │   ├── prompt-assembly.ts           ← 【新】系统 prompt + soul context 注入
│   │   ├── export-bridge.ts             ← 【新】HTML 导出绑定
│   │   ├── ui-bridge.ts                 ← 【新】注入 ThemeProvider / I18nProvider
│   │   ├── sdk.ts                       ← 不再 import soul-integration（F04 修）
│   │   ├── pencil-agent.ts              ← 不变
│   │   ├── retry-coordinator.ts         ← 不变
│   │   ├── event-bus.ts                 ← 不变
│   │   ├── turn-context.ts              ← 不变
│   │   └── CLAUDE.md                    ← 【更新】member 列全（修 DIP 漂移）
│   │
│   ├── tools/                           ← 内置工具实现（不变）
│   ├── mcp/                             ← 【F04 修】新增 mcp-types.ts
│   │   ├── mcp-types.ts                 ← 【新】client & config 共用契约
│   │   ├── mcp-client.ts                ← import mcp-types
│   │   └── mcp-config.ts                ← import mcp-types
│   │
│   ├── extensions-host/                 ← 【F05 + Q12】扩展运行时（rename 自 core/extensions/）
│   │   ├── runner.ts
│   │   ├── loader.ts                    ← 4-tier loader（Q12 协议化）
│   │   ├── wrapper.ts
│   │   ├── registry.ts                  ← 【新】tool/theme/command/hook/provider 注册中心
│   │   ├── sandbox.ts                   ← 【新】risk-level 沙箱
│   │   ├── permissions.ts               ← 【新】第三方扩展权限提示
│   │   └── cognitive-provider-bridge.ts ← 【新】MemoryStore / SoulFacet / CognitiveModel provider 桥接
│   │
│   ├── continuity/                       ← ★ 【新 D5】连续性内核（官方解释权）
│   │   ├── canonical-state.ts            ← Memory/Soul/SAL 可引用的长期状态 schema
│   │   ├── provenance.ts                 ← 状态来源、confidence、scope、版本
│   │   ├── merge-policy.ts               ← 插件候选更新如何进入 canonical state
│   │   ├── prompt-injection-policy.ts    ← 哪些状态可进入 system prompt / recall prompt
│   │   ├── cognitive-model-contract.ts   ← SAL 等派生认知模型的只读/候选更新边界
│   │   └── README.md                     ← 面向人/技术的双层解释映射
│   │
│   ├── session/                         ← 不变
│   ├── prompt/                          ← 不变
│   ├── model/                           ← 不变
│   ├── agent-profile/                   ← ★ 【新 PARP】Agent Profile schema / built-in profiles / profile resolver
│   ├── sub-agent/                       ← 不变
│   ├── agent-dir/                       ← 不变
│   ├── persona/                         ← 不变
│   ├── workspace/                       ← 不变
│   ├── export-html/                     ← 不变
│   ├── slash-commands.ts                ← 不变
│   ├── soul-integration.ts              ← 【F04 修】不再 import sdk.ts；改走 continuity + soul-core 官方 engine
│   ├── soul-options-contract.ts         ← 【新】soul ↔ sdk 共享契约（低层 option，不承载身份解释权）
│   ├── model-registry.ts                ← 不变
│   ├── model-resolver.ts                ← 不变
│   ├── package-manager.ts               ← 1795 行（候选 D 不强制拆，但建议）
│   │
│   │  ━━━ 通用库（多管一层）━━━
│   │
│   ├── lib/                             ← ★ 不打算独立发布的内部库
│   │   ├── ai/                          ← 原 packages/ai；通过 workspaces 提供路径解析
│   │   │   ├── src/
│   │   │   │   ├── providers/           ← 11 个 provider
│   │   │   │   ├── models.generated.ts  ← 【F07】14506 行考虑拆 11 个 per-provider lazy
│   │   │   │   ├── types.ts
│   │   │   │   ├── utils/
│   │   │   │   │   ├── event-stream.ts
│   │   │   │   │   └── event-stream-types.ts  ← 【新】解 F04 环 C
│   │   │   │   └── ...
│   │   │   ├── package.json             ← name: @pencil-agent/ai (private: true)
│   │   │   └── tsconfig.json
│   │   ├── agent-core/                  ← 原 packages/agent-core
│   │   │   ├── src/  package.json  tsconfig.json
│   │   └── tui/                         ← 原 packages/tui
│   │       ├── src/  package.json  tsconfig.json
│   │
│   │  ━━━ 横切基础设施（多管一层）━━━
│   │
│   ├── platform/                        ← ★ 横切原语，无业务知识
│   │   ├── i18n/                        ← 原 core/i18n/
│   │   ├── telemetry/                   ← 原 core/telemetry/（1.14.3 已干净）
│   │   ├── utils/                       ← 原 core/utils/
│   │   ├── config/                      ← 原 core/config/（settings/auth/resource-loader）
│   │   └── keybindings.ts               ← 原 core/keybindings.ts
│   │
│   ├── _internal.ts                     ← 【F03】内部模块共享 contract barrel
│   ├── theme-contract.ts                ← 【新】纯类型，解 U2 反向依赖
│   └── CLAUDE.md                        ← 【更新】quality rule 改为可执行版本（与 F08 联动）
│
├── modes/                               ← 【F06 重组】UI 入口形态
│   ├── index.ts                         ← 【F06】退化为 < 50 行 facade
│   ├── _shell/                          ← 【新】跨 mode 复用骨架（仅 cancellation；Q7 决议）
│   │   └── cancellation.ts
│   ├── interactive/                     ← 【F02 拆完】
│   │   ├── interactive-mode.ts          ← 7868 → < 500，仅 mount 入口
│   │   ├── controllers/                 ← 【新子目录】5 个 controller
│   │   │   ├── slash-dispatcher.ts
│   │   │   ├── model-overlay.ts
│   │   │   ├── session-tree.ts
│   │   │   ├── auth-controller.ts
│   │   │   └── image-pipeline.ts
│   │   ├── state/                       ← 【新】UI 状态合一
│   │   ├── components/                  ← 不变（47 文件）
│   │   └── theme/                       ← 不变；实现 core/theme-contract
│   ├── print/                           ← 不变
│   ├── rpc/                             ← 不变
│   └── acp/                             ← 不变
│
├── extensions/                          ← 第一方扩展（dev 时直接加载，OpenClaw 风）
│   ├── builtin/                         ← 【rename】"defaults" → "builtin"
│   │   ├── memory-binding/              ← ★ 【新】把 mem-core 官方 engine 接到 continuity
│   │   ├── soul-binding/                ← ★ 【新】把 soul-core 官方 engine 接到 continuity
│   │   ├── sal/  mcp/  loop/  diagnostics/  soul/  presence/
│   │   ├── grub/  team/  subagent/  plan/  recap/
│   │   ├── discipline/  interview/  idle-think/
│   │   ├── link-world/  security-audit/  token-save/  btw/  debug/
│   │   └── AGENT.md
│   ├── optional/                        ← 2 → 3+ 个
│   │   ├── browser/                     ← 【F07】从 builtin/ 迁来
│   │   ├── simplify/
│   │   └── export-html/
│   ├── AGENT.md
│   └── third-party.md                   ← ★ 【新】第三方扩展开发指南
│
├── packages/                            ← ★ 候选 D：只放真发布的子包（3 个）
│   ├── extension-sdk/                   ← ★ 【新】协议 + 类型契约（等同 Continue 的 continue-sdk）
│   │   ├── src/
│   │   │   ├── index.ts                 ← 总入口
│   │   │   ├── agent-profile.ts         ← ★ Agent Profile 协议（loop + tools + continuity + permissions）
│   │   │   ├── host-adapter.ts          ← ★ Host Adapter 协议（CLI / ACP / Gateway / Editor）
│   │   │   ├── tools.ts                 ← Tool 协议
│   │   │   ├── tool-runtime.ts          ← ★ Tool Runtime 协议（local/remote/browser/mcp/hosted）
│   │   │   ├── themes.ts                ← Theme 协议
│   │   │   ├── hooks.ts                 ← Hook 协议
│   │   │   ├── commands.ts              ← SlashCommand 协议
│   │   │   ├── memory-store.ts          ← ★ Memory 存储介质协议（jsonl/sqlite/vector/mem0/zep）
│   │   │   ├── memory-candidate.ts      ← ★ 插件提交 memory 候选更新，不直接写 canonical state
│   │   │   ├── soul-facet-provider.ts   ← ★ 外部人格侧面/偏好信号 provider
│   │   │   ├── cognitive-model-provider.ts ← ★ SAL/认知地图等派生模型 provider
│   │   │   ├── permissions.ts
│   │   │   └── lifecycle.ts             ← Extension / Context / Factory
│   │   ├── package.json                 ← @pencil-agent/extension-sdk
│   │   ├── tsconfig.build.json
│   │   └── README.md                    ← 第三方开发者手册
│   │
│   ├── mem-core/                        ← NanoMem 默认实现，真发布 npm（已 1.1.0）
│   │   ├── src/
│   │   │   ├── index.ts                 ← export NanoMemEngine（官方基础记忆实现）
│   │   │   ├── stores/                  ← 默认本地 store + 可选外部 store adapter
│   │   │   ├── extension.ts             ← 不再 import host；只 import extension-sdk 的低层协议（修 U3）
│   │   │   └── ...
│   │   ├── package.json                 ← peerDependencies: @pencil-agent/extension-sdk
│   │   └── tsconfig.build.json
│   │
│   └── soul-core/                       ← NanoSoul 官方基础实现，需补 npm 发布（当前 0.1.0 npm 404）
│       ├── src/                         ← SoulEngine + facet merge candidates；不把整套 soul 解释权外包
│       ├── package.json
│       └── tsconfig.build.json
│
├── scripts/
│   ├── verify-dip.ts                    ← 不变
│   ├── verify-quality.ts                ← 【新 F08】把 4 条 quality rule 提升为可执行
│   ├── promote-to-package.ts            ← ★ 【新】core/lib/ → packages/ 自动化工具（设计 4 辅助）
│   ├── bundle-deps.js                   ← 【删除】走 npm 自然解析
│   └── ...
│
├── .github/workflows/
│   ├── quality.yml                      ← 【新 F08】PR 守门
│   └── ...
│
└── .dev-docs/                           ← 不变（架构评审 / 自诊断 / SAL / self-awareness 四并行程序）
```

### 4.1 host package.json 关键变化（候选 D 落地）

```jsonc
{
  "name": "@pencil-agent/nano-pencil",
  "version": "1.15.0",                          // ★ 顶层重构建议 minor bump
  "dependencies": {
    "@pencil-agent/extension-sdk": "workspace:^",  // ★ 真依赖
    "@pencil-agent/mem-core": "workspace:^",       // ★ 真依赖
    "@pencil-agent/soul-core": "workspace:^",      // ★ 真依赖
    // ... 其他第三方
  },
  "workspaces": [
    "core/lib/*",                                // 内部库（提供路径解析，不发布）
    "packages/*"                                 // 真发布的包
  ]
}
```

`core/lib/<name>/package.json` 显式标 `"private": true`，禁止 npm publish。

### 4.2 现状 → 候选 D 迁移映射（关键路径变化）

| 现路径 | 目标路径 | 变化类型 |
|--------|---------|---------|
| `packages/ai/` | `core/lib/ai/` | 退到内部库（不发布） |
| `packages/agent-core/` | `core/lib/agent-core/` | 同上 |
| `packages/tui/` | `core/lib/tui/` | 同上 |
| `packages/mem-core/` | `packages/mem-core/` | 不变（保独立发布身份） |
| `packages/soul-core/` | `packages/soul-core/` | 不变（保独立发布身份） |
| — | `packages/extension-sdk/` | ★ 新增 |
| `core/extensions/` | `core/extensions-host/` | rename，避免与 `extensions/` 顶层撞名 |
| — | `core/agent-profile/` | ★ 新增（PARP：profile schema / built-in profiles / resolver） |
| `core/i18n/` | `core/platform/i18n/` | 升到 platform/ 横切 |
| `core/telemetry/` | `core/platform/telemetry/` | 同上 |
| `core/utils/` | `core/platform/utils/` | 同上 |
| `core/config/` | `core/platform/config/` | 同上 |
| `core/keybindings.ts` | `core/platform/keybindings.ts` | 同上 |
| `extensions/defaults/` | `extensions/builtin/` | rename（更准确） |
| `extensions/defaults/browser/` | `extensions/optional/browser/` | F07 迁移 |
| — | `extensions/builtin/memory-binding/` | ★ 新增（官方 MemoryEngine ↔ continuity 桥接） |
| — | `extensions/builtin/soul-binding/` | ★ 新增（官方 SoulEngine ↔ continuity 桥接） |
| `scripts/bundle-deps.js` | (删除) | 走 npm 自然解析 |

---

## 5. 目录的"为什么这样设计"（功能域 × 候选 D 目录映射）

把 §2 的 8 个功能域映射到 §4 的目标目录，每个回答 "为什么放在这里"。**已根据候选 D 修订**。

### D1 Agent 引擎 → `core/runtime/` + `core/lib/agent-core/` + `core/tools/`

- `core/lib/agent-core/`：**纯 Agent loop 抽象**（model → tool → output），不知道 pencil 业务；**当前 0 外部消费者 → 退 lib 不发布**。若未来真出现外部消费者，跑 `promote-to-package.ts agent-core` 升回 `packages/agent-core/` 即可
- `core/runtime/`：pencil 业务的 "Composition Root" 层 —— 把 agent-core + tools + session + extensions-host 黏在一起
- `core/tools/`：内置工具实现；在 PARP 下它们是 Tool Runtime 的本地实现，不在 lib 是因为它绑定 pencil 的"信任模型"（bash 沙箱、edit 行号、ls 截断）
- `core/agent-profile/`：PARP 的 profile 层，负责把 loop policy、tool runtime、continuity、permissions 组合成 CLI / Browser / Remote / Editor 等 PencilAgent 形态；B0 只要求 schema + 内置 profile，完整 marketplace 不在本轮范围
- **拆 F01 后**：`runtime/` 内 7 个子模块各自 < 400 行，`agent-session.ts` 是装配壳

### D2 扩展运行时 → `core/extensions-host/` + `extensions/{builtin,optional}/`

- `core/extensions-host/`：**协议宿主**（loader / runner / wrapper / registry / sandbox / permissions）；**4-tier loader**（builtin → optional → user-dir → npm）
- `extensions/builtin/`：用户大概率用到的扩展，启动时 eager load；**rename** "defaults" → "builtin"（更准确）
- `extensions/optional/`：用户**需要时才启用**的扩展（资产重、影响隐私、需配置）
- **拆 F05 后**：扩展类型按消费域分 4 个文件（生命周期 / 工具 / UI / 命令）
- **F07 后**：browser 从 builtin 迁到 optional —— 不是"功能降级"，是"诚实地表达成本"；在 PARP 下它应被标注为 Browser Tool Runtime，供 `browser-agent` profile 组合使用
- **Q12 协议化后**：`extensions/builtin/memory-binding/` 是 Memory 默认绑定；`soul-binding/` 是 Soul 默认绑定；第三方实现走 user-dir 或 npm tier

### D3 AI Provider 抽象 → `core/lib/ai/`

- **从 `packages/ai/` 退到 `core/lib/ai/`**：当前 0 外部消费者 + 0.0.1 不动 + 无可见独立路线
- `nanopencil-ai` bin 仍可保留（在 lib/ai/package.json 中），但**不作为发布 CLI 入口**
- `models.generated.ts` 是 codegen 产物；provider 元数据来自上游 API，需要定期 refresh
- **F07 拆完后**：按 provider 切 11 个文件，运行时只 lazy import 用户配置的 provider
- **未来路径**：若 OpenRouter / 其他项目想用 nanoPencil 的 multi-provider 抽象，跑 `promote-to-package.ts ai` 升回 `packages/ai/`

### D4 存储 / 持久化 → `core/session/` + `core/platform/config/` + `core/agent-dir/` + 用户 `~/.pencils/agents/`

- `core/session/`：会话 JSONL + compaction + branching；与 pencil 的"事件结构"紧耦合，没有独立价值
- `core/platform/config/`：settings / auth / resource-loader；SOP §3.3 stability contract，**任何变更走 REVIEW**
- 用户态 `~/.pencils/agents/<id>/`：charter "Privacy First"、**任何 refactor 不可破坏向后兼容**

### D5 认知域 → `core/continuity/` + `packages/mem-core/` + `packages/soul-core/` + `extensions/builtin/{memory,soul}-binding/` + `extensions/builtin/sal/`

- `core/continuity/`：**官方连续性内核**，定义 canonical state、provenance、merge policy、prompt injection policy。它不是"预先写死的核心身份内容"，而是 PencilAgent 如何形成、更新、解释"我是谁"的机制边界
- `packages/mem-core/` `packages/soul-core/`：**两个真发布的官方基础实现包**，对应 README 力推的 NanoMem / NanoSoul。它们是 Pencil 的默认器官级能力，不是普通可选插件
- 为什么是 packages 而非 core/lib：**maintainer 明确战略保留独立发布身份**，且未来可能跨 Pencil 子项目复用；但它们仍通过 `core/continuity/` 的规则进入 host
- `extensions/builtin/memory-binding/` `soul-binding/`：把 mem-core / soul-core 接入 host 的桥接扩展；桥接的是官方 engine 与低层 provider / store，不把长期人格解释权交给扩展
- **Q12 协议化关键（修订）**：第三方可写 `MemoryStore`、`MemoryCandidateProvider`、`SoulFacetProvider`、`CognitiveModelProvider` 等 provider/adapter，提供存储介质、检索候选、人格侧面或认知地图；最终是否 merge、是否长期保存、是否进入 prompt，仍由 `core/continuity/` + 官方 engine 决定
- `extensions/builtin/sal/`：留在扩展形态（不升包），通过 `core/platform/telemetry/` 通道写 `eval_*` 表；若 SAL 认知地图进入规划/召回/反思链路，则实现 `CognitiveModelProvider`，作为 **derived cognitive model** 被官方连续性内核消费，而不是直接成为 canonical state
- **修 U3 反向依赖**：mem-core 不再 import `@pencil-agent/nano-pencil`，只 import `@pencil-agent/extension-sdk` 的低层协议契约；canonical state 与 merge 规则由 host 的 `core/continuity/` 定义

#### D5.1 面向人 vs 面向技术的双层解释

| 面向人的说法 | 技术层面的定义 |
|--------------|----------------|
| 记忆 | `MemoryEngine` + `MemoryStore` + `RecallPolicy` |
| 灵魂 / 性格 | `SoulEngine` + `SelfModel` + `BehaviorProfile` |
| 经验沉淀 | `Episode` → `Consolidation` → `LongTermMemory` |
| 性格变化 | `ReflectionEvent` → `SoulUpdateCandidate` → `MergePolicy` |
| 认知地图 | `DerivedCognitiveModel` / `CognitiveModelProvider` |
| 身体器官 | `Provider` / `Store` / `Adapter` |
| 自我连续性 | `CanonicalAgentState` + `VersionedMergePolicy` + `PromptInjectionPolicy` |

### D6 UI / 入口形态 → `modes/` + `core/lib/tui/`

- `core/lib/tui/`：**纯渲染 + key handling 抽象**，从 `packages/tui/` 退下来（0 外部消费者）
- `modes/`：每个 mode 是一种"对外 surface"，**它们都消费同一个 D1 的 AgentSession**
- `modes/_shell/cancellation.ts`：跨 mode 复用骨架（Q7 决议：只抽 cancellation，prompt loop 各 mode 自维护）
- **F02 拆完 + F06 lazy 后**：interactive 不再连累其他 mode；SDK 嵌入只付应得的 cost

### D7 遥测 / 自我观察 → `core/platform/telemetry/` + `extensions/builtin/{diagnostics,sal}/` + `scripts/self-diagnosis/`

- `core/platform/telemetry/`：**通用底座**（HTTP 客户端 / batching / credentials / build-meta），1.14.3 已抽完，候选 D 下升 platform/
- `diagnostics/` 扩展：写 `pencil_issue_events`
- `sal/` 扩展：写 `eval_*` 表
- `core/extensions-host/runner.ts:invokeCommand/invokeHookHandler`：写 `ext_command_events` / `ext_llm_calls` / `ext_hook_events`
- `scripts/self-diagnosis/`：手动派发的 reflexive 自学习入口
- **架构上**：所有遥测都通过 `core/platform/telemetry/` 单一 sink；charter §"Privacy First" 守住（仅元数据，无 prompt/completion）

### D8 平台基础设施 → `core/platform/`（**集中化，候选 D 新定**）

- `core/platform/i18n/`、`telemetry/`、`utils/`、`config/`、`keybindings.ts`
- **为什么集中到 `core/platform/`**：多管一层让"业务核心 vs 横切原语"边界物理化，新人 ls 一眼看懂；防止 core/ 再次变杂物间
- F08 守门：`core/platform/*` 可被任何 core 子目录 import，但反向禁止（platform 不依赖业务）

---

## 6. 关键待辩论决策点（Phase 3 grilling 焦点）

下面 9 个是初版 grilling 决策点。**grilling 期间扩展到 14 个**（新增 Q10–Q14，详见 `top-level-structure-review.md §8`）。

### 6.0 grilling 状态总览

| Q | 议题 | 状态 |
|---|------|------|
| **Q1** mem/soul package 身份 | 🔒 已决议 → 候选 D 协议化 |
| **Q2** Browser opt-in | 🟨 待 grilling |
| **Q3** index.ts 公共 export 收窄 | 🟨 待 grilling |
| **Q4** SAL 是包还是扩展 | 🔒 已决议 → 保扩展 |
| **Q5** 内部 contract 粒度 | 🟨 待 grilling（候选 D 下降权重）|
| **Q6** models.generated 拆 11 文件 | 🟨 待 grilling |
| **Q7** modes/_shell 粒度 | 🔒 隐含决议 → 只抽 cancellation |
| **Q8** F08 例外白名单 deadline | 🟨 待 grilling |
| **Q9** D8 平台基础设施 | 🔒 已决议 → `core/platform/` 集中 |
| **Q10** 顶层结构候选 | 🔒 已决议 → 候选 D（详见 top-level §6.D）|
| **Q11** cognitive/ 命名 | 🔒 已决议 → 不用 cognitive，mem/soul 直接放 packages |
| **Q12** 第三方扩展深度 | 🔒 已决议 → 协议化（Q12 = 粒度 3；D5 下收窄为 provider/adapter/candidate，不外包连续性内核）|
| **Q13** Privacy vs telemetry 对齐 | 🟨 待 grilling（独立决策）|
| **Q14** core/ 杂物间拆开 | 🔒 已决议 → 拆 + 多管一层 |

**剩余 grilling 焦点**：Q2 / Q3 / Q5 / Q6 / Q8 / Q13。

下面 9 个原 Q 保留并标注 grilling 状态：

### ~~Q1~~ — mem-core / soul-core 的 package 身份是否保留？

**🔒 grilling 后已决议** — 详见 `top-level-structure-review.md §6.D` 候选 D。

**结论**：**保 package + 真隔离 + 协议化**（原 A 选项升级版）：
1. `packages/mem-core/` 与 `packages/soul-core/` 保留独立可发布身份
2. 它们不再 import `@pencil-agent/nano-pencil`，改 import `@pencil-agent/extension-sdk` 的低层协议（修 U3）
3. 新建 `packages/extension-sdk/` 作为协议契约的稳定家，但协议分层为 `MemoryStore` / `MemoryCandidateProvider` / `SoulFacetProvider` / `CognitiveModelProvider`，不再表达为"整套 MemoryProvider/SoulProvider 可替换"
4. 新建 `core/continuity/`：官方定义 canonical state、provenance、merge policy、prompt injection policy，保留 PencilAgent 长期自我叙事的解释权
5. 在 `extensions/builtin/memory-binding/` / `soul-binding/` 提供桥接扩展（默认实现）
6. 第三方可实现存储介质、召回候选、人格侧面、认知地图等 provider/adapter（如 Mem0/Zep adapter），但不能绕过官方 engine 直接写 canonical memory / soul

**B2 批次影响**：必须先在 B1 引入 `@pencil-agent/extension-sdk` 包，让 mem-core 重定向依赖。

---

### Q2 — Browser Harness 改 opt-in 是否伤用户？

**现状**：默认 vendored 1.4MB。

**选项 A**（opt-in，独立包 `@pencil-agent/browser-harness`）：用户用 `npm i -g @pencil-agent/browser-harness` 启用；启动检测到包就启用 tool。
**选项 B**（保 default，但 lazy-extract）：默认 vendored 但启动时不展开 Python 资源，首次用浏览器时才解压。
**选项 C**（保现状）。

**初始倾向**：A。理由：现状每个用户都付 1.4MB，但根据 charter 受众"competence of elite chief of staff"，浏览器自动化是高级特性而非日常体验；F07 数据说明 default extensions 总尺寸 3MB 里 47% 是 browser。
**反对理由**：opt-in 增加首次使用摩擦；charter "easy to work with" 受损。

**影响**：决定 F07 是否要触碰 SOP §3.3（package "files" 字段）。

---

### Q3 — `index.ts` 公共 export 收窄是否做 major bump？

**现状**：`index.ts` 导出 ~200 个名字，包括 `InteractiveMode`、`main` 等内部细节。

**选项 A**（major bump 2.0.0：彻底收窄）：只导出稳定 SDK 接口（`createAgentSession` / `PencilAgent` / `Tool` 工厂等）；内部用子路径。
**选项 B**（minor bump：deprecate + 维持 alias 6 个月）：保留所有 export，但加 `@deprecated`；6 个月后再 major。
**选项 C**（不收窄）：把循环依赖纯通过 `core/_internal.ts` 修，外部 export 不动。

**初始倾向**：B。理由：major bump 阻力大；deprecation 期是软着陆。
**反对理由**：B 不解决"barrel 文件大"的问题；C 则放弃了 SDK 表面整洁这块价值。

**影响**：决定 F03 是 B1 一步到位还是 B1+B6 两阶段。

---

### ~~Q4~~ — SAL 是继续作为 default extension 还是迁到 `packages/`？

**🔒 grilling 后已决议** — 候选 D 下 packages/ 只装真发布的能力，SAL 当前**未有独立发布需求**。

**结论**：**保 extension（B 选项）+ 等待 SAL Agent 自行演化**：
1. `extensions/builtin/sal/` 继续保持扩展形态
2. 通过 `core/platform/telemetry/` 通道写 `eval_*` 表（1.14.3 P0 已完成）
3. handbook 明确 SAL 由独立 SAL Agent 演化，arch agent 不直接动
4. 若未来 SAL 真需要独立发布（如其他 Pencil 子项目复用 SAL 算法），跑 `promote-to-package.ts sal-core` 升级

---

### Q5 — `core/_internal.ts` vs 分散 contract 文件？

**现状**：F03 提议的"双 barrel"中，内部 contract 集中到一个 `core/_internal.ts`。

**选项 A**（单 internal barrel）：`core/_internal.ts` 一个文件，所有内部共享类型/常量都从这里 re-export。
**选项 B**（每个 boundary 自带 contract 文件）：`core/runtime/runtime-contract.ts`、`core/extensions/extensions-contract.ts` 各自存在，没有顶层 internal barrel。
**选项 C**（命名约定而非文件）：用 ts namespace 或 tsconfig path mapping，不创建新文件。

**初始倾向**：B。理由：A 容易演变为下一个 `index.ts` god barrel；B 让边界更明确，每个 contract 文件就是一个 seam。
**反对理由**：B 文件数变多，新成员需要熟悉多个 contract；A 学习成本低。

**影响**：决定 F03 落地代码风格；可能影响 F04 / F05 的 contract 文件命名。

---

### Q6 — `models.generated.ts` 拆 11 文件 vs 单文件运行时筛选？

**现状**：14506 行单文件 vendored 1.5MB 进 dist。

**选项 A**（拆 11 个 per-provider 文件）：build 时按 provider 切；运行时按 `models.json` 配置 lazy import。
**选项 B**（保单文件但运行时 partial parse）：保留单 generated 文件，但运行时只解码 `models.json` 用到的 provider 子树。
**选项 C**（codegen 时按运行时 detect 输出）：build 时根据 `models.json` 决定要 emit 哪些 provider，自动减小 generated 文件。

**初始倾向**：A。理由：代码可读性、tree-shaking、editor 跳转都最好。
**反对理由**：A 增加 codegen 复杂度；现在 `npm run generate-models` 单文件输出是简单的。

**影响**：决定 F07 中期项的实施难度。

---

### Q7 — `modes/_shell/` 共享骨架 vs 每 mode 自带？

**现状**：4 个 mode 各自重复 prompt loop / cancellation / 错误处理。

**选项 A**（抽 `_shell/`，每个 mode import）：减重复，但跨 mode 行为耦合（改 shell 影响 4 个 mode）。
**选项 B**（保现状，4 个 mode 各自维护）：解耦但有 drift 风险。
**选项 C**（只抽最稳定的 cancellation，prompt loop 各自实现）：折中。

**初始倾向**：C。理由：cancellation 是低层稳定原语，最适合共享；prompt loop 各 mode 行为差异较大，强行抽会做出"框架感"。
**反对理由**：cancellation 单一文件抽出意义不够大，会让 F02 的"_shell/"看起来空。

**影响**：决定 F02 拆分粒度。

---

### Q8 — F08 例外白名单有没有 deadline？

**现状**：F08 提议把 4 条 quality rule 提升为 CI 守门，已知违反列在例外白名单。

**选项 A**（每个例外有 due date，过期自动 fail CI）：强迫架构债定期清理。
**选项 B**（无 deadline，靠 maintainer 手动审）：现状的延伸。
**选项 C**（按 severity 分级 deadline）：load-bearing 3 个月内必须清，structural 6 个月，opinionated 无限。

**初始倾向**：C。理由：A 太严厉会让 PR 误中；B 等于没用。
**反对理由**：C 增加 metadata 维护成本。

**影响**：决定 F08 落地代码长度（A < B < C）。

---

### ~~Q9~~ — D8 平台基础设施是否需要自己的目录？

**🔒 grilling 后已决议** — 候选 D 下 `core/platform/` 目录自动成立。

**结论**：**集中到 `core/platform/`（B 选项升级版）**：
1. `core/i18n/` `core/utils/` `core/telemetry/` `core/config/` `core/keybindings.ts` 统一迁到 `core/platform/`
2. 多管一层（`core/lib/` + `core/platform/`）让横切关注点物理隔离
3. F08 守门：`core/platform/*` 可被任何 core 子目录 import，反向禁止（platform 不依赖业务）
4. 防止"杂物间复发"——一次性架构决策

**反对 A 的理由**（grilling 期间）：A "保散布 + 文档化" 治标不治本；候选 D 多管一层是更彻底的解。

---

## 7. 从现状到目标的迁移路径（candidate D 落地版）

把 refactor-plan.md §3.1 的 B1–B6 与本文 §4 目标目录、§6 决策点拉通。**候选 D 决议后新增 B0 顶层骨架重组**：

| 批次 | Phase 3 决策门控 | 落到目录的具体动作 | 风险 |
|------|------------------|--------------------|------|
| **B0** ★ 顶层骨架重组（候选 D）| 🔒 Q10/Q11/Q12/Q14 已决议 | 1. 新建 `packages/extension-sdk/`（含 Agent Profile / Host Adapter / Tool Runtime / MemoryStore / MemoryCandidate / SoulFacet / CognitiveModel provider 协议）<br>2. 新建 `core/continuity/`（canonical state / provenance / merge policy / prompt injection policy）<br>3. 新建 `core/agent-profile/`（profile schema + built-in CLI/browser/remote/editor profile 草案）<br>4. `packages/ai/` `agent-core/` `tui/` → `core/lib/ai/` `agent-core/` `tui/`<br>5. `core/i18n/` `utils/` `telemetry/` `config/` `keybindings.ts` → `core/platform/`<br>6. `core/extensions/` → `core/extensions-host/`<br>7. `extensions/defaults/` → `extensions/builtin/`<br>8. 新建 `extensions/builtin/memory-binding/` `soul-binding/`<br>9. 改 host package.json：真依赖 3 个真包<br>10. 删 `scripts/bundle-deps.js`<br>11. 新建 `scripts/promote-to-package.ts`<br>12. 写 `CODEMOD.md` + 跑 ts-morph codemod | 中-高（路径全变，且 D5 连续性内核与 PARP profile/protocol 是语义新增，不应按纯机械迁移低估）|
| **B1** 治环 + 守门 | **必须先答 Q5**（contract 文件粒度）+ **Q8** | 1. 新建 `core/_internal.ts` 或 `*-contract.ts` ✦Q5<br>2. 新建 `core/mcp/mcp-types.ts`（F04）<br>3. 新建 `core/soul-options-contract.ts`（F04）<br>4. 新建 `core/lib/ai/event-stream-types.ts`（F04）<br>5. mem-core 切到 `@pencil-agent/extension-sdk`（修 U3）<br>6. 新建 `scripts/verify-quality.ts` + GitHub workflow（F08）—— **必须先答 Q8** | 低 |
| **B2** god 拆 runtime | 🔒 Q1 已决议 | `core/runtime/` 抽出 7 个子模块；`agent-session.ts` 退化为壳；新建 `core/theme-contract.ts` 解 U2 | 中（外部 API 不变） |
| **B3** god 拆 UI | 🔒 Q7 已决议 | `modes/_shell/cancellation.ts` 抽出；`modes/interactive/` 新增 `controllers/` 5 个；`state/` 1 个；snapshot tests 覆盖 | 中-高（TUI 行为零回归） |
| **B4** 入口与体积 | **必须先答 Q2**（browser）+ **Q3**（公共 export） | `modes/index.ts` 退化为 facade；`main.ts` 改 dynamic dispatch；按 Q2 把 browser 迁到 `extensions/optional/`；按 Q3 决定 `index.ts` 收窄程度 | 中（触碰 SOP §3.3） |
| **B5** bundle 重设计 | **必须先答 Q6**（models 拆分） | B0 已删 bundle-deps；本批次接 esbuild；按 Q6 拆 `core/lib/ai/models.generated.ts` 为 11 个 per-provider 文件 | 中（构建管线重写，规模小于原版） |
| **B6** SDK 表面收窄 | 已在 Q3 决定 → major bump 或不做 | 2.x 版本：`index.ts` 仅 stable API；子路径暴露 `InteractiveMode` 等 | 高（须 deprecation 期） |

### 7.1 关键观察

1. **B0 是新增的"前提批次"** —— 必须先做完顶层骨架重组，否则下游所有 import 路径都要二次返工
2. **B0 风险评估**：路径迁移部分可用 ts-morph codemod 完成；但 `core/continuity/` 是 D5 语义新增，必须补 canonical state / merge policy / prompt injection policy 的最小设计，不能按纯机械迁移低估
3. **B0 + B1 必须紧挨着合**：B0 改路径 + B1 引入 extension-sdk 与 mem-core 低层协议切换
4. **grilling 剩余依赖**：B1 还依赖 Q5+Q8；B4 依赖 Q2+Q3；B5 依赖 Q6
5. **可并行**：B2 与 B3 互不依赖，可由两人并行推进

---

## 8. 与产品宪章 `.PENCIL.md` 的一致性核验

| `.PENCIL.md` 关键约束 | 本目标架构是否冲突？ | 备注 |
|-----------------------|---------------------|------|
| "warm, natural, not robotic" | ❌ 无冲突 | 目标架构不动任何 prompt/persona 文本 |
| "easy to work with" | ⚠️ **Q2 是关键判断** | Browser opt-in 增加首次摩擦；需衡量 |
| "long-term collaborator" | ❌ 无冲突 | 不动 mem-core / soul-core 用户态 |
| "highly competent and trustworthy" | ✅ 加强 | F08 守门让规则可信；F01-F07 减摩擦让 maintainer 更可信 |
| "protect user's momentum" | ✅ 加强 | F06 lazy load 让冷启动快；F07 减小安装时间 |
| "respect user's time and attention" | ✅ 加强 | 同上 |

`.PENCIL.md` **没有任何条款被本目标架构违反**。Q2 是唯一需要权衡产品体验的决策点。

---

## 9. 文档职责与后续使用

| 文档 | 角色 |
|------|------|
| `top-level-structure-review.md` | **决策依据** —— 为什么选择候选 D，为什么 packages 只保真发布包，为什么需要 PARP / continuity |
| **`target-architecture.md`（本文）** | **目标架构** —— 目录树、功能域映射、PARP / continuity 协议边界、迁移路径 |
| `refactor-plan.md` | **执行排序** —— 批次依赖、风险窗口、剩余 grilling 门控 |
| `findings/F01–F08-*.md` | **微观判断** —— 每个 finding 独立 deletion test、benefits、proposed direction |
| `architecture-review-202605271527.html` | **辩论入口** —— Phase 3 grilling 的可视化总览 |

后续维护规则：

1. 目录结构、协议边界、PARP / continuity 的细节只改本文
2. 候选 D 的论证、A/B/C 的历史对照只改 `top-level-structure-review.md`
3. 执行批次、优先级、剩余决策门控只改 `refactor-plan.md`
4. finding cards 只在具体 finding 的 deletion test 或 proposed direction 需要刷新时更新

---

## 10. 状态

- [x] Phase 1 量化扫描 + 走读
- [x] Phase 2 finding cards × 8
- [x] Phase 2 refactor-plan.md
- [x] Phase 2 HTML 报告
- [x] Phase 2 综合层（本文初版）
- [x] **Phase 2.5 顶层结构与扩展能力评审**（`top-level-structure-review.md`）
- [x] **Phase 3a 业界对标**（OpenClaw / Continue.dev / Codex / Nanobot / Aider）
- [x] **Phase 3a grilling — 顶层骨架已决议**（Q1/Q4/Q7/Q9/Q10/Q11/Q12/Q14 = 候选 D）
- [x] **本文修订到候选 D**（§4 目录结构 + §5 功能域映射 + §7 迁移路径 + B0 批次）
- [ ] Phase 3b grilling — 战术决策（Q2/Q3/Q5/Q6/Q8/Q13）
- [ ] Finding cards 据本文修订（U3/U2 等议题刷新到候选 D 措辞）
- [ ] Phase 3 ADRs（若有驳回）
- [ ] Phase 3 sign-off

