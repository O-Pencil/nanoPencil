# F01: `core/runtime/agent-session.ts` 是 god module

```yaml
finding_id: F01
severity: load-bearing
lenses: [depth, locality, DIP]
files_primary:
  - core/runtime/agent-session.ts
files_secondary:
  - core/runtime/sdk.ts
  - core/runtime/extension-core-bindings.ts
  - core/soul-integration.ts
  - core/runtime/CLAUDE.md
discovered_in_phase: 1
status: open
```

## Problem

`core/runtime/agent-session.ts` 是整个会话生命周期的"中央总线"，但已经膨胀到一个无法独立推理的体量：

- **3 408 行**，是 `core/CLAUDE.md §Quality Rules` "Single file limit: ~400 lines" 的 **8.5×**
- **入度 13**：被 `interactive-mode.ts`、`acp-mode.ts`、`rpc-*.ts`、`print-mode.ts`、`sdk.ts`、`sub-agent-backend.ts`、`pencil-agent.ts`、`footer.ts`、`skill-invocation-message.ts`、`index.ts`、`core/index.ts` 等同时引用
- **直接出度 ≈ 30**：从 `core/session/compaction/*` 到 `core/extensions/types`、`modes/interactive/theme/theme`（💀 **runtime 引用 UI theme**）、`core/soul-integration`、`core/export-html/*`、`core/tools/orchestrator` 全部塞在同一个文件
- 参与 **3 个循环依赖** 中的 2 个：
  - `agent-session.ts ↔ soul-integration.ts ↔ sdk.ts`
  - `agent-session.ts → soul-integration.ts → sdk.ts` （`index.ts` barrel 经路反向，见 F03）

文件本身把以下职责糅在一起（仅按导入区粗看）：

| 职责块 | 证据 |
|--------|------|
| 模型周期与切换 | `ModelSwitcher`、`CycleModelError`、`modelsAreEqual`、`supportsXhigh`、`resetApiProviders` |
| 上下文压缩 | `compaction-pipeline`、`prepareCompaction`、`shouldCompact`、`generateBranchSummary` |
| 工具编排 | `ToolOrchestrator` + 直接处理 `BashExecutionMessage` |
| Soul / 个性 | `toSoulContext` / `extractSessionContext` |
| Export HTML | `createToolHtmlRenderer`、`exportSessionToHtml` |
| 扩展事件总线 | 引入 `ExtensionRunner` + 一打 `*Event` 类型 |
| Prompt 构造 | `buildSystemPrompt` |
| Bash 执行 | `executeBashCommand`、`executeBashWithOperations` |
| Session 持久化 | `getLatestCompactionEntry`、`SessionManager`、`BranchSummaryEntry`、`CompactionEntry` |
| Theme/i18n（UI！） | `theme`、`t` |

观察 1 ：`core/runtime/agent-session.ts:32` 直接 `import { theme } from "../../modes/interactive/theme/theme.js"` —— 核心 runtime 反向依赖于 UI 模式目录，违反 P1 拓扑的"core → modes"单向规则。

观察 2：`core/runtime/CLAUDE.md` P2 只列了 6 个成员，但目录下实际有 10 个 `.ts` 文件（漏列 `extension-core-bindings.ts`、`slash-command-catalog.ts`、`default-tools.ts`、`messages.ts` 等）。P2 与代码漂移本身是 DIP §2.3 警告。

## Deletion test

> 若把 `agent-session.ts` 删掉，复杂度会消失、集中到调用方、还是几乎不变？

**Result**: **dramatically concentrates**。

13 个调用方会立即需要直接对接 5+ 个二级子系统（compaction / model / tool orchestrator / soul / extensions）。说明这个模块**确实在做工作**，但**工作过多** —— 它是 load-bearing 但严重 over-loaded。

→ 这意味着推荐的不是删除，而是**按职责轴拆分**，并把 13 个调用方对接到稳定的更小接口。

## Proposed direction

引入**三层结构**，让 `AgentSession` 退化为"组合根"（Composition Root），所有真实工作下沉到职责明确的子模块：

