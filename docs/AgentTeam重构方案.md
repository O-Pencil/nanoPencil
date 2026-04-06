# nanoPencil SubAgent & AgentTeam 重构方案

> 本文取代旧版《AgentTeam 重构方案》。
> 旧方案把 SubAgent 与 AgentTeam 混为一谈，导致 P0–P7 的优先级与 core/extension 边界都失真。
> 本版按"先 SubAgent 后 AgentTeam"两个独立阶段重写，并重新设计命令命名。

---

## 〇、概念对齐

| 维度 | SubAgent | AgentTeam |
|---|---|---|
| 归属 | 主会话内部的能力 | 跨会话的运行时 |
| 上下文 | 临时独立窗口，结束即销毁 | 每个 worker 独立窗口，长期存在 |
| 触发 | 主 agent 委派 / 工具调用 / 编排器一次性调度 | 编排器显式管理，可持续接任务 |
| 生命周期 | 一次任务一条命 | 长期 teammate，可恢复 |
| 状态 | 不持久 | 必须 durable、可恢复 |
| 隔离 | 仅上下文隔离 | 上下文 + 工作区 + 权限 |
| 典型场景 | "并行查三处实现"、"评审一段代码" | "三个 teammate 长期负责三个模块" |

### 当前 `/agent team` 的真实定位

当前 `extensions/defaults/team/index.ts` 通过 `createAgentSession()` 起一组临时 worker，用 `Promise.all` 跑 research，run 完即销毁，没有 teammate identity，也没有跨主会话生命周期。

**因此当前实现本质上是"主会话内的多 SubAgent 编排器"，不是 AgentTeam。**

承认这一点是本次重构的前提。

### 路线选择

- **阶段 A**：把 SubAgent 做成 core 一等公民，把现有 `/agent team` 收敛为一个安全、可停、隔离的 SubAgent 编排器。**完成阶段 A，nanoPencil 拥有可靠的多 SubAgent，但仍然没有 AgentTeam。**
- **阶段 B**：在 SubAgent 之上构建真正的 AgentTeam（持久 teammate、worktree 隔离、permission model、跨主会话生命周期）。

阶段 A 与阶段 B 各自可独立交付、独立验收、独立决定是否做。

---

## 一、命令重新设计

旧命令 `/agent team ...` 中间带空格、且把 SubAgent 顶着 team 的名字，长期会让产品叙事和实现脱节。新命令规则：

1. **顶层命令是单 token，无空格**
2. **子命令用冒号分隔**（`/cmd:sub`），不允许中间空格
3. **SubAgent 与 AgentTeam 各自占独立命名空间**
4. **`/team` 名字保留给阶段 B 真正的 AgentTeam，阶段 A 不得占用**

### 阶段 A 命令（SubAgent 编排器）

| 命令 | 作用 |
|---|---|
| `/subagent` | 显示帮助与最近一次 run 状态 |
| `/subagent:run <task>` | 启动一次 SubAgent 编排（planner → research → impl → review） |
| `/subagent:stop` | 中断当前 run（所有 worker） |
| `/subagent:status` | 显示当前 run 的阶段、各 worker 状态 |
| `/subagent:report` | 输出最近一次 run 的报告路径 |

旧的 `/agent team ...` 在阶段 A 落地时**直接下线**，不保留别名，避免长期歧义。

### 阶段 B 命令（真正的 AgentTeam）

| 命令 | 作用 |
|---|---|
| `/team` | 列出当前 team 的全部 teammate 与状态 |
| `/team:spawn <role> [--name <id>]` | 创建一个持久 teammate |
| `/team:send <name> <message>` | 向已有 teammate 发消息 |
| `/team:status [<name>]` | 查看 team 或单个 teammate 状态 |
| `/team:stop <name>` | 终止某个 teammate 当前 turn |
| `/team:terminate <name>` | 彻底销毁某个 teammate |
| `/team:approve <request-id>` | 回复 permission_request |
| `/team:mode <name> <plan\|execute\|review>` | 切换 teammate 模式 |

---

## 二、阶段 A：SubAgent 一等公民化

### A.0 目标

让 SubAgent 成为 core 的一等概念：

