# Recap 扩展

> 长任务进行中的"认知快照"：让用户随时看到模型当前对目标的理解、已确立的事实、以及等待用户决策的下一步

## 概述

Recap 是一个默认加载的内置扩展，提供 `※ recap:` 形态的元信息消息。在多轮、跨上下文的复杂任务中，用户可以通过 `/recap` 立刻看到一段三段式摘要：

```
※ recap · free
  Current goal: 把 widgets-web 从 HSF 2 升级到 @ali/egg-hsfclient@3.15.4
  Key facts: read(×5), edit(×3), bash(×2); files: package.json, src/config/hsf.ts
  Next: respond to "是否还需要把 engines.install-node 也改了？"
```

**位置**：`extensions/defaults/recap/`

**特点**：
- 默认 Free 模式（确定性提取），零 token、零等待
- `/recap --smart` 显式触发 LLM 合成，行内展示真实 token 用量与估算费用
- 自动触发未实现；保留为后续里程碑
- 任何路径都受空会话守卫保护，无活动时不会渲染也不会调模型
- Smart 路径仍保留单次 token 上限，作为反误伤保险

---

## 设计立场

> **默认零成本零等待**；付费路径必须显式开启。

经过 prototype 评估（见后文「设计权衡记录」），决策反转：

- `/recap` 默认走 Free（确定性提取，零 token、零等待）
- `/recap --smart` 显式走 LLM 合成，仅当用户需要更润色的 Facts 段时使用
- 自动触发暂不开放，无论 Free 还是 Smart 都要用户主动调用

成本透明化、预算保护对 Smart 路径仍生效，是**反误伤**机制。Free 路径根本不消耗 token，无需保护。

---

## 三段式产物结构

每次 recap 必须输出且仅输出三段，顺序固定：

| 段位 | 含义 | 语言要求 |
|---|---|---|
| **当前目标** | 模型对用户正在做的事的理解（一句话） | 跟随用户最近一条消息的语言 |
| **关键事实** | 已确立的具体证据（文件路径、版本号、命令结果、决策） | 行内代码用反引号包裹 |
| **下一步** | 等待用户决策的事，或确认"continue / 继续" | 中文以"下一步："开头，英文以"Next:"开头 |

总长上限：60 英文词 / 120 中文字。没有 markdown 标题、没有寒暄、没有元话术。

---

## 双轨产物

### Free Recap（`/recap` 默认）

纯结构提取，**不调模型**，耗时 < 10ms。当前实现：

| 段位 | 抽取来源 |
|---|---|
| 当前目标 | user 消息中最长且 ≥30 字符且非斜杠命令的那一条；fallback 取最长 |
| 关键事实 | 工具调用名字频次 top 3（`read(×N)`、`edit(×N)` …）+ 触达过的文件路径 top 3（从 edit/write/read 参数、bash 命令正则提取） |
| 下一步 | 最近一条 user 消息含 `?/？` 或问句词头时输出 `respond to "<原句>"`；否则 `continue` |

后续可接入 plan/grub 状态进一步增强"下一步"段。

### Smart Recap（`/recap --smart`）

调用 `ctx.completeSimpleWithUsage(system, user)` 让模型合成更润色的版本。

输入构造（控制 token）：

```
[最近 N=20 轮]    ← user + assistant，assistant 截断到 500 字
[最近 8 个工具名] ← 只名字，不带结果
```

模型只看会话片段，输入 token 通常 ≤ 1200。每次调用 header 标注真实 in/out token + cost。Smart 主要赢在「关键事实」段——能从工具结果里提炼语义（如"Node 必须升级到 18.20"），Free 只能列调用统计。

---

## 触发模型

| 触发 | 路径 | 默认状态 |
|---|---|---|
| `/recap` 用户主动 | Free（确定性） | 永远可用，零成本 |
| `/recap --free` 用户主动 | Free | 永远可用，等价于 `/recap` |
| `/recap --smart` 用户主动 | Smart（LLM） | 永远可用，按 token 计费 |
| `turn_end` / `session_before_compact` 自动 | — | **未实现**，未来如开放需显式 opt-in |

**关键不变量**：不存在任何"用户没显式输入 `--smart` 的情况下调用模型"的路径。

未来若开放自动触发的节流条件草案（仍待评估）：

- 距上次 recap 已过 ≥ 6 轮 human turns
- 上下文用量自上次 recap 起增长 ≥ 20 个百分点
- `session_before_compact` 必触发一次（不受节流约束）

