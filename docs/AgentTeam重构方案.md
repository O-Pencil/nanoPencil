# nanoPencil Agent Team 重构方案

---

## 一、目标与背景

当前 nanoPencil 已经在最新 `main` 中提供 `/agent team` 能力，入口位于：

- `extensions/defaults/team/index.ts`
- `extensions/defaults/team/team-parser.ts`
- `extensions/defaults/team/team-controller.ts`

从产品目标看，`.PENCIL.md` 已经明确要求 Agent Team 应具备以下特征：

- isolated workers
- clear delegation boundaries
- concise summaries in the main thread
- durable run artifacts
- safe stopping and recovery behavior
- low context pollution in the main session

当前实现已经做到：

- 显式用户触发
- planner → research → implementation/review 的基础编排
- 报告产物输出
- UI 中显示 team 状态

但当前实现本质上仍是**一个扩展内部的批处理编排器**，还不是一个完整的 Team Runtime。

本方案的目标是把 `/agent team` 从“可用扩展”升级为“可靠的多智能体运行时”。

---

## 二、当前实现评估

### 2.1 已有优点

当前实现具备以下优点：

1. **触发边界清晰**
   - 只允许用户显式要求 Agent Team 时运行。
   - 代码位置：`extensions/defaults/team/index.ts`

2. **主线程污染较低**
   - team worker 的大部分原始输出不会直接塞回主会话。
   - 主线程主要接收 summary、status、report。

3. **有产物**
   - 会写入 `.nanopencil/team-runs/<run-id>.md`

4. **支持并行 research**
   - `researchWorkers` 通过 `Promise.all` 并行运行。

### 2.2 当前主要问题

#### 问题 A：不是真正隔离的 worker

当前 worker 都共享同一个 `cwd`，implementation worker 直接改当前工作区。

这意味着：

- worker 之间没有工作区隔离
- review worker 看到的是 implementation 已修改后的共享目录
- 多 implementation worker 无法安全扩展

#### 问题 B：只读 worker 不是硬只读

当前 research/review worker 仍持有 `bash` 工具。

这意味着：

- “只读”只是约定，不是硬约束
- worker 仍可通过 shell 修改文件、调用 git、写入临时文件

#### 问题 C：stop 语义不完整

当前 `TeamController.stop()` 主要中断 CLI worker 路径的 `AbortController`。

但 native worker 通过 `createAgentSession()` 直接在当前进程内运行，没有统一的细粒度中断控制，因此：

- `/agent team stop` 不一定能及时停止 native worker
- 停止后编排器可能继续推进后续阶段

#### 问题 D：worker 生命周期过短，缺少 teammate 概念

当前 worker 是“一次任务一条执行链”的临时对象：

- planner 跑完即销毁
- research worker 跑完即销毁
- implementation/review 也没有持续身份

这意味着当前更接近：

- multi-worker batch orchestration

而不是：

- persistent teammate runtime

#### 问题 E：状态模型不够强

当前状态主要依赖：

- `TeamController` 内存状态
- session 中的 `team_state` / `team_report`

这对于“单次运行”够用，但对于以下场景不足：

- teammate 持续驻留
- 中途中断后恢复
- 权限回传
- runtime 调试
- leader 与 worker 双向消息

#### 问题 F：权限模型缺失

当前 implementation worker 是否能写文件主要由传入工具集控制，没有 team 级权限协商机制。

缺少：

- leader 审批
- 动态路径授权
- mode 切换
- 统一的 permission request / response 通道

---

## 三、参考实现：`/root/workspace/free-code`

本地参考实现不是简单的“并行 worker”，而是更完整的 swarm / teammate runtime。

### 3.1 值得借鉴的设计

#### 1）teammate 是长期对象

参考实现中，teammate 有自己的任务状态、身份、消息历史、待处理消息队列：

- `src/tasks/InProcessTeammateTask/types.ts`

核心字段包括：

- `identity`
- `abortController`
- `currentWorkAbortController`
- `messages`
- `pendingUserMessages`
- `awaitingPlanApproval`
- `permissionMode`

这使得 teammate 不再是“一次性子进程”，而是“长期存在的团队成员”。

#### 2）双层 abort 语义

参考实现明确区分：

- `abortController`：终止整个 teammate
- `currentWorkAbortController`：只停止当前 turn

这对 UX 和 runtime 稳定性非常重要。

#### 3）team file 是权威团队状态源

参考实现在 team file 中记录：

- members
- worktreePath
- teamAllowedPaths
- leadAgentId
- mode / subscriptions