- 任何扩展都能 spawn 一个隔离的 SubAgent
- spawn 出来的 SubAgent **可停、可超时、可硬只读、可观察**
- 把当前 `/agent team` 的实现下沉到这套 SubAgent runtime 上，并改名为 `/subagent`

### A.1 当前实现的硬伤（必须先修）

引用旧方案中的诊断，在阶段 A 范围内仍然有效：

1. **Read-only worker 不是硬只读**：`extensions/defaults/team/index.ts:756` 写明，read-only worker 仍带 `bash`。
2. **Stop 不可靠**：`createAgentSession()` 起的 native worker 没有统一 abort 通道。
3. **Implementation worker 直接写主工作区**：旧方案 P0 没有覆盖这一点，本方案在 A.3 中补齐"最小隔离"。
4. **`auto` 模式可能自决定是否进入写阶段**：在没有 permission system 之前不安全。

### A.2 SDK 必要修复（阶段 A 的真正 P0）

这一部分必须先于一切 SubAgent 工作落地，否则后续都建立在不能停的运行时上。

- `core/runtime/sdk.ts` 的 `createAgentSession()` 接受外部 `AbortSignal`
- Agent turn loop 在 LLM 调用、tool 调用前后检查 signal
- 退出时保证：
  - 当前 turn ≤ 15 秒内结束
  - 后续 turn 不再启动
  - 工具进程被 kill（`bash` 调用要透传 signal）

**验收**：单元测试，给 `createAgentSession()` 传入一个 signal，1 秒后 abort，断言 15 秒内 promise resolve/reject 且没有继续打印 token。

### A.3 core 新增：SubAgent 运行时

新增目录（注意：**不叫 team**）：

```text
core/sub-agent/
  sub-agent-runtime.ts     # spawn / abort / lifecycle
  sub-agent-backend.ts     # in-process / subprocess 抽象
  sub-agent-types.ts
core/workspace/
  worktree-manager.ts      # 通用 git worktree / 临时目录管理
```

最小接口：

```ts
interface SubAgentSpec {
  prompt: string
  tools: ToolSet              // 调用方决定，core 不猜
  cwd: string                 // 调用方决定，可以是 worktree
  signal: AbortSignal         // 必须
  contextPolicy?: ContextPolicy
  timeoutMs?: number
}

interface SubAgentHandle {
  readonly id: string
  readonly status: "running" | "done" | "aborted" | "error"
  result(): Promise<SubAgentResult>
  abort(): Promise<void>     // 停当前 turn
  terminate(): Promise<void> // 彻底销毁
}

interface SubAgentBackend {
  spawn(spec: SubAgentSpec): Promise<SubAgentHandle>
}
```

后端：

- `in-process`（默认）：包装 `createAgentSession()`
- `subprocess`：阶段 A 不强制实现，但接口位置预留

**核心约束**：core 的 SubAgent runtime **不知道 planner / research / impl / review** 这些角色，它只负责 spawn 一个隔离的 agent。所有角色编排留在扩展层。

### A.4 工具权限硬约束

- `core/tools/index.ts` 已有 `createReadOnlyTools()`，作为唯一 read-only 入口
- 阶段 A 落地时，read-only SubAgent 调用方**禁止**在外面再 `bash` / `edit` / `write` 注入
- 增加 lint：检查所有 `spawnSubAgent` 调用点，read-only mode 不允许传入写工具
- `bash` 工具本身需要支持"沙箱模式"（禁止 `>`, `>>`, `mv`, `rm`, `git commit`, `git add` 等写操作）作为兜底

### A.5 最小隔离（implementation 不再直接动主工作区）

在阶段 A 就要把"会写"的 SubAgent 至少拉出主工作区：

- `core/workspace/worktree-manager.ts` 提供：
  - `createTempWorkspace(seedFiles[]): WorkspacePath`
  - `createGitWorktree(branch?: string): WorkspacePath`
  - `dispose(path)`
- 阶段 A 默认走 `createTempWorkspace`（拷贝相关文件即可，不强制 git worktree）
- implementation SubAgent 的 `cwd` 指向临时工作区
- run 结束时，把 diff 回写到主工作区前**先在主会话给用户看 diff，由用户确认**
- 不确认 → 工作区直接 dispose

**这一项是阶段 A 与旧方案 P0 的关键差异**，旧方案把它推到了 P5，会导致 M1 安全叙事不闭环。

