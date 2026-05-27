# F06: `modes/` 静态导入导致启动恒付 god 文件 cost

```yaml
finding_id: F06
severity: structural
lenses: [leverage, locality]
files_primary:
  - modes/index.ts
  - main.ts
  - modes/interactive/interactive-mode.ts
  - modes/print-mode.ts
  - modes/rpc/rpc-mode.ts
  - modes/acp/acp-mode.ts
discovered_in_phase: 1
status: open
```

## Problem

仓库**已经证明懂得**用 dynamic import 来按需加载重模式：

```ts
// main.ts:990
if (parsed.acp) {
  const { runAcpMode } = await import("./modes/acp/acp-mode.js");
  ...
}
```

但**只对 ACP** 这样做。其他三个 mode 走 `modes/index.ts` 静态 barrel 加载：

```ts
// modes/index.ts (类似如下，未读 modes/index.ts 内容但 main.ts:37 印证)
export { InteractiveMode, runPrintMode, runRpcMode } from "./...";
```

`main.ts` 顶部 `import { InteractiveMode, runPrintMode, runRpcMode } from "./modes/index.js"` 意味着**只要 pencil 启动，3 个 mode 都会被 TypeScript 解析+ESM 装载**，无论用户实际只用哪一个：

- `interactive-mode.ts` 7868 行（F02）
- `print-mode.ts`（也很重）
- `rpc/rpc-mode.ts` 1000+ 行
- TUI 包整个被 eager load —— `@pencil-agent/tui` 1.5MB vendored，仅 print 模式时也付出

对于 SDK 嵌入者（如 `Pencil-Agent-Gateway` 的 `nano-adapter.ts`）尤其浪费 —— 他们只需要 `createAgentSession`，不需要任何 mode，但 `index.ts` 公开导出 `InteractiveMode` 等，import 路径上仍然牵连。

观察 1：**SDK consumers 是大头**。`Pencil-Agent-Gateway/docs/07-m7-nano-pencil-integration.md` 显示 Gateway 通过 SDK 直接走 `AgentSession`，根本不进 mode。Gateway 启动每个 agent instance 都会被 mode static graph 拖慢。

观察 2：CLI 启动 profiling 已有 `profileCheckpoint("before_args_parse_2")` 等埋点（`main.ts:838`），说明启动时延是 maintainer 关心的指标。本 finding 是该指标的**结构性诱因**。

## Deletion test

> 把 `modes/index.ts` 改为 lazy proxy（用 dynamic import 按 mode 类型加载），删除 `main.ts` 顶部静态 import？

**Result**: **vanishes**（启动时未触发的 mode 完全不加载）。

证明 mode 之间互相**没有真正的共享内部依赖**（已 ACP lazy 成功），目前的 static `modes/index.ts` 只是出于"图省事"。

## Proposed direction

```
main.ts
  ├── parse args
  ├── derive mode = "interactive" | "print" | "rpc" | "acp" | "text"
  └── switch (mode) {
        case "interactive": (await import("./modes/interactive/index.js")).run(...)
        case "print":       (await import("./modes/print-mode.js")).runPrintMode(...)
        case "rpc":         (await import("./modes/rpc/rpc-mode.js")).runRpcMode(...)
        case "acp":         (await import("./modes/acp/acp-mode.js")).runAcpMode(...)
      }

modes/index.ts        ← 只保留类型 + 极小 facade（< 50 行）
                        不再 re-export 实现
```

外部 SDK 边界变化：

- 当前 `index.ts` (root) 把 `InteractiveMode` 直接 export → 改为 deprecate；SDK 用户改用 `import { InteractiveMode } from "@pencil-agent/nano-pencil/modes/interactive"` 子路径
- 短期保留 alias 以避免破坏，加 deprecation warning

**与 F02 的协同**：F02 抽出的 `modes/_shell/` 极小（prompt-loop + cancellation + error-router），保留 eager 不要紧；重的 controllers/state/components 全部 lazy。

## Benefits

- **Leverage**：SDK consumers（Gateway / 编辑器 / extension）启动只 load 实际用到的 mode；冷启动时间预计降 30–50%（mode 文件占 `dist/modes/` 1.1MB 中绝大部分）
- **Locality**：mode 之间不再需要小心保持彼此可静态加载；可以独立演化
- **Bundle 体积 leverage**：配合 F07，下游打包工具能 tree-shake 整个 unused mode

## Before / after sketch

```
BEFORE (启动恒付 mode cost)

main.ts ──static──▶ modes/index.ts ──static──▶  interactive-mode.ts (7868)
                                  ──static──▶  print-mode.ts
                                  ──static──▶  rpc-mode.ts
                                  ──static──▶  (acp 已 lazy, 良心)

AFTER (按需)

main.ts ──static──▶ modes/index.ts (facade, < 50)
        │
        └──switch(mode) dynamic import──▶  interactive / print / rpc / acp
```

## ADR / DIP conflict callouts

- 步骤里"deprecate root `index.ts` 的 `InteractiveMode` 导出"触碰 **SOP §3.3 stability contract**（公共 exports）—— 需要 REVIEW + deprecation period

无方法论冲突。

## References

- Methodology: leverage、locality
- Adjacent: F02（god 文件拆完后 lazy 更细粒度）、F03（barrel 收窄后这一步阻力更小）、F07（bundle 体积）