```
core/runtime/
├── agent-session.ts             ← 仅作 Composition Root + 事件转发，目标 < 500 行
├── session-lifecycle.ts         ← session 启动/停止/abort 状态机
├── model-cycle.ts               ← CycleModelError + 模型切换 + xhigh 兜底
├── compaction-pipeline.ts       ← 拥有压缩阈值、执行、abort、branch summary 协调
├── tool-dispatch.ts             ← 包装 ToolOrchestrator + bash 直通
├── prompt-assembly.ts           ← buildSystemPrompt + soul context 注入
├── export-bridge.ts             ← HTML 导出绑定
└── ui-bridge.ts                 ← 把 theme/i18n 用 callback 反向注入（取消对 modes/ 的反向依赖）
```

**关键 seam**：

- `agent-session.ts:32` 的 `import theme from modes/interactive/theme` → 改为构造函数注入 `ThemeProvider` 接口；让 `print/rpc/acp` 这种非 TUI 模式注入 noop 实现
- `soul-integration.ts` ↔ `sdk.ts` 环 → 把 `toSoulContext` 调用契约抽到独立 `prompt-assembly.ts`，`soul-integration` 不再 import `sdk.ts`（详见 F04）

迁移可分四步（每步独立可发布）：

1. 抽 `ui-bridge.ts`（解 `modes/interactive/theme` 反向依赖）
2. 抽 `compaction-pipeline.ts`（最大独立单元）
3. 抽 `model-cycle.ts` + `tool-dispatch.ts`
4. 抽 `prompt-assembly.ts` + `export-bridge.ts`，剩余成壳

每步都不需要改 13 个调用方（保持 `AgentSession` 的公共 API 不变）。

## Benefits

- **Leverage**：调用方 / 测试可针对子模块 mock 单点（如 mock `compaction-pipeline` 测 session 重启），不再需要构造 30-依赖的 `AgentSession`
- **Locality**：模型切换/压缩/工具/导出每个改动只触及 1 个子模块；今天改 compaction 阈值都要重读 3408 行
- **Removes 1 cycle**：`agent-session.ts → modes/interactive/theme` 反向依赖消失
- **DIP isomorphism 恢复**：拆分后 `core/runtime/CLAUDE.md` 也能"members complete, one item per line"

## Before / after sketch

```
BEFORE                                AFTER

  ┌────────────────────┐                ┌──────────────────────────┐
  │ agent-session.ts   │                │ agent-session.ts (壳)    │
  │ 3408 lines         │  ───────►      │ < 500 lines              │
  │ • model cycle      │                └──────────┬───────────────┘
  │ • compaction       │                           │ delegates
  │ • tool dispatch    │                           ▼
  │ • soul context     │             ┌────────────┬──────────┬──────────┐
  │ • export html      │             │ model-     │ comp-    │ tool-    │
  │ • theme (UI!)      │             │ cycle      │ paction  │ dispatch │
  │ • i18n             │             ├────────────┼──────────┼──────────┤
  │ • bash             │             │ prompt-    │ export-  │ ui-      │
  │ • prompt           │             │ assembly   │ bridge   │ bridge   │
  │ • session persist  │             └────────────┴──────────┴──────────┘
  └────────────────────┘                          ▲
                                                  │ injected
                                            13 callers unchanged
```

## ADR / DIP conflict callouts

- **conflict**: `core/CLAUDE.md §Quality Rules`: "Single file limit: ~400 lines for complex modules" —— 当前文件 3408 行违反 8.5×
- **conflict**: `core/CLAUDE.md §Architectural Patterns`: 顶层依赖图标注 `runtime/agent-session.ts ← tools/`（runtime 在上、tools 在下），但 `agent-session.ts:32` 反向 import `modes/interactive/theme`，违反该方向
- **conflict**: `core/runtime/CLAUDE.md` member list 漏列至少 4 个真实存在的 .ts 文件

Resolution：本 finding 选择 "**accept the finding, revise the P-doc after**" —— 拆分动作完成后同步更新 `core/runtime/CLAUDE.md` 与父级 `core/CLAUDE.md`。

## References

- Methodology: depth/locality (`.dev-docs/architecture-review/methodology.md §1.2, §1.4`)
- DIP: `.dev-docs/architecture-review/methodology.md §2.3` Four Questions（FROM/TO/HERE 已严重不准确）
- Adjacent: F03（barrel 反流）、F04（soul ↔ sdk 循环）、F08（quality rule 守门缺失）
