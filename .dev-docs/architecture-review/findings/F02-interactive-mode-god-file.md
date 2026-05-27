# F02: `modes/interactive/interactive-mode.ts` 单文件 7868 行

```yaml
finding_id: F02
severity: load-bearing
lenses: [depth, locality]
files_primary:
  - modes/interactive/interactive-mode.ts
files_secondary:
  - modes/interactive/components/
  - modes/interactive/theme/theme.ts
  - core/runtime/agent-session.ts
discovered_in_phase: 1
status: open
```

## Problem

`modes/interactive/interactive-mode.ts` 是仓库**最大的非生成 TS 文件**：

- **7 868 行**，是 `core/CLAUDE.md §Quality Rules` "Single file limit: ~400 lines" 的 **19.6×**
- 比同为 god 嫌疑的 `agent-session.ts`（3408 行）还大 2.3×
- 仅靠 import 头（120 行）就横跨：`@pencil-agent/agent-core / ai / tui`、`config`、`core/custom-providers`、`core/runtime/agent-session`、`core/session/compaction`、`core/extensions`、`core/footer-data-provider`、`core/keybindings`、`core/messages`、`core/mcp/mcp-config`、`core/model-resolver`、`core/config/resource-loader`、`core/session/session-manager`、`core/slash-commands`、`core/i18n`、`core/persona/persona-manager`、`core/tools/truncate`、`nanopencil-defaults`、`utils/changelog`、`modes/utils/clipboard`、本地 `components/`、本地 `theme/`、`child_process.spawn`、`node:crypto/fs/os/path` ……

观察 1：这条 import 列表本身就是 finding —— 一个 mode 不应该同时 import `core/mcp/mcp-config`、`core/persona/persona-manager`、`core/model-resolver`、`nanopencil-defaults`、`core/custom-providers`。每条 import 都暗示一个本应封装在 `AgentSession` 内的能力被泄漏到了 UI 层。

观察 2：`modes/interactive/components/` 已经按组件拆出（47 个文件），但**主控文件**没有跟着拆，导致组件目录是平的而 orchestrator 是 god。

观察 3：`modes/acp/acp-mode.ts` 1299 行 + `modes/print-mode.ts` + `modes/rpc/rpc-mode.ts` 三个 mode 各自重复实现 prompt 循环 / cancellation / 错误处理 / 配置读取，没有共享 "mode skeleton"。

## Deletion test

> 删除 `interactive-mode.ts`？

**Result**: **concentrates dramatically**。

TUI 入口、所有键位、所有 `/command` 调度、模型选择 overlay、auth 流、image 处理、export 触发 …… 都会无家可归。模块是必要的，但与 F01 同病：**load-bearing 但严重 over-loaded**。

## Proposed direction

把 god 文件拆成**编排 + 视图状态 + 命令分发**三层，并抽出跨 mode 共享 skeleton：

```
modes/
├── _shell/                                ← 跨 mode 复用骨架（新）
│   ├── prompt-loop.ts                       prompt → session → stream → render 主循环
│   ├── cancellation.ts                      Ctrl-C / SIGINT / abort 信号收敛
│   └── error-router.ts                      统一错误转 UI / stdout / JSON-RPC
│
├── interactive/
│   ├── interactive-mode.ts                ← 仅作 mount 入口，目标 < 500 行
│   ├── controllers/
│   │   ├── slash-dispatcher.ts              所有 / 命令路由
│   │   ├── model-overlay-controller.ts      模型/thinking 切换 overlay
│   │   ├── session-tree-controller.ts       fork / switch / tree
│   │   ├── auth-controller.ts               API key 流 / OAuth
│   │   └── image-pipeline-controller.ts     粘贴/拖入图像处理
│   ├── state/
│   │   └── interactive-state.ts             所有 React-like 状态合一
│   └── components/                          (已有 47 文件，不动)
│
└── (print / rpc / acp 同样消费 _shell/)
```

**关键 seam**：

- `slash-dispatcher.ts` 把 `core/slash-commands` + extensions runtime 的命令集合统一到一个 dispatch 表 → 让 `extensions/defaults/recap` 和内置 `/model` 走同一个路径（与 1.14.3 抛光的 `c21185d/ca38eac/104da71` 提交的方向一致）
- `auth-controller.ts` 与 `custom-providers` 分离 → 移出 import 头

## Benefits

- **Leverage**：每个 controller 都能独立 unit-test；今天测一个键位要 boot 整个 7868 行
- **Locality**：改一个 `/command` 行为只动一个 controller；当前要在 7868 行 god 文件里搜
- **跨 mode 复用**：`_shell/` 让 print/rpc/acp 不再重复 prompt loop 代码（同时为 F06 lazy load 铺路 —— 主循环骨架很小可以 eager，重的 UI 部分 lazy）

## Before / after sketch

```
BEFORE                              AFTER

modes/interactive/                  modes/_shell/        ← 跨 mode 复用
  interactive-mode.ts (7868)          prompt-loop.ts
  theme/                              cancellation.ts
  components/ (47 files)              error-router.ts
                                    modes/interactive/
                                      interactive-mode.ts (< 500)
                                      controllers/ (5 files)
                                      state/ (1 file)
                                      components/ (47 files)
                                      theme/
```

## ADR / DIP conflict callouts

- **conflict**: `core/CLAUDE.md §Quality Rules` "Single file limit: ~400 lines" —— 19.6× 超标
- **conflict**: `.PENCIL.md` 强调 TUI 是产品核心。本 finding 不动 TUI 行为，只动结构，因此不冲突；但若拆分过程引入回归（如 key handling 改路径），会破坏产品体验 → 实施时必须 keep snapshot tests

## References

- Methodology: depth/locality
- Adjacent: F01（agent-session 是 god 的 runtime 侧；本 finding 是 UI 侧）、F06（lazy load 受益于此）、F08