### A.6 把 `/agent team` 重写为 `/subagent`

- 删除 `extensions/defaults/team/`
- 新建 `extensions/defaults/subagent/`：
  - `index.ts`：注册 `/subagent` 系列命令、UI 渲染
  - `subagent-parser.ts`：子命令解析
  - `subagent-runner.ts`：planner → research → impl → review 状态机（**这是 SubAgent 编排器的产品决策，留扩展**）
  - `subagent-renderer.ts`：interactive 模式下的状态展示
- 全部 worker 通过 `core/sub-agent/sub-agent-runtime.ts` 的 `spawn()` 启动
- read-only worker 用 `createReadOnlyTools()`
- impl worker 用临时工作区
- `auto` 模式中"自动决定写代码"的分支砍掉，必须用户显式 `--write` 或 prompt 中明示

### A.7 阶段 A 验收（M-A）

- ✅ `createAgentSession()` 支持 `AbortSignal`，单测覆盖
- ✅ `core/sub-agent/` 与 `core/workspace/` 已建立，被扩展层使用
- ✅ `/subagent:run` 工作正常，研究与评审 worker **没有任何**写入能力（包括不能通过 bash 间接写）
- ✅ `/subagent:stop` 在 15 秒内停止所有 worker
- ✅ implementation worker 默认在临时工作区运行，diff 回写需用户确认
- ✅ `/agent team` 已下线
- ❌ 阶段 A 不交付：teammate 持久化、跨会话恢复、permission request/response、worktree 长期管理

**完成阶段 A 后，nanoPencil 拥有"安全的多 SubAgent 编排器"，但仍然没有 AgentTeam。**

---

## 三、阶段 B：真正的 AgentTeam

### B.0 目标

在 SubAgent 之上构建持久、可恢复、可协商的 AgentTeam runtime，对应 `.PENCIL.md` 中 team 的六项产品目标：isolated workers、clear delegation boundaries、concise summaries、durable artifacts、safe stopping & recovery、low context pollution。

阶段 B 是独立产品决策，可以延迟启动。

### B.1 持久 teammate 模型

新增（**留在扩展层**，不污染 core）：

```text
extensions/defaults/team/
  index.ts                 # /team 系列命令
  team-parser.ts
  team-renderer.ts
  team-runtime.ts          # teammate 注册表与生命周期
  team-state-store.ts      # durable state，与主 SessionManager 解耦
  team-mailbox.ts          # leader ↔ teammate 消息协议
  team-permissions.ts      # plan/execute/review mode、路径授权
```

`TeammateState` 最小字段：

- `agentId` / `agentName` / `teamName`
- `role`
- `mode`（plan / execute / review / research）
- `status`
- `abortController`（整个 teammate）
- `currentWorkAbortController`（当前 turn）
- `messages`
- `pendingUserMessages`
- `worktreePath`
- `lastActiveAt`

### B.2 状态持久化的归属

阶段 A 没解决的一个问题：teammate 的对话历史是不是复用 SessionManager？

**阶段 B 决策**：

- **不复用** SessionManager 的 session 文件
- team-state-store 自己负责 teammate 历史与 mailbox
- SessionManager 只负责主会话
- 跨进程恢复时，team-state-store 是 teammate 状态的 source of truth；主会话恢复后通过 team-runtime.attach() 重新挂载已有 teammate

这一条必须在 B.1 之前先冻结，否则 mailbox / permission 都会反复返工。

### B.3 Mailbox 协议

消息类型：

- `task_request` / `task_progress` / `task_result`
- `permission_request` / `permission_response`
- `plan_approval_request` / `plan_approval_response`
- `mode_change`
- `shutdown_request` / `shutdown_ack`

mailbox 是 teammate 与 leader 的**唯一**通信通道，不允许直接函数回调耦合。

### B.4 Permission Model

- 默认 implementation teammate 进入 `plan` mode，输出计划等待 leader `/team:approve`
- leader 可对 teammate 授予路径白名单 `--allow-path src/foo`
- 高风险工具（写文件、危险 bash、git 变更）走 `permission_request`
- 顺序：先冻结 permission model → 再实现 mailbox 上的 permission_request/response → 最后接 UI

阶段 B 中 **permission 必须早于 mailbox 完整化**，否则 mailbox 协议会被反复改。