这让团队成为一个可恢复、可审计、可同步的实体，而不是一堆松散内存对象。

#### 4）mailbox 做 leader / teammate 通信

参考实现把这些操作统一成 mailbox 消息：

- permission_request
- permission_response
- shutdown
- mode change
- plan approval

这让系统天然支持：

- 恢复
- 调试
- 多 backend
- 异步 teammate

#### 5）可选 worktree 隔离

参考实现的 member 结构里已有 `worktreePath`，并有对应清理逻辑。

这是实现真正 `isolated workers` 的关键。

---

## 四、重构原则

### 原则 1：从“扩展逻辑”升级为“运行时能力”

`/agent team` 不应长期停留在 `extensions/defaults/team/index.ts` 这个单点文件中。

正确方向是：

- 扩展负责命令入口与 UI 适配
- Runtime 负责 team lifecycle、worker backend、状态管理、权限协商

### 原则 2：先修安全边界，再做能力扩展

优先级必须是：

1. 只读边界
2. stop / recovery
3. runtime state
4. teammate 持久化
5. worktree 隔离

而不是先加更多命令和更多角色。

### 原则 3：统一 worker 抽象

planner / research / implementation / review 都应该走统一 backend 接口。

不应存在：

- planner 永远 CLI
- worker 先 native 再 fallback CLI

这种行为不一致的路径。

### 原则 4：状态必须可恢复、可观察、可审计

最少要有：

- durable state store
- durable artifacts
- teammate identity
- phase transitions
- per-worker logs / transcript

---

## 五、按优先级排序的重构计划

---

### P0：修复当前实现的安全与中断问题

**目标**

让当前 `/agent team` 至少满足“不会误写、可以停、状态不乱”。

**改动**

1. research / review worker 不再持有通用 `bash`
   - 改为使用真正只读工具集合
   - 优先复用 `createReadOnlyTools()`

2. native worker 加入统一 abort 管理
   - `TeamController` 需要持有 native session 的 stop handle
   - `/agent team stop` 时统一中断

3. `orchestrateTeamRun()` 增加阶段边界检查
   - 每个阶段开始前和结束后检查 run 是否已被 stop / abort

4. `auto` 模式收紧
   - 默认倾向 `research_only`
   - 只有需求明确要求“修改/修复/实现”时才进入 implementation

**预期收益**

- 消除“研究 worker 实际可写”的风险
- 修复 stop 无法可靠生效的问题
- 避免 auto 模式意外写代码

**涉及模块**

- `extensions/defaults/team/index.ts`
- `extensions/defaults/team/team-controller.ts`
- `core/tools/index.ts`

---

### P1：把 Team Runtime 从扩展中拆出来

**目标**

把 Team 的生命周期与编排逻辑抽离为 core runtime。

**建议新增目录**

```text
core/team/
  team-runtime.ts
  team-runner.ts
  team-state-store.ts
  team-events.ts
  team-types.ts
  worker-factory.ts
```

**职责划分**

- `team-runtime.ts`
  - 对外暴露 team run / status / stop / restore

- `team-runner.ts`
  - 推进 planner / research / implementation / review 状态机

- `team-state-store.ts`
  - 负责持久化和恢复

- `worker-factory.ts`
  - 根据 role + backend 配置创建 worker

- 扩展层 `extensions/defaults/team/`
  - 只负责命令入口、帮助信息、message renderer、UI 绑定

**预期收益**

- 降低 `extensions/defaults/team/index.ts` 的复杂度
- 为后续 mailbox / multi-backend / permission mode 做准备

---

### P2：引入持久 teammate 模型

**目标**

让 worker 变成长期 teammate，而不是一次性批处理任务。

**建议新增概念**

- `TeammateIdentity`
- `TeammateState`
- `TeammateRuntimeHandle`

**建议状态字段**

- `agentId`
- `agentName`
- `teamName`
- `role`
- `mode`
- `status`
- `abortController`
- `currentWorkAbortController`
- `messages`
- `pendingUserMessages`
- `lastActiveAt`

**能力**

- leader 能查看 teammate 当前状态
- leader 能对 teammate 发送 follow-up
- status 命令能展示 team members，而不是只显示某次 run

**参考来源**

- `/root/workspace/free-code/src/tasks/InProcessTeammateTask/types.ts`

**预期收益**

- 系统从“pipeline”升级为“team runtime”
- 为后续视图切换、消息注入、可持续协作打基础

---

### P3：引入 mailbox / team event bus

**目标**

建立 leader 与 teammate 的标准通信通道。

