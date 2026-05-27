# F04: 3 个残留小循环（soul/mcp/ai-types）

```yaml
finding_id: F04
severity: structural
lenses: [seam, DIP]
files_primary:
  - core/soul-integration.ts
  - core/runtime/sdk.ts
  - core/mcp/mcp-client.ts
  - core/mcp/mcp-config.ts
  - packages/ai/src/types.ts
  - packages/ai/src/utils/event-stream.ts
discovered_in_phase: 1
status: open
```

## Problem

除了 F03 barrel 反流的循环之外，madge 还报出 3 个**结构性**的小型循环，跟 barrel 无关：

```
A. core/runtime/agent-session.ts ↔ core/soul-integration.ts ↔ core/runtime/sdk.ts
B. core/mcp/mcp-client.ts ↔ core/mcp/mcp-config.ts
C. packages/ai/src/types.ts ↔ packages/ai/src/utils/event-stream.ts
```

**环 A**：

- `core/soul-integration.ts:7` `import type { CreateAgentSessionOptions } from "./runtime/sdk.js"`
- `core/runtime/sdk.ts` 又通过 `agent-session.ts` 间接（在某些路径）回到 `soul-integration.ts`
- 内部用 `type SoulManagerType = any;` （`soul-integration.ts:18`）来"绕过类型解析问题" —— 这是循环已经导致 TypeScript 类型推导失效的征兆

**环 B**：

- `core/mcp/mcp-client.ts` ↔ `mcp-config.ts` 互相 import；典型的"client 需要 config 类型，config 又需要 client 的某个常量"
- 小但治理价值高，因为 `core/mcp/` 是 SOP §3.3 列出的 stability contract 范畴的相邻区域

**环 C**：

- `packages/ai/src/types.ts ↔ packages/ai/src/utils/event-stream.ts` 包内小环
- 影响范围有限，但 `packages/ai` 是 vendored 进 dist/node_modules 的（见 F07），任何包内问题都会随 1.5MB 一起发布

## Deletion test

> 引入一个公共 `*-shared-types.ts` 文件，把跨双方共享的纯类型移过去，并让 client/config 都 import shared 而不互相 import？

**Result**: **vanishes** for all 3 cycles。这些环都是"双方互需对方某几个类型"的反模式，没有真正"做工作"。

## Proposed direction

**环 A 修复（与 F01 协同）**：

```
core/runtime/
├── prompt-assembly.ts   ← 新（F01 已计划），唯一 import soul 模块
└── sdk.ts               ← 不再 import soul-integration
core/soul-integration.ts ← 只 export 数据契约，不 import sdk.ts
```

实现：把 `CreateAgentSessionOptions` 里 Soul 相关字段抽到一个独立 `core/soul-options-contract.ts`，双方 import 它，soul-integration 不再 import sdk。

**环 B 修复**：

```
core/mcp/
├── mcp-types.ts        ← 新增：共享类型（ServerConfig / ClientCapabilities）
├── mcp-client.ts       ← 仅 import mcp-types
└── mcp-config.ts       ← 仅 import mcp-types
```

**环 C 修复**：

```
packages/ai/src/
├── types.ts            ← 不再 import utils/event-stream
└── utils/event-stream.ts  ← 不再 import types（或仅 import 一个细颗粒 sub-module）
```

具体方案：通常 `event-stream.ts` 需要 `types.ts` 里的 `Message`/`Usage` 等基础类型 → 把"流事件"专属类型搬进 `event-stream.ts`，让 `types.ts` 反向只 import 必要的 stream event union。

## Benefits

- **Leverage**：删除残留 `any` 类型逃生口（soul-integration `SoulManagerType = any`），恢复完整类型推导
- **Locality**：每个 seam 都在 ≤ 3 个文件内完成；改动小且容易 review
- **Removes 3 cycles** → 配合 F03 后**全仓循环依赖归零**

## Before / after sketch

```
BEFORE                            AFTER

A:  agent-session ↔ soul-integration ↔ sdk
                                    soul-options-contract.ts (新)
                                          ↑       ↑
                                  soul-integration agent-session/sdk
                                  (无环)

B:  mcp-client ↔ mcp-config        mcp-types.ts (新)
                                          ↑      ↑
                                   mcp-client  mcp-config
                                   (无环)

C:  ai/types ↔ ai/utils/event-stream    ai/event-stream-types.ts (内部子模块)
                                              ↑          ↑
                                          ai/types   ai/utils/event-stream
                                          (无环)
```

## ADR / DIP conflict callouts

- **conflict**: `core/CLAUDE.md §Quality Rules` "No circular dependencies"

无外部 SDK 表面影响 —— 全部为内部重整。

## References

- Methodology: seam
- Adjacent: F03（同 doctrine 的另一面）、F01（环 A 修复与 prompt-assembly 抽取重合）