---

## 命令面

当前已实现：

```
/recap                    # Free，默认。零 token、零等待
/recap --free             # 同上，显式形式
/recap --smart            # Smart 合成，调用 LLM、付费、需等待
```

未来里程碑（未实现）：

```
/recap auto on            # 启用自动触发
/recap auto off           # 关闭自动触发
/recap status             # 显示 Smart 调用次数、token 累计
/recap budget reset       # 重置 Smart 预算
```

---

## 成本透明化机制

### 行内展示

每次 Smart 渲染的标题行：

```
※ recap · {tokensIn} in / {tokensOut} out · ~${estCost}
```

- `tokensIn / tokensOut`：从 agent-session 的 token 账本读取真值；如果账本不可得，用 `system.length + user.length` 按 4 字符 ≈ 1 token 保守估算，并加 `~` 前缀
- `estCost`：从模型 metadata 中的 cost 字段计算

### 预算硬上限（可配置，默认值如下）

| 维度 | 默认 |
|---|---|
| 单次 Smart 输入 token 上限 | 1200 |
| 单次 Smart 输出 token 上限 | 250 |
| 会话累计 Smart 调用 | 10 次 |
| 会话累计 Smart token | 15000 |
| 日累计 Smart 调用 | 30 次 |
| 日累计 Smart token | 50000 |

超阈值时的行为：

1. 不发起 Smart 调用
2. 自动改跑 Free 并渲染
3. 在 Free 渲染下方加一行提示："Smart budget exhausted (session). Use /recap budget reset to continue."

### 调用前的可感知性

Smart 流水线：

```
[0] 活动量检查       → 0 user message + 0 tool call → notify 后直接返回，无 token 消耗
[1] 节流 / 预算检查   → 命中预算 → 降级 Free
[2] 构造 Free 骨架   → 0 token
[3] UI 预公示       → ctx.ui.notify("Synthesizing recap (~{est} in tok)…", "info")
[4] completeSimple()
[5] 记账            → 累计到 RecapBudgetState，appendEntry 持久化
[6] 渲染            → 标题行带真实 in/out token + ~$
```

第 0 步的活动量守卫修复了 M1 早期测试发现的浪费：全新会话执行 `/recap` 会用占位文本喂模型，单次消耗 ~500 token。守卫零开销、可在 `buildRecapContext()` 中一并完成。

第 3 步的预公示让用户在调用发起前就能看到"我正在花钱"，可以 Ctrl+C 取消。

---

## 与其他扩展的协同

### plan/

Smart Recap 在合成时，如果检测到当前处于 plan mode，会把"下一步"段绑定到 plan 文件中**最早未勾选的 step**，而不是模型自由推断。骨架构造时通过 `api.events` 读取 plan 文件状态。

Free Recap 同样如此。

### grub/

如果会话内有 GRUB_MESSAGE_TYPE 消息，说明正在跑 autonomous harness，"下一步"语义变为"下一次迭代目标"。Smart 的 system prompt 会动态切换措辞。

### soul/

soul 的人格风格会影响 Smart 输出的语气，但不在 MVP 范围。

### presence/btw/

属同一"元信息消息"家族，共享 `customMessageBg` 主题色，UI 视觉一致。

---

## 与 LLM 上下文的关系

`recap` 消息**排除出 LLM 上下文**。具体做法是在 `core/messages.ts` 的 `CUSTOM_MESSAGE_TYPES_EXCLUDED_FROM_CONTEXT` 集合里加入 `"recap"`。

**为什么必须排除**：recap 是给人看的元信息。如果回送给模型，会形成"自我引用回声"——模型把自己的总结当作事实复述，造成信息漂移。

---

## 文件结构

```
extensions/defaults/recap/
├── index.ts                # 入口：命令、hook、renderer 注册
├── recap-extractor.ts      # Free Recap 结构提取（零 token，纯函数）
├── recap-synthesizer.ts    # Smart Recap：包 completeSimple + 预算检查 + 记账
├── recap-budget.ts         # RecapBudgetState、记账、阈值判定、持久化
├── recap-renderer.ts       # ※ recap 渲染（Smart / Free 两种 footer）
├── recap-controller.ts     # 自动模式的节流（自动只跑 Smart，命中预算降级 Free）
├── recap-types.ts          # 类型定义
└── CLAUDE.md               # P2 模块说明
```

每个文件 ≤ 200 行。

---

## 类型契约（核心）

