# §8 各仓文档指针

> Charter 不复制实施细节，只提供跳转。各项目本地 docs/ 目录结构一览。

<!--
[WHO]  各项目文档的导航索引
[FROM] catui-platform-charter.md §9 + 各项目 docs/ 目录扫描
[TO]   各项目 README
[HERE] charter/08-pointers.md — 文档指针
-->

---

## 8.1 Catui

**GitHub**：[O-Catui/Catui](https://github.com/O-Catui/Catui)

| 主题 | 文档 |
|------|------|
| 项目导航 | `AGENTS.md` |
| 产品人格宪章 | `.CATUI.md` |
| 多 Catui 文件系统设计 | `docs/multi-agent-fs-design.md` |
| 远程工具回传 SDK 接口 | `docs/remote-tool-register-design.md` |
| SDK 使用指南 | `docs/SDK.md` |
| SDK 测试 | `docs/SDK-TESTING.md` |
| ACP 协议集成 | `docs/ACP协议集成开发文档.md` |
| MCP 集成指南 | `docs/MCP集成指南.md` |
| MCP 快速参考 | `docs/MCP快速参考.md` |
| 记忆系统 | `docs/mem-core技术文档.md` |
| 评估框架 | `docs/eval/` |
| 启动性能优化 | `docs/startup-performance-optimization.md` |
| 本生态宪章 | `charter/` |

## 8.2 Catui-Agent-Gateway

**GitHub**：[O-Catui/Catui-Agent-Gateway](https://github.com/O-Catui/Catui-Agent-Gateway)

| 主题 | 文档 |
|------|------|
| 产品边界 / 双部署形态 | `docs/00-product-boundary.md` |
| 开发计划 / 里程碑 | `docs/01-development-plan.md` |
| OpenAI 兼容 API 契约 | `docs/02-api-contract.md` |
| EngineAdapter 架构 | `docs/03-adapter-architecture.md` |
| Asgard / Editor 集成 | `docs/04-asgard-editor-integration.md` + `docs/10-editor-integration-guide.md` |
| Caller 运行时 | `docs/05-caller-runtime.md` |
| 术语表（Gateway 内部） | `docs/06-glossary.md` |
| catui-agent 集成 | `docs/07-m7-catui-agent-integration.md` |
| Channel 集成 | `docs/13-channel-integration.md` + `docs/14-multi-catui-architecture.md` |
| Multi-Catui 行动手册 | `docs/16-catui-storage-layout.md` |
| **工具回传协议 v0.2** | `docs/18-tool-callback-protocol-v0.2.md` |

## 8.3 Asgard-platform

**GitHub**：[O-Catui/Asgard-platform](https://github.com/O-Catui/Asgard-platform)

| 主题 | 文档 |
|------|------|
| 平台概述 | `README.md` |
| 后端架构审查 | `packages/api/ARCHITECTURE_REVIEW.md`（Asgard-api 子模块） |
| 后端开发计划 | `packages/api/DEVELOPMENT_PLAN.md` |
| 前端 PRD | `packages/web/PRD.md`（Asgard-web 子模块） |

### 子模块

| 子模块 | GitHub | 说明 |
|--------|--------|------|
| Asgard-api | [O-Catui/Asgard-api](https://github.com/O-Catui/Asgard-api) | FastAPI 后端 |
| Asgard-web | [O-Catui/Asgard-web](https://github.com/O-Catui/Asgard-web) | React 前端 |

## 8.4 catui-editor

**GitHub**：[O-Catui/catui-editor](https://github.com/O-Catui/catui-editor)

| 主题 | 文档 |
|------|------|
| 应用层路线 | `docs/technical-proposals/catui-platform-roadmap.md` |
| Remote HTTP Provider 设计 | `docs/technical-proposals/remote-http-chat-provider-design.md` |
| 写作 Agent 编排 | `docs/technical-proposals/writing-agent-orchestration-seams.md` |
| 平台预算 API 需求 | `docs/technical-proposals/platform-budget-api.md` |
| ACP 集成 | `docs/acp-integration-followups.md` |
| PCP 内部协议（legacy） | `docs/technical-proposals/catui-client-protocol.md` |

## 8.5 O-Mesh

**GitHub**：[O-Catui/O-Mesh](https://github.com/O-Catui/O-Mesh)

| 主题 | 文档 |
|------|------|
| 产品定义 | `PRD.md` |
| API 文档 | `DOCS/API.md` |
| 开发指南 | `DOCS/DEVELOPMENT.md` |
| Agent 协调机制 | `DOCS/AGENT-COORDINATION.md` |
| 事件系统 | `DOCS/EVENTS.md` |
| 建议系统 | `DOCS/SUGGEST.md` |

## 8.6 Catui-Evaluate

**GitHub**：[O-Catui/Catui-Evaluate](https://github.com/O-Catui/Catui-Evaluate)

| 主题 | 文档 |
|------|------|
| 评估框架概述 | `README.md` |
| 基准使用 | `BENCHMARK_USAGE.md` |
| 评估指标文档 | `docs/guides/` + `docs/integrations/` |

## 8.7 Catui-Eidolon

**GitHub**：[O-Catui/Catui-Eidolon](https://github.com/O-Catui/Catui-Eidolon)

| 主题 | 文档 |
|------|------|
| 安装指南 | `INSTALL.md` |
| Catui + Harness 架构 | `docs/eidolon-catui-harness-architecture.md` |
| SDK 集成报告 | `docs/catui-sdk-integration-report.md` |
| 主题系统 | `docs/theme/` |

## 8.8 Catui-Game

**GitHub**：[O-Catui/Catui-Game](https://github.com/O-Catui/Catui-Game)

| 子项目 | 说明 |
|--------|------|
| `novel-studio/` | 小说创作工作台 |
| `Philosophical-Studio/` | 哲学思辨工作台 |
| `werewolf/` | 狼人杀博弈游戏 |

## 8.9 Catui-Lesson

**GitHub**：[O-Catui/Catui-Lesson](https://github.com/O-Catui/Catui-Lesson)

基于 Next.js 的知识学习平台，详情见仓库 README。

## 8.10 Catui-Terminal

**GitHub**：[O-Catui/Catui-Terminal](https://github.com/O-Catui/Catui-Terminal)

基于 Go + Electron 的终端应用，详情见仓库 README。

---

## 本地链接

本地开发时，`charter/links/` 目录包含指向各兄弟项目的 junction 链接（已 gitignored）：

```bash
# 创建本地链接（Windows）
mkdir charter\links
mklink /J charter\links\gateway   ..\..\Catui-Agent-Gateway
mklink /J charter\links\asgard    ..\..\Asgard-platform
mklink /J charter\links\editor    ..\..\catui-editor
mklink /J charter\links\o-mesh    ..\..\O-Mesh
mklink /J charter\links\evaluate  ..\..\Catui-Evaluate
mklink /J charter\links\eidolon   ..\..\Catui-Eidolon
mklink /J charter\links\game      ..\..\Catui-Game
mklink /J charter\links\lesson    ..\..\Catui-Lesson
mklink /J charter\links\terminal  ..\..\Catui-Terminal
```
