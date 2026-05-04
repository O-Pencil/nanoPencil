# nanoPencil 多 Agent 本地文件系统设计方案

## 1. 设计背景与哲学

随着 nanoPencil 从单兵 AI 助手演进为支持 **Agent Teams** 的协作平台，原有的单路径存储结构（`~/.nanopencil/agent/`）已无法满足“多重人格”、“分布式记忆”及“跨 Agent 协作”的需求。

本方案的核心哲学是 **“心智（Mind）与具身（Embodiment）的解耦”**：
- **Agent (心智)**：拥有独立的灵魂、记忆、偏好和隐私会话。
- **Workspace (具身)**：Agent 工作的物理场所，包含项目事实、黑板协作区及共享状态。

---

## 2. 目录结构规范

本地根路径统一为：`~/.nanopencil/`

```markdown
~/.nanopencil/
│
├── agents/                              # 【个体心智区】存储所有独立 Agent 实例
│   ├── [Agent_ID]/                      # 每一个 Agent 都是一个独立的“槽位”
│   │   ├── soul/                        # 灵魂演化层 (template.json + evolution.json)
│   │   ├── memory/                      # 长期记忆：Agent 个人的主观经验与偏好
│   │   ├── sessions/                    # 对话历史：按项目隔离的会话记录
│   │   └── config/                      # Agent 特定配置：auth.json, settings.json
│   └── default/                         # 兼容槽位：支持单用户 CLI 模式的无感迁移
│
├── workspaces/                          # 【项目事实区】Agent Teams 协作的共享空间
│   └── [Project_ID]/                    # 基于项目唯一标识的共享区
│       ├── .pencil_context              # 项目物理快照 (File Tree, Git, LSP 信号)
│       └── shared_mem.db                # O-Mesh 黑板模式产生的项目级“客观事实”
│
├── gateway/                             # 【网关管理区】PAAS 服务的本地调度中枢
│   ├── registry/                        # AgentRegistry：记录本地所有实例的索引
│   └── global_config/                   # 全局配置（如通用的 API Keys，供继承）
│
├── channels/                            # 【感官接口区】外部集成插件的持久化数据
└── evals/                               # 【自省记录区】Pencil-Evaluate 产生的性能 Trace
```

---

## 3. 文件管理核心设计

### 3.1 心智隔离 (Mind Isolation)
- **独立生命周期**：每个 `Agent_ID` 下的目录是自包含的。这意味着“韩寒” Agent 的灵魂漂移不会影响“程序员” Agent 的逻辑判断。
- **分层人格**：`soul/template.json` 定义了 Agent 的“天性”（由 Asgard 云端定义），而 `evolution.json` 记录了它在本地环境中学习到的“习性”。

### 3.2 具身共享 (Embodiment Sharing)
- **统一事实**：通过 `workspaces/[Project_ID]`，不同 Agent 能够看到一致的代码库状态。
- **项目级黑板**：`shared_mem.db` 存储项目特定的常识（如：本项目禁止使用 Promise.then，必须使用 async/await），这不仅是一个存储，更是 Agent 间的共识基础。

---

## 4. 与 Agent Team 的结合：从中心化到分布式 (O-Mesh)

在多 Agent 结构下，团队协作逻辑从“主从模式”演进为“去中心化协作模式”：

### 4.1 角色转变：主 Agent 变为调度网关 (Dispatcher)
- **旧模式**：主 Agent 拥有全部上下文，子 Agent 是临时工具。
- **新模式**：当前启动的 Agent（如 `default`）作为 **调度网关**，负责 TUI 交互和任务分发。它不再需要承载所有记忆，而是通过 `shared_mem.db` 协调各个专家 Agent。

### 4.2 协作逻辑：基于具身的黑板模式
- **目的驱动**：用户发布一个目标（Objective），Dispatcher 将其写入 `workspaces/[Project_ID]/shared_mem.db`。
- **自主认领**：拥有相关领域记忆的 Agent（如 `agents/han-han/`）自主从黑板认领任务。
- **通信去中心化**：Agent 之间通过共享 Workspace 的物理事实和黑板状态进行“异步通信”，而非依赖主 Agent 的传话。

### 4.3 记忆的长效性
- 每一个队友 Agent 都有自己的 `agents/[Agent_ID]` 目录。即使 Team 任务结束，该 Agent 在本次协作中获得的“主观经验”也会被保留，并在下一次被不同团队调用时生效。

---

## 5. 演进与迁移路径

1. **第一阶段 (Shadow Mode)**：引入新目录结构，但在代码中通过环境变量保留旧路径兼容性。
2. **第二阶段 (Migration Tool)**：提供 `/migrate` 命令，将旧数据重分布到 `agents/default/`。
3. **第三阶段 (Full PAAS)**：完全启用多 Agent 管理，支持 `nanopencil --agent <id>`。
4. **第四阶段 (O-Mesh Integration)**：
    - 将 `extensions/defaults/team/` 的存储逻辑全面接入 `agents/` 目录。
    - 废弃“传话筒”式通信，实现基于 `workspaces/` 和 `shared_mem.db` 的去中心化具身协作模式。