```typescript
type RecapSource = "smart" | "free";

interface RecapEntry {
  source: RecapSource;
  goal: string;          // 当前目标
  facts: string[];       // 关键事实，已分割
  nextStep: string;      // 下一步
  triggeredAt: number;
  trigger: "manual" | "auto-turn" | "auto-compact";
  usage?: {              // 仅 source === "smart" 时存在
    tokensIn: number;
    tokensOut: number;
    estimatedCostUsd: number;
    isEstimated: boolean; // true 表示 in/out 由字符数估算
  };
}

interface RecapBudgetState {
  sessionCalls: number;
  sessionTokens: number;
  dailyCalls: number;
  dailyTokens: number;
  dailyResetAt: number;  // unix ts，过期重置
  lastRecapHumanTurn: number;
  lastRecapContextPct: number;
}

interface RecapSettings {
  autoEnabled: boolean;          // 默认 false
  turnsBetween: number;          // 默认 6
  contextPctDelta: number;       // 默认 0.20
  budgets: {
    perCallTokensIn: number;     // 默认 1200
    perCallTokensOut: number;    // 默认 250
    sessionCalls: number;        // 默认 10
    sessionTokens: number;       // 默认 15000
    dailyCalls: number;          // 默认 30
    dailyTokens: number;         // 默认 50000
  };
}
```

---

## API 依赖（已核实）

| 用途 | 已有 API |
|---|---|
| 注册命令 | `api.registerCommand(name, options)` |
| 监听轮次 | `api.on("turn_end", handler)` |
| 监听压缩 | `api.on("session_before_compact", handler)` |
| 一次性 LLM 调用 | `ctx.completeSimple(system, user)` |
| 读会话历史 | `ctx.sessionManager.getBranch()` / `.getEntries()` |
| 读上下文用量 | `ctx.getContextUsage()` |
| 推送消息 | `api.sendMessage({customType:"recap", content, display:true})` |
| 自定义渲染 | `api.registerMessageRenderer("recap", renderer)` |
| 持久化扩展状态 | `api.appendEntry("recap-state", data)` |
| 排除 LLM 上下文 | `core/messages.ts:24` 集合追加 `"recap"` |
| UI 通知 | `ctx.ui.notify(message, level)` |
| 二次确认 | `ctx.ui.confirm(...)` |

**已核实并解决**：`completeSimple()` 底层返回 `AssistantMessage.usage`（含 token 真值与已计算费用），但旧 wrapper 把它丢弃。M1 在 PR-C（commit `0c1c021`）中新增 `completeSimpleWithUsage(systemPrompt, userMessage): Promise<CompletionResult | undefined>`，recap 直接拿真值，UI 上无需 `~` 前缀。

---

## 合成 Prompt

```
You are producing a brief situational recap for the user mid-task.

Output exactly three short clauses in this order:
1. Current goal (what you understand the user wants — one sentence)
2. Key facts established so far (concrete artifacts: files touched, versions,
   decisions made — comma-separated)
3. Next decision needed from the user (start with "Next:" or "下一步：")

Constraints:
- Match the language of the user's most recent message (Chinese in, Chinese out)
- Wrap inline identifiers in backticks
- No greetings, no meta ("Here's a recap..."), no markdown headers
- 60 words / 120 Chinese chars max total
- If no decision is pending, say "Next: continue / 下一步：继续执行"
- The skeleton below is pre-extracted ground truth; do not contradict it
```

user message 拼装：

```
[skeleton]
Goal: {extractedGoal}
Facts: {extractedFacts.join(", ")}
Next: {extractedNextStep}

[recent turns]
User: ...
Assistant: ... (truncated to 500 chars)
...

[recent tools]
edit, write, bash, bash, grep
```

骨架先行 + 历史辅助。模型在已有事实上润色，而不是从零生成。

---

## 渲染

视觉刻意压低权重——recap 是"提醒用户别跑偏"的轻量提示，不是头条卡片：

```typescript
api.registerMessageRenderer("recap", (msg, _opts, theme): Component => {
  const entry = msg.details as RecapEntry;
  const body = extractContentText(msg.content);
  const header = entry.source === "smart" && entry.usage
    ? `※ recap · ${entry.usage.input} in / ${entry.usage.output} out · ~$${entry.usage.cost.total.toFixed(4)}`
    : `※ recap · free`;

  const container = new Container();
  container.addChild(new Spacer(1));
  container.addChild(new Text(theme.italic(theme.fg("dim", header)), 0, 0));
  if (body.trim()) {
    container.addChild(new Text(theme.italic(theme.fg("dim", body)), 0, 0));
  }
  return container;
});
```

