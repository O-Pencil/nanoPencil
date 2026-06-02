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
| **运行时能力泄漏** | mcp-config、persona-manager、model-resolver、custom-providers、compaction、session-manager、tools-manager | 收敛到**该 controller 自己的窄 context**（context 内部调这些模块函数）；UI 不再直接 import |
| **本应在对应 controller 内** | slash-commands(→slash-dispatcher)、custom-providers(→auth/provider-config) | 随该 controller 一起，经 context 而非 deep import |
| **纯 UI 原语，保留** | i18n `t`、keybindings、theme-contract、messages 格式化 | 留在 UI 层 |

### ⚠️ 收敛去向优先级（防"耦合搬家"）

收敛**不是**把 18 条一律塞进 `AgentSession` facade —— 那会给 P4 刚瘦下来的 AgentSession（3550→2375）**重新加肥**，把 UI god 的耦合搬成 runtime god 的耦合。优先级：

1. **首选：收敛到该 controller 的窄 context**。`mcp-config`/`persona-manager`/`model-resolver`/`custom-providers` 多是**模块级函数**，让 controller 的 `*ControllerContext` 内部去调它们，UI 与 mount 都不认识这些模块。
2. **仅当能力本属会话生命周期**（已在 AgentSession 内、UI 只是读）才走 facade。
3. **判据**：收敛后 `agent-session.ts` 的公共面**不应因 UI 重构而显著变大**；若某条收敛会迫使 AgentSession 新增一批 wrapper，说明它该进 controller context，不是 facade。

**UI-G7 强制**：每抽一个 controller，`interactive-mode.ts` 的 core 内部 import **只减不增**；新 controller 不得新增同类 deep import，且**不得借收敛之名给 AgentSession facade 加肥**（优先 controller 窄 context）。

## Decision Criteria

- 抽取后 `interactive-mode.ts` import 头逐步收缩；以 import diff 为证。
- 运行时能力一律经 facade/context，不 deep import core 子模块。
- controller 不平移泄漏 import（UI-G7）。
- 收敛不改行为：V5-1 功能验收通过。

## References

- 母 finding：[F02 观察 1](../../findings/F02-interactive-mode-god-file.md)
- 模式来源：P4 capability-context（[runtime-session-review §Closeout](../../runtime-session-review/README.md)）
- Gate：[gates.md](../gates.md) UI-G7
