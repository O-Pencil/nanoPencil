# Interactive UI Gates

```yaml
gate_set: interactive-ui
inherits:
  - ../execution-plan/gates.md#门组-b
  - ../runtime-session-review/gates.md   # 同型，沿用 RS 精神
applies_to:
  - modes/interactive/interactive-mode.ts
  - modes/interactive/controllers/*.ts
  - modes/interactive/state/*.ts
  - modes/_shell/*.ts
```

## Hard Gates

| Gate | Rule | Validation |
|------|------|------------|
| UI-G1 No reverse mount import | controllers/state 不得 import `./interactive-mode.ts`（mount 是组合根，单向）| `rg 'from "\.\./interactive-mode\|from "\./interactive-mode' modes/interactive/controllers modes/interactive/state` 必须为空 |
| UI-G2 No service-locator context | controller context 暴露**命名能力**（闭包），不得整体接收 `InteractiveMode` 或 `AgentSession` | code review |
| UI-G3 Single owner | 每个 UI 副作用/overlay（attachments、extension widget、model overlay、auth 流…）只有一个 owning controller | finding 卡 + code review |
| UI-G4 TUI 行为稳定（命门）| `V5-1` interactive-mode 级 characterization **全过**；公共符号表不变 | characterization 回放 + 符号 diff（**前置 UI01 基线存在**）|
| UI-G5 No fake extraction | 新 controller 必须**持自己那片状态或藏真复杂度**；纯转发占位不算完成 | deletion test |
| UI-G6 DIP isomorphism | 新 UI 文件有 P3 头，并登记进 `modes/AGENT.md` / `modes/CLAUDE.md`（及 `modes/interactive` 子目录索引）| P2/P3 review |
| UI-G7 No deepened core leakage | 抽 controller 时，对 core 内部的直接 import 必须**收敛到 AgentSession facade / 窄 context**（UI03），禁止把泄漏的 import 平移进 controller 或新增同类泄漏 | import diff + grep |

## Single-Owner Table（草案，随卡定稿）

| Concern | Owner | Non-owner rule |
|---------|-------|----------------|
| `/command` 路由 + 各 handle*Command | `slash-dispatcher` | mount 只委托 |
| model/thinking/provider overlay | `model-overlay-controller` | mount 只委托；provider 配置与 auth 边界见 UI02 |
| API key / OAuth 流 | `auth-controller` | provider 凭据不散落到 model overlay |
| fork/switch/tree 选择器（UI 侧）| `tree-overlay-controller`（UI05 改名）| 与 P4 runtime `session-tree-controller` 不同层 |
| 剪贴板/附件/图像管线 | `image-pipeline-controller` | 附件状态归此 |
| 扩展 widget/overlay 表面 | `extension-ui-controller`（UI02 新增）| mount 不直接 set/clear extension widget |
| 自更新/版本检查/重装 | `self-update-controller`（UI02 新增）| 与 TUI 渲染解耦 |
| Ctrl-C/D/Z + shutdown 信号 | `_shell/cancellation`（跨 mode）| mount 只接线 |
| ~80 响应式状态字段 | `state/interactive-state` | 散落的 `this._` 收敛 |
| 流式渲染事件路由（`handleEvent`）| 暂留 mount（UI04 deferred）| 不强行抽空壳 |

## Review Questions

每个切片回答：

1. 哪些 UI 状态/overlay 句柄移动了？
2. 哪些 `InteractiveMode` 公共方法仍作 mount 门面保留？
3. 哪段代码变得可不 boot 整个 7960 行就单测？
4. `interactive-mode.ts` 少了哪些 import？是否减少了对 core 内部的泄漏（UI-G7）？
5. 新引入哪些 import，是否服从 GB-1 / UI-G7？
6. 行为是否仍经同一公共路径 + 同一键序 可达，且 V5-1 回放绿？

## Low-Performance Machine Policy

同 [runtime-session-review](../runtime-session-review/gates.md#low-performance-machine-policy)：

允许：`git diff --check`、`rg`/`sed`/`git diff`、`npx tsx scripts/verify-quality.ts`。

需 maintainer 批准机器算力：`npm install`、`npm run build`、完整 vitest、CLI smoke。