- `※` 是 U+203B REFERENCE MARK，等宽终端兼容良好
- 不使用 `Box` / `customMessageBg`：M1 早期测试反馈背景块过于显眼；recap 应作为会话中段提示存在，不该抢走焦点
- 不使用 `Markdown`：避免反向依赖 `modes/interactive/theme` 拿 `getMarkdownTheme()`，保证扩展跨模式可用
- 不渲染 body 段当内容为空（如未来 Free 路径的极简表示）

---

## MVP 分阶段

| 阶段 | 内容 | LLM 风险 |
|---|---|---|
| **M1** | `/recap` Smart 实现 + renderer + 排除 LLM 上下文 + builtin 注册 + 行内成本展示 + 单次预算硬上限 + 空会话守卫 | 用户显式触发，单次有上限 |
| **M2** | Free 路径 + `recap-extractor` + 离线 eval 脚本 + **默认翻转为 Free**（评估通过后），Smart 改为 `--smart` 显式触发 | 零（默认路径无 LLM） |
| **M3** | 会话 / 日预算 + `/recap status` + `/recap budget reset` + 持久化 | 加固现有 Smart 路径 |
| **M4** | 自动触发（`/recap auto on/off` + `recap-controller` + 节流） | 用户显式开启后才有，仍受预算约束 |
| **M5** | 与 plan / grub 协同合成 + 主题色 `recapBg` | 零 |

每阶段独立可发、独立回滚。M1 上线即可用 Smart `/recap`，M4 后才有自动行为。

---

## 验收清单

每次发版前确认：

- [ ] 不存在用户未显式调用 / 未显式 `auto on` 的代码路径会触发 `completeSimple`
- [ ] 每次 Smart 渲染必带 token 用量行
- [ ] 预算耗尽时降级到 Free 而非静默继续 Smart
- [ ] `/recap status` 显示真实累计
- [ ] `recap` 在 `CUSTOM_MESSAGE_TYPES_EXCLUDED_FROM_CONTEXT` 集合内
- [ ] P2/P3 同步：`extensions/defaults/CLAUDE.md`、`extensions/defaults/recap/CLAUDE.md`、各源文件 P3 头
- [ ] `npx tsx scripts/verify-dip.ts` 通过

---

## 设计权衡记录

| 选择 | 备选 | 取舍理由 |
|---|---|---|
| **Free 默认（决策反转）** | Smart 默认 | prototype 评估：Free 的 goal/next 段质量与 Smart 持平，Facts 段稍逊但非决策关键；零成本、零等待更契合"会话结尾自然出现"的目标 UX |
| Smart 改为 `--smart` 显式 | 完全去掉 Smart | 部分场景（多轮、工具结果丰富）Smart 的 Facts 提炼仍有价值；保留按需付费的能力 |
| 自动触发不实现 | 默认关 + 命令开启 | 当前 Free 已足够，自动触发的实现成本（去重、节流、降级）暂不值得 |
| 行内 token 显示（Smart） | 仅 status 集中显示 | 单次成本紧贴单次结果，认知负担最低 |
| 排除 LLM 上下文 | 进上下文供模型自参考 | 防止自我引用回声 |
| `※` 前缀 | `>` 或其他 | 等宽终端兼容；与 Claude TUI 视觉一致 |

---

## 风险与已知未决

1. ~~**`completeSimple` token usage 回传**~~：已通过 PR-C 解决，新增 `completeSimpleWithUsage` 接口直接拿真值。
2. ~~**`builtin-extensions.ts` 注册路径**~~：已确认是显式 import 路径常量 + `existsSync` 判定的注册表机制，recap 已加入（commit M1）。
3. **多语言切换边界**：用户跨语言切换时 recap 语言应跟随最新一条 user 消息，目前 M1 完全依赖模型对系统提示中 "Match the language of the user's most recent message" 指令的执行；与 presence 扩展的语言检测对齐留到 M5 协同时一并处理。
4. **M1 仅实现 Smart 路径**：design 中的 Free 路径（`/recap --free`）、自动触发（`/recap auto on`）、`/recap status` 累计审计未在 M1 范围。当前 `/recap --smart` 与不带参数的 `/recap` 等价。

---

**Covenant**：本文档与 `extensions/defaults/recap/` 实现保持同构。代码变更时更新本文档，文档变更时同步源文件 P3 头与 P2 索引。
