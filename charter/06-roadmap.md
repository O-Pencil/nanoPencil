# §6 路线图

> 阶段历史、当前状态、跨项目工作线进度

<!--
[WHO]  生态演进路线与里程碑
[FROM] catui-platform-charter.md §6-§7
[TO]   各项目开发计划
[HERE] charter/06-roadmap.md — 路线图
-->

---

## 6.1 阶段总览

| 阶段 | 主题 | 主要项目 | 状态 |
|------|------|----------|------|
| 一 | 本地 ACP 接入 | editor + catui-agent | ✅ 已完成 |
| 二 | Agent 服务化原型验证（Rust PCP Server） | editor + catui-agent | ✅ 已完成 |
| 三 | Gateway 独立 + Asgard 集成 + editor 三模 | 4 核心项目 | ✅ 已完成（2026-05） |
| 3.5 | Channel 阶段一 + Multi-Catui 隔离 | Gateway + 运维 | ✅ 已完成（2026-05） |
| 四 | 平台化与多租户 | 全项目 | 🟡 **当前位置** |
| 五 | 生态化与社会化进化 | 全项目 | ⚪ 规划中 |

## 6.2 阶段详述

### 阶段一：本地 ACP 接入 ✅
- Editor 引入 `agent-client-protocol` crate，实现 ACP Client
- 接入 `catui-agent --acp` 作为外部 Agent
- 前端事件模型适配，流式渲染、工具调用、权限确认可用

### 阶段二：Rust 原型验证 ✅
- 定义 PCP v1（WebSocket 内部协议）
- Editor 母仓构建 Rust 原型 `src/apps/server/`
- **关键判断**：原型证明"Agent 在服务端、工具在客户端"架构可行，但 Rust Server 不作为生态主线——交给 Catui-Agent-Gateway（Node.js + Hono）

### 阶段三：Gateway 独立 + Asgard 集成 ✅
- **Gateway**：独立仓库，v0.1 API 全集，Docker 镜像，Multi-Catui 隔离
- **Asgard**：CatuiAgentBackend service，CatuiAgent CRUD + Gateway sync + usage logging
- **Editor**：HttpChatProvider 落地，三模路由（local/service/remote-http）
- **catui-agent**：以 SDK 形态被 Gateway import

### 阶段 3.5：Channel + Multi-Catui ✅
- Gateway 孵化 Channel 适配器（钉钉 Stream / WeChat / Feishu）
- Multi-Catui 架构：`~/.catui/<id>/` 独立目录
- Channel 长期归属独立仓库 `catui-channel-gateway`，当前在 Gateway 内孵化

### 阶段四：平台化与多租户 🟡
六条工作线（A–F），详见下文 §6.3。

## 6.3 阶段四工作线

| 线 | 主题 | 状态 | 主要参与方 |
|---|------|------|-----------|
| **A** | 工具回传协议（Gateway v0.2） | 🟡 进行中 | Gateway + Catui + Editor |
| **B** | 计费与用量闭环 | ⚪ 未启 | Asgard 主导 |
| **C** | 容器隔离与编排 | ⚪ 未启 | Asgard + 运维 |
| **D** | Soul/Memory 配置中心 UI | ⚪ 未启 | Asgard + Gateway |
| **E** | Channel Gateway 拆仓 | ⚪ 未启 | Gateway → 新仓 |
| **F** | Rust 高性能层（可选） | ⚪ 未启 | Gateway 重构 |

### A 线：工具回传（Gateway v0.2）🟡

**目标**：让远程 CatuiAgent 能调用 editor 本机的工具（read_file / write_file / bash / grep 等）。

**跨仓里程碑表**：

| 仓库 | 里程碑 | 状态 |
|------|--------|------|
| Gateway | M-tools-1（线协议 + 关联表） | ✅ 已完成 |
| Catui | N-tools-1（类型 + RemoteToolSource 骨架） | ⏳ 待启动 |
| Catui | N-tools-2（SDK remoteTools 接入） | ⏳ 待 N-tools-1 |
| Catui | N-tools-3（真实 agent-loop e2e） | ⏳ 待 N-tools-2 |
| Gateway | M-tools-2（CatuiEngineAdapter 绑定） | ⏳ 跨仓阻塞：依赖 N-tools-2 |
| Gateway | M-tools-3（lifecycle / 错误码硬化） | ⏳ 待 M-tools-2 |
| Editor | P1 polish（auth + agent-not-visible UI） | ⏳ 待 Gateway 稳定 |
| Editor | 本机工具注册表 + SSE 处理 | ⏳ 待 M-tools-3 |

## 6.4 战略原则

1. **本体唯一性**：所有进化反馈最终沉淀至 Catui 核心参数
2. **API 优先**：对外坚持 HTTP 协议，屏蔽内部复杂性
3. **社会化进化**：Agent 在博弈场景中碰撞，冲突数据作为进化燃料
4. **评估驱动**：通过 Catui-Evaluate 建立量化反馈闭环
5. **宿主边界清晰**：具体宿主必须拥有自己的权限与执行边界
6. **Harness 工具化**：Browser Harness 是可插拔工具，不上升为产品宿主
