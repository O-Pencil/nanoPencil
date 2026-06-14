# F05: `core/extensions/types.ts` 单文件 1446 行类型 monolith

```yaml
finding_id: F05
severity: structural
lenses: [depth, leverage, locality]
files_primary:
  - core/extensions/types.ts
files_secondary:
  - core/extensions/index.ts
  - core/extensions/runner.ts
  - core/extensions/wrapper.ts
  - modes/interactive/theme/theme.ts
  - core/extensions/CLAUDE.md
discovered_in_phase: 1
status: open
```

## Problem

`core/extensions/types.ts` 是单一文件**仅放类型**的 monolith：

- **1446 行**，全部为 TS `type` / `interface` / `export type`
- P3 header `[TO]` 列出 **15 个消费方**（含 `modes/interactive/components/tool-execution.ts`、`modes/acp/acp-mode.ts`、多个 `extensions/defaults/*`）
- 它的 `[FROM]` 列出 `@pencil-agent/agent-core`、`@pencil-agent/ai`、`@pencil-agent/tui`、`@sinclair/typebox` —— 一个类型文件依赖了 4 个独立 npm 包的类型空间
- **关键污染**：`types.ts:39` `import type { Theme } from "../../modes/interactive/theme/theme.js"` —— `core/` 反向 import `modes/interactive/`，与 F01 同病

这是 mattpocock 方法论里"shallow module"的典型反例之一种 ——
不是接口宽度 ≈ 实现宽度，而是**一个文件包含了所有维度的类型契约**：扩展生命周期、工具调用事件、UI dialog options、autocomplete item、editor theme、key id、widget placement、错误类型 ……

这意味着：

1. 加一个新扩展事件类型 → 触碰 1446 行文件 → 触发 15 个消费方重建
2. 测试任何一个消费方 → mock 整个类型空间或完全引入
3. `extensions/defaults/team/` 不需要 UI 类型，但 `import` 了 `types.ts` 就被动接入 TUI 依赖图

`core/extensions/CLAUDE.md` 把 `types.ts` 描述为 "All extension-related TypeScript types and interfaces" —— **这正是问题** —— 当一个文件的 P2 描述用 "All X" 形容时，几乎一定是 monolith。

## Deletion test

> 将 `types.ts` 拆成 4 个按消费域分组的文件？

**Result**: **partially vanishes**。

类型本身必须存在，但当前文件**作为单一抽象单元的存在没在做工作** —— 它只是把不相关的类型空间物理上塞在一起。拆分后每个消费方只 import 自己关心的子集，消除"someone touches types.ts → my CI rebuilds" 的连锁。

## Proposed direction

按"消费域"四向切：

```
core/extensions/
├── types/
│   ├── lifecycle.ts        ← Extension, ExtensionContext, ExtensionFactory, hooks
│   ├── tools.ts            ← Tool/Bash/Read/Write/Edit/Find/Grep/Ls call events 类型
│   ├── ui.ts               ← ExtensionUIContext, Dialog/Widget/Editor options, Theme
│   ├── commands.ts         ← SlashCommand, RegisteredCommand, AutocompleteItem
│   └── index.ts            ← 重新聚合（保持外部 SDK 表面不变）
├── runner.ts
├── wrapper.ts
└── loader.ts
```

**关键 seam 调整**：

- `extensions/defaults/team/` 这种纯后端扩展可以 `import { Extension } from "core/extensions/types/lifecycle.js"`，**不再被动**接入 `@pencil-agent/tui` 类型
- `Theme` 类型从 `modes/interactive/theme/theme.ts` **正向**移到 `core/extensions/types/ui.ts`（或更合适的 `core/theme-contract.ts`），打破 `core → modes` 反向依赖
- `core/extensions/index.ts` barrel 保留所有原 export 路径以维持兼容

实施顺序：

1. 抽 `lifecycle.ts`（最干净的子集，~300 行）
2. 抽 `tools.ts`（带类型方法定义）
3. 抽 `commands.ts`
4. 抽 `ui.ts`（连带处理 Theme 反向依赖）
5. `types.ts` 退化为 `export * from "./types/*"`，最终删除

## Benefits

- **Leverage**：incremental TS compile 单点修改触发的重建集大幅缩小（实测 monolith 类型文件是 catui tsc 速度的主要限制之一）
- **Locality**：UI 类型改动不影响 backend extension 重编译；新增 hook 不触碰 UI 类型空间
- **Decouples one cross-layer import**：解 `core → modes/interactive/theme` 反向依赖
- **DIP isomorphism**：P2 描述将变成可枚举的成员列表，而不是 "All X"

## Before / after sketch

```
BEFORE                              AFTER

core/extensions/                    core/extensions/
├── types.ts (1446 lines)           ├── types/
│   - Extension                     │   ├── lifecycle.ts  (≈ 300)
│   - tool call events              │   ├── tools.ts      (≈ 350)
│   - UI dialogs/widgets            │   ├── ui.ts         (≈ 300)
│   - Theme imported reverse!       │   ├── commands.ts   (≈ 200)
│   - SlashCommand                  │   └── index.ts      (barrel)
│   - AutocompleteItem              ├── runner.ts
│   - 15 import paths               └── wrapper.ts
└── ...
```

## ADR / DIP conflict callouts

- **conflict**: `core/CLAUDE.md §Quality Rules` "Single file limit: ~400 lines" —— 3.6× 超标
- **conflict**: `core/CLAUDE.md` P1 拓扑 `core` → `modes` 单向；`types.ts:39` 反向

## References

- Methodology: depth, leverage（mattpocock §1.2、§1.4）
- Adjacent: F01（同样的反向 theme 依赖问题）、F03（barrel 收窄后此处也更纯粹）
