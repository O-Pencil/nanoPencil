# F03: 根 `index.ts` package barrel 反流形成 4 条核心循环

```yaml
finding_id: F03
severity: load-bearing
lenses: [seam, DIP, leverage]
files_primary:
  - index.ts
  - core/extensions/loader.ts
  - core/config/resource-loader.ts
  - core/runtime/agent-session.ts
files_secondary:
  - core/extensions/index.ts
  - core/runtime/extension-core-bindings.ts
  - core/runtime/slash-command-catalog.ts
  - main.ts
discovered_in_phase: 1
status: open
```

## Problem

根 `index.ts` 是 npm 包的对外入口（349 行、**re-export 约 200+ 个符号**：`AgentSession`、`createAgentSession`、`InteractiveMode`、`PencilAgent`、`SessionManager`、各 tool factory、各 TUI Component、theme、frontmatter ……）。它同时是包内代码的"内部公共入口"，被深层模块反向引用，形成 madge 报出的 **4 条核心循环**：

```
1) core/config/resource-loader.ts → core/extensions/loader.ts → index.ts → core/runtime/agent-session.ts
2) core/extensions/loader.ts → index.ts → core/extensions/index.ts
3) core/config/resource-loader.ts → core/extensions/loader.ts → index.ts → core/runtime/agent-session.ts → core/runtime/extension-core-bindings.ts → core/runtime/slash-command-catalog.ts
4) core/config/resource-loader.ts → core/extensions/loader.ts → index.ts → main.ts → modes/index.ts → modes/interactive/interactive-mode.ts
```

为什么这会发生：

- `core/extensions/loader.ts` 把"动态 import 用户扩展"看作 SDK 行为，所以 `import ... from "../../index.js"` 取 `Extension` 等类型 —— 反向依赖
- `index.ts` 同时 export 内部实现（`AgentSession`、`InteractiveMode`、`main`）+ 类型 + UI 组件 + 工具 → 一个 barrel 承担了**外部 SDK 表面** + **内部 internal contract** 两种角色
- 结果：任何修改 `AgentSession` 类型 → 必须重编译整个 `index.ts` re-export 闭包 → 任何依赖 `index.ts` 的内部模块都跟着重建

观察：`core/CLAUDE.md §Quality Rules` 显式声明 **"No circular dependencies between modules"**，但实际存在 5 个真环（4 个经 `index.ts`，1 个 mcp-client/config，1 个 packages/ai 包内）。

## Deletion test

> 若 `index.ts` 不存在（或退化为纯外部 SDK 表面），4 条循环里的 `index.ts` 节点会消失。环还存在吗？

**Result**: **3/4 条 vanish**，第 4 条（含 `agent-session.ts → soul-integration.ts → sdk.ts`）由 F04 覆盖。barrel **未在做实际工作** —— 它只是 alias 层 —— 但被错误地放在了"内部消费链路"上。

→ **vanishes** for the cycle part, 但 barrel 仍然要保留对外 SDK 用途。结论：**barrel 应只服务外部**，禁止内部 import。

## Proposed direction

引入"双 barrel"模式：

```
catui/
├── index.ts             ← 仅服务外部 npm 包消费者
│                          只 re-export 类型 + 稳定公共 API
│                          内部禁止 import
├── core/_internal.ts    ← 新增：内部模块共享类型/常量出口
│                          loader / resource-loader / agent-session
│                          这些内部消费方 import "../_internal.js"
└── core/extensions/loader.ts   ← 改为 import "../../core/_internal.js"
                                  而非 "../../index.js"
```

具体迁移路径（每一步独立 PR）：

1. **创建 `core/_internal.ts`**，把 `loader.ts` 当前从 `index.ts` 取的类型搬过去 → 修第 1/2/3 环
2. **把 `main.ts` 从 `index.ts` 解耦** —— `index.ts` 不应该 export `main`；让 `cli.ts` 直接 `import { main } from "./main.js"` → 修第 4 环
3. **删除 `index.ts` 里所有 mode/InteractiveMode export**，改为 `import { InteractiveMode } from "@pencil-agent/nano-pencil/modes"` 子路径 → 收窄公共 SDK 表面
4. **添加 lint 规则**：`no-restricted-imports` 禁止 `core/**`、`modes/**`、`packages/**` 内任何文件 import `index.js`

**关键 seam**：`core/_internal.ts` 是这个 seam 的实体。它的存在让"对外 SDK"与"对内 contract"分离 —— 调用方一看 import 路径就知道自己在哪一侧。

## Benefits

- **Leverage**：触碰内部模块不再使外部 SDK barrel 失效缓存；TypeScript incremental build 显著更快
- **Locality**：要扩展对外 SDK 表面 → 改 `index.ts`；要重构内部 → 不动 `index.ts`，两件事不再耦合
- **Removes 3 cycles** 立即；F04 之后再加 1 条
- **Bundle 小一些**：今天 `dist/index.js` 即使内部模块 build 也会 emit 完整闭包；分离后内部消费链路不再经过 barrel

## Before / after sketch

```
BEFORE (4 cycles through index.ts)

  ┌───────────────────┐
  │ index.ts (barrel) │ ←─────────────────────┐
  │ - SDK 对外         │                       │
  │ - 内部 alias 也走  │                       │
  └─────┬─────────────┘                       │
        │ re-exports                          │
        ▼                                     │
  core/runtime/agent-session.ts               │
        ▲                                     │
        │ uses                                │
  core/extensions/loader.ts ───────────────── ┘
        ▲
        │
  core/config/resource-loader.ts


AFTER (双 barrel)

  ┌─────────────────────┐         ┌──────────────────────┐
  │ index.ts (外部专用)  │         │ core/_internal.ts    │
  │ - SDK 公共表面       │         │ - 内部共享 contract  │
  │ - 不被内部 import    │         │ - 不被外部 import    │
  └─────────────────────┘         └─────────┬────────────┘
                                            │ uses
                                            ▼
                                   core/extensions/loader.ts
                                            ▲
                                            │ uses
                                   core/config/resource-loader.ts
                                   (无环路)
```

## ADR / DIP conflict callouts

- **conflict**: `core/CLAUDE.md §Quality Rules`: **"No circular dependencies between modules"** —— 现实 ≥5 条
- 拆 barrel 会影响**外部 SDK 用户**的 import 路径（如果他们今天写 `import { InteractiveMode } from "@pencil-agent/nano-pencil"`）。这一步**触碰 SOP §3.3 stability contract**（`index.ts` 公共 exports），必须走 REVIEW 流程，可能需要 deprecation period

Resolution：步骤 3（收窄外部表面）独立成 major version bump；步骤 1、2 是内部纯结构，无外部影响

## References

- Methodology: seam (`§1.3`)、DIP isomorphism (`§2.3`)
- Adjacent: F01（agent-session 是这些环的"另一端"）、F04（剩下 1 条循环）、F08（CI lint 守门）
