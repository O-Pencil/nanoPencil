# UI03: 18 个 core 内部 import 是 seam 清单，抽取时收敛而非平移

```yaml
finding_id: UI03
severity: structural
lenses: [locality, leverage]
files_primary:
  - modes/interactive/interactive-mode.ts
files_secondary:
  - core/runtime/agent-session.ts
  - core/model/custom-providers.ts
  - core/mcp/mcp-config.ts
  - core/persona/persona-manager.ts
status: selected
```

## Problem

`interactive-mode.ts` 的 import 头 199 行，**直接 import 18 个 core 内部**（F02 观察 1 坐实）：

```
core/model/custom-providers · core/runtime/agent-session · core/session/compaction
core/extensions-host · core/platform/keybindings · core/messages · core/mcp/mcp-config
core/model-resolver · core/platform/config/resource-loader · core/session/session-manager
core/slash-commands · core/platform/i18n · core/persona/persona-manager
core/tools/truncate · nanopencil-defaults · core/platform/utils/tools-manager
core/platform/timings · core/theme-contract
```

每条都是"**本应封装在 `AgentSession` 内的能力泄漏到 UI 层**"：一个 mode 不该同时认识 `mcp-config`、`persona-manager`、`model-resolver`、`custom-providers`。这正是 god 文件耦合面过宽的根因。

**风险**：拆 controller 时如果只是把这些 import **平移**进新 controller，耦合面没缩，只是换了文件 —— 违背 P5 的"降耦合"目标。

## Deletion Test

> 这些 import 若被收敛到 facade/context，谁还需要直接认识 core 内部？

**Result**：绝大多数应**消失**。UI 真正需要的是"列 MCP server / 切 persona / 解析 model scope / 读 custom provider 定义"这些**能力**，而非这些**模块**。能力应经 `AgentSession` facade 或各 controller 的窄 context 暴露（沿用 P4 capability-context）。少数纯 UI 工具（i18n `t`、keybindings、theme-contract）可保留。

## Verdict — SELECTED（seam 纪律，贯穿所有抽取）

把这 18 条按归属分三类处理：

| 类别 | 例 | 处理 |
|------|----|------|
| **运行时能力泄漏** | mcp-config、persona-manager、model-resolver、custom-providers、compaction、session-manager、tools-manager | 经 `AgentSession` facade 或 controller 窄 context 暴露能力；UI 不再直接 import |
| **本应在对应 controller 内** | slash-commands(→slash-dispatcher)、custom-providers(→auth/model-overlay) | 随该 controller 一起，且仍走 facade 而非 deep import |
| **纯 UI 原语，保留** | i18n `t`、keybindings、theme-contract、messages 格式化 | 留在 UI 层 |

**UI-G7 强制**：每抽一个 controller，`interactive-mode.ts` 的 core 内部 import **只减不增**；新 controller 不得新增同类 deep import。

## Decision Criteria

- 抽取后 `interactive-mode.ts` import 头逐步收缩；以 import diff 为证。
- 运行时能力一律经 facade/context，不 deep import core 子模块。
- controller 不平移泄漏 import（UI-G7）。
- 收敛不改行为：V5-1 回放绿。

## References

- 母 finding：[F02 观察 1](../../findings/F02-interactive-mode-god-file.md)
- 模式来源：P4 capability-context（[runtime-session-review §Closeout](../../runtime-session-review/README.md)）
- Gate：[gates.md](../gates.md) UI-G7