**建议新增模块**

```text
core/team/mailbox/
  team-mailbox.ts
  mailbox-types.ts
  mailbox-store.ts
```

**建议消息类型**

- `task_request`
- `task_progress`
- `task_result`
- `permission_request`
- `permission_response`
- `shutdown_request`
- `shutdown_ack`
- `mode_change`
- `plan_approval_request`
- `plan_approval_response`

**用途**

- 替代现在大量的直接函数耦合
- 支持恢复、审计、多 backend

**参考来源**

- `/root/workspace/free-code/src/utils/swarm/permissionSync.ts`
- `/root/workspace/free-code/src/utils/teammateMailbox.ts`

**预期收益**

- team 行为更像系统协议，而不是内部回调堆叠

---

### P4：补上 Team 权限模型

**目标**

从“工具集约束”升级为“可审计的 team permission system”。

**建议能力**

1. teammate mode
   - `research`
   - `plan`
   - `execute`
   - `review`

2. implementation teammate 默认 plan mode
   - 先提出计划
   - leader 批准后再进入 execute

3. 动态路径授权
   - leader 可授予某个 teammate 对某些路径的 edit/write 权限

4. 高风险工具审批
   - 写文件
   - 危险 bash
   - git 变更操作

**建议新增模块**

```text
core/team/permissions/
  permission-model.ts
  permission-sync.ts
  allowed-paths.ts
```

**参考来源**

- `/root/workspace/free-code/src/utils/swarm/teamHelpers.ts`
- `/root/workspace/free-code/src/utils/swarm/permissionSync.ts`

**预期收益**

- 提升安全性
- 让多 implementation worker 变得可控

---

### P5：实现真正的 workspace / worktree 隔离

**目标**

满足产品目标中的 `isolated workers`。

**建议实现**

对于 implementation teammate：

- 默认创建独立 worktree 或临时工作目录
- teammate 在自己的工作区完成改动
- leader 最终只接收：
  - changed files
  - diff summary
  - artifact

review teammate 可选：

- 读取 implementation worktree
- 或读取合并后的 staged diff

**建议新增模块**

```text
core/team/workspace/
  worktree-manager.ts
  workspace-policy.ts
```

**参考来源**

- `/root/workspace/free-code/src/utils/swarm/teamHelpers.ts`

**预期收益**

- 多 implementation worker 可扩展
- review 语义更可信
- 主工作区更安全

---

### P6：统一 worker backend 抽象

**目标**

让 planner / teammate 不再依赖杂乱的 `native + CLI fallback` 逻辑。

**建议定义接口**

```ts
interface TeamWorkerBackend {
  spawn(spec: TeamWorkerSpec): Promise<TeamWorkerHandle>
  send(handle: TeamWorkerHandle, prompt: string): Promise<void>
  abortCurrent(handle: TeamWorkerHandle): Promise<void>
  terminate(handle: TeamWorkerHandle): Promise<void>
}
```

**建议 backend**

- `in-process`
- `subprocess`
- 未来可加 `acp`

**预期收益**

- 行为一致
- 容易测试
- 未来可支持远端 worker / IDE worker

---

### P7：补齐观察、调试、测试能力

**目标**

让 Agent Team 可维护、可调试、可回归验证。

**建议补充**

1. 每个 teammate 独立 transcript / log
2. UI 支持切换查看 teammate 状态
3. 报告结构标准化
4. Team Runtime 测试覆盖：
   - stop
   - recovery
   - mailbox
   - permission approval
   - worktree cleanup

**建议测试层级**

- 单元测试：parser / state machine / permission model
- 集成测试：planner + worker + mailbox
- 恢复测试：进程中断后 session 恢复

---

## 六、目标架构草图

```text
extensions/defaults/team/
  index.ts                # 只保留 /agent 命令入口 + UI 渲染
  team-parser.ts
  team-message-renderer.ts

core/team/
  team-runtime.ts         # 对外总入口
  team-runner.ts          # 阶段推进与状态机
  team-state-store.ts     # 持久化/恢复
  team-types.ts

  mailbox/
    team-mailbox.ts
    mailbox-types.ts
    mailbox-store.ts

  permissions/
    permission-model.ts
    permission-sync.ts
    allowed-paths.ts

  workspace/
    worktree-manager.ts
    workspace-policy.ts

  backends/
    in-process.ts
    subprocess.ts
    acp.ts                # 后续可选
```

---

## 七、与当前代码的映射关系

为了避免重构方案停留在抽象层，下面给出当前实现到目标架构的直接映射。