### B.5 完整 worktree 隔离

- 每个 implementation teammate 默认绑定一个 git worktree
- review teammate 默认只读 implementation 的 worktree，或读取已 staged diff
- teammate terminate 时 worktree 自动 dispose
- worktree manager 复用阶段 A 在 `core/workspace/` 建立的基础设施

### B.6 多 backend

阶段 A 已经有 `SubAgentBackend` 接口，阶段 B 在此基础上：

- 增加 `subprocess` backend（teammate 跑在独立进程，崩溃不影响主会话）
- 预留 `acp` backend
- backend 选择由 `/team:spawn --backend ...` 控制

### B.7 观察 / 调试 / 测试

- 每个 teammate 独立 transcript 文件
- `/team:status` 显示成员级状态
- 单元测试：state machine、permission model、mailbox
- 集成测试：spawn → send → permission_request → approve → terminate
- 恢复测试：进程中断 + 重启后 teammate 仍可被 `/team` 列出并继续接任务

### B.8 阶段 B 验收（M-B）

- ✅ teammate 拥有稳定 identity，跨主会话可恢复
- ✅ `/team:send` 能向已有 teammate 投递消息，teammate 异步处理后回投 `task_result`
- ✅ `/team:approve` 能闭环 permission_request
- ✅ implementation teammate 默认在 git worktree 中工作，主工作区始终干净
- ✅ teammate 崩溃 / 主会话崩溃后，`/team` 仍能列出并恢复 teammate
- ✅ `.PENCIL.md` 六项 team 产品目标全部可验证

---

## 四、Core / Extension 边界

判定线（与 nanoPencil 现有 `core/` 与 `extensions/defaults/` 的分层一致）：

> "如果禁用它，nanoPencil 还是不是一个完整的 coding agent？"

| 能力 | 服务对象 | 归属 | 阶段 |
|---|---|---|---|
| `createAgentSession` 接受 `AbortSignal` | 所有 | `core/runtime/sdk.ts` | A |
| SubAgent runtime（spawn/abort/lifecycle） | 所有扩展 | `core/sub-agent/` | A |
| Worktree manager / 临时工作区 | 所有扩展 | `core/workspace/` | A（最小）/ B（完整） |
| Read-only 工具集硬约束 | 所有 | `core/tools/` | A |
| SubAgent 编排（planner→research→impl→review） | `/subagent` 这个产品 | `extensions/defaults/subagent/` | A |
| Teammate identity / 注册表 | `/team` 这个产品 | `extensions/defaults/team/` | B |
| Mailbox 协议 | `/team` 这个产品 | `extensions/defaults/team/` | B |
| Permission model | `/team` 这个产品 | `extensions/defaults/team/` | B |
| Multi-backend（subprocess / acp） | 所有扩展可受益 | core 接口 + 各扩展实现 | A 接口 / B 实现 |

**核心规则**：core 只提供"如何安全地起一个隔离 sub-agent"和"如何管理工作区"这两件事；任何"角色"、"状态机"、"团队产品形态"都属于扩展层的产品决策。

---

## 五、目录草图

### 阶段 A 完成后

```text
core/
  runtime/
    sdk.ts                       # +AbortSignal 透传
    agent-session.ts
  sub-agent/                     # 新
    sub-agent-runtime.ts
    sub-agent-backend.ts
    sub-agent-types.ts
  workspace/                     # 新
    worktree-manager.ts
  tools/
    index.ts                     # 强化 createReadOnlyTools

extensions/defaults/subagent/    # 替换原 team/
  index.ts
  subagent-parser.ts
  subagent-runner.ts
  subagent-renderer.ts
```

### 阶段 B 完成后

```text
core/
  sub-agent/                     # 同上，可能新增 subprocess backend
  workspace/
    worktree-manager.ts          # 增强 git worktree 支持

extensions/defaults/subagent/    # 维持
extensions/defaults/team/        # 新（与阶段 A 的 subagent 并存）
  index.ts
  team-parser.ts
  team-renderer.ts
  team-runtime.ts
  team-state-store.ts
  team-mailbox.ts
  team-permissions.ts
```

阶段 B 落地后，`/subagent` 与 `/team` 是两个独立产品：前者适合一次性多 worker 任务，后者适合长期协作。它们共享 `core/sub-agent/` 与 `core/workspace/` 的基础设施。