### 7.1 当前入口层

- `extensions/defaults/team/index.ts`
  - 当前同时承担：
    - `/agent` 命令注册
    - planner / worker prompt 组装
    - run orchestration
    - UI 同步
    - 报告写入
    - session 自定义状态持久化
  - 这是当前最需要拆分的文件

- `extensions/defaults/team/team-parser.ts`
  - 继续保留在扩展层
  - 负责 `/agent team ...` 子命令解析

- `extensions/defaults/team/team-controller.ts`
  - 当前只适合做轻量状态容器
  - 后续应拆成：
    - `core/team/team-runtime.ts`
    - `core/team/team-state-store.ts`
    - `core/team/team-events.ts`

### 7.2 当前 runtime 相关依赖

- `core/runtime/agent-session.ts`
  - 负责扩展命令分发
  - 不应承载 Team 业务逻辑
  - 只需继续作为 Team runtime 的宿主能力提供者

- `core/runtime/sdk.ts`
  - 后续 native teammate 创建可继续复用这里的 `createAgentSession()`
  - 但 Team runtime 需要把 teammate 创建逻辑统一封装到 `worker-factory.ts`

- `core/session/session-manager.ts`
  - 当前适合继续承载主 session 的持久化
  - 不适合直接承担 teammate mailbox 或 durable team state
  - Team 需要自己的 state store

- `core/tools/index.ts`
  - 当前已有只读工具工厂，可直接作为 P0 改造的切入点
  - Team runtime 后续仍应复用工具注册能力，但权限裁剪应前移到 Team 层

### 7.3 建议的拆分边界

#### 扩展层保留

- 命令入口
- help 文案
- interactive mode 下的 widget / renderer / status 展示

#### runtime 层新增

- 运行状态机
- teammate 注册表
- mailbox
- permission system
- workspace / worktree 管理
- backend 统一抽象

### 7.4 推荐迁移顺序

1. 先把 `index.ts` 中的 worker 启动逻辑提取到 `core/team/worker-factory.ts`
2. 再把 `orchestrateTeamRun()` 提取到 `core/team/team-runner.ts`
3. 再把 `TeamController` 状态拆到 `team-state-store.ts`
4. 最后逐步把 mailbox / permissions / workspace 接进来

这样做的原因是：

- 对现有命令入口侵入最小
- 可以先保持 `/agent team` 对外行为稳定
- 允许按阶段回归，而不是一次性大爆炸迁移

---

## 八、实施建议顺序

### 第一阶段（必须先做）

- P0：安全边界与 stop 修复
- P1：拆 Team Runtime

### 第二阶段（做成真正 runtime）

- P2：持久 teammate
- P3：mailbox / event bus

### 第三阶段（可控执行）

- P4：permission model
- P5：workspace / worktree isolation

### 第四阶段（工程化完善）

- P6：multi-backend
- P7：调试与测试

---

## 九、里程碑与验收标准

### 里程碑 M1：安全可用

验收标准：

- research / review worker 不再具备通用写能力
- `/agent team stop` 能稳定停止 native / subprocess worker
- stop 后不会继续进入 implementation / review

### 里程碑 M2：runtime 解耦

验收标准：

- `extensions/defaults/team/index.ts` 只保留入口和 UI
- 编排逻辑迁移到 `core/team/`
- Team 状态具备独立持久化接口

### 里程碑 M3：持久 teammate

验收标准：

- teammate 有稳定 identity
- status 可展示成员级别状态
- leader 可以向已有 teammate 下发 follow-up

### 里程碑 M4：可控执行

验收标准：

- 存在 permission request / response 通道
- implementation teammate 可以按路径授权
- plan / execute / review 模式切换可观测

### 里程碑 M5：真正隔离

验收标准：

- implementation teammate 默认不直接改主工作区
- worktree / workspace 清理可回收
- review 基于明确输入源工作，而不是共享脏工作区

---

## 十、最终判断

当前 nanoPencil 的 `/agent team` 已经证明了这个方向是对的：

- 用户愿意显式触发 Team
- planner + 并行 research + 报告 的体验已经成立

但它还停留在：

- “扩展层 orchestration”

而不是：

- “原生 Team Runtime”

与 `/root/workspace/free-code` 的参考实现相比，nanoPencil 下一步最关键的不是继续给 `/agent team` 添加更多 role，而是先补上下面四个基础能力：

1. teammate state
2. stop / recovery
3. mailbox / permission sync
4. worktree isolation

只有完成这四项，Agent Team 才能真正承担稳定的多智能体执行任务。