---

## 六、与旧方案的差异

| 维度 | 旧方案 | 本方案 |
|---|---|---|
| 概念 | 把 SubAgent 与 AgentTeam 混叫 team | 明确区分，分两阶段交付 |
| 命令 | `/agent team ...`（带空格） | `/subagent` / `/team`，冒号分隔子命令 |
| core 边界 | 把 team 编排逻辑下沉到 `core/team/` | core 只下沉 SubAgent runtime + workspace；team 编排留扩展 |
| 隔离时机 | P5（最后阶段才做） | 阶段 A 就交付最小隔离（临时工作区） |
| stop 修复 | P0 提到，但未明确 SDK 改动 | 阶段 A 第一项就是 SDK 的 `AbortSignal` 透传 |
| Permission vs Mailbox 顺序 | mailbox 先 | permission 先冻结，再做 mailbox |
| Teammate 持久化 vs SessionManager | 未明确 | 明确 team-state-store 自管，不复用 SessionManager |

---

## 七、实施顺序速查

### 阶段 A（必做）

1. `core/runtime/sdk.ts` 加 `AbortSignal` 透传 + 单测 ✅
2. `core/sub-agent/` 接口与 in-process backend ✅
3. `core/workspace/` 临时工作区 ✅
4. `core/tools/` 强化 read-only 边界 + bash 沙箱 ✅
5. 删除 `extensions/defaults/team/`，新建 `extensions/defaults/subagent/` 🚧 (subagent 已完成，team 仍保留待删除)
6. 砍掉 `auto` 模式自决定写代码的分支 ✅
7. 验收 M-A 🚧 (核心功能完成，部分功能待完善)

### 阶段 B（可独立决策）

1. 冻结 teammate 持久化归属（team-state-store 自管）
2. teammate identity / runtime / state-store
3. permission model（先于 mailbox 完整化）
4. mailbox 协议
5. 完整 worktree 集成
6. subprocess backend
7. 观察 / 调试 / 测试
8. 验收 M-B

---

## 八、阶段 A 当前实现状态 (2026-04-07)

### ✅ 已完成

| 功能 | 文件 | 说明 |
|------|------|------|
| AbortSignal 透传 | `core/runtime/sdk.ts`, `core/runtime/agent-session.ts` | `createAgentSession()` 支持外部 signal |
| SubAgent Runtime | `core/sub-agent/sub-agent-types.ts`, `sub-agent-backend.ts`, `sub-agent-runtime.ts` | 完整的 SubAgentHandle/SubAgentSpec 接口 |
| Worktree Manager | `core/workspace/worktree-manager.ts` | 临时工作区和 git worktree 管理 |
| Bash 沙箱 Hook | `core/tools/bash.ts` | `createSandboxHook()` 阻止写操作 |
| SubAgent 扩展 | `extensions/defaults/subagent/` | `/subagent` 命令系列已可用 |
| 移除 auto 写权限 | `extensions/defaults/team/index.ts` | `auto` 模式不再自动授予写权限 |

### 🚧 部分完成 / 待优化

| 功能 | 状态 | 说明 |
|------|------|------|
| `/subagent` 命令 | 🚧 | 基础功能可用，缺少命令补全提示 |
| 消息渲染器 | ❌ | 未注册 `registerMessageRenderer` |
| `--write` 模式 | 🚧 | 命令解析支持，实际效果未验证 |
| 临时工作区集成 | ❌ | `WorktreeManager` 未集成到 runner |
| 超时机制 | ❌ | `timeoutMs` 参数未使用 |
| 图片支持 | ❌ | `images` 参数未传递 |
| team 扩展删除 | ❌ | 仍保留，未删除旧 team 扩展 |

### ❌ 未实现

| 功能 | 说明 |
|------|------|
| `/agent team` 删除 | 旧命令仍可用，需确认迁移 |
| diff 回写确认 | implementation 结果需用户确认才能写回主工作区 |
| lint 检查 | spawn 调用点未验证 read-only 模式 |
| 单元测试 | `AbortSignal` 单测未编写 |

---

**Covenant**: 阶段 A 完成 ≠ 拥有 AgentTeam。任何宣传"team"能力的文档、UI、命令必须等到阶段 B 验收通过后才能上线。
