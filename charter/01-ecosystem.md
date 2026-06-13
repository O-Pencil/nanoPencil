# §1 生态全景

> 10+ 项目的完整拓扑、架构层次、数据流

<!--
[WHO]  Catui 生态全部项目的全景视图
[FROM] PROJECT_OVERVIEW.md + catui-platform-charter.md §2
[TO]   02-boundaries, 03-relations, 各项目 README
[HERE] charter/01-ecosystem.md — 全景总览
-->

---

## 1.1 项目空间结构

```
D:\Projects\Catui\
├── Catui/                        # 本体心智核芯
├── Catui-Agent-Gateway/              # PAAS 网关服务
├── O-Mesh/                            # 多 Agent 编排引擎
├── Catui-Evaluate/                   # Agent 评估框架
├── Asgard-platform/                   # 基础设施/平台层
│   ├── packages/api (Asgard-api)      # FastAPI 后端
│   └── packages/web (Asgard-web)      # React 前端
├── catui-editor/                 # 创作表现层（编辑器）
├── Catui-Eidolon/                    # 浏览器分身（Chrome/Edge MV3 插件）
├── Catui-Game/                       # 社会博弈表现层
├── Catui-Lesson/                     # 知识习得表现层
├── Catui-Terminal/                   # 具身环境/终端
├── Catui-Playground/                 # (规划中) 在线实验场
└── Catui-Eidolon/                    # 浏览器渗透层
```

## 1.2 Git 仓库远端

| 仓库 | GitHub 远端 | 默认分支 | 备注 |
|------|------------|---------|------|
| **Catui** | `O-Catui/Catui` | `main` | remote 名为 `github` |
| **Catui-Agent-Gateway** | `O-Catui/Catui-Agent-Gateway` | `main` | — |
| **O-Mesh** | `O-Catui/O-Mesh` | `main` | — |
| **Catui-Evaluate** | `O-Catui/Catui-Evaluate` | `main` | — |
| **catui-editor** | `O-Catui/catui-editor` | `dev` | 默认分支为 `dev` |
| **Asgard-platform** | `O-Catui/Asgard-platform` | `main` | 含子模块 |
| **Asgard-api** | `O-Catui/Asgard-api` | `main` | Asgard 子模块 |
| **Asgard-web** | `O-Catui/Asgard-web` | `main` | Asgard 子模块 |
| **Catui-Eidolon** | `O-Catui/Catui-Eidolon` | `main` | Chrome/Edge MV3 |
| **Catui-Game** | `O-Catui/Catui-Game` | `main` | — |
| **Catui-Lesson** | `O-Catui/Catui-Lesson` | `main` | — |
| **Catui-Terminal** | `O-Catui/Catui-Terminal` | `main` | 有 dependabot PR |

所有仓库统一归属于 GitHub 组织 **[O-Catui](https://github.com/O-Catui)**。

## 1.3 架构层次模型

```
┌─────────────────────────────────────────────────────────────────┐
│                      用户平台层 (Platform)                      │
│              Asgard-platform (用户入口/Agent市场)                │
├─────────────────────────────────────────────────────────────────┤
│                      渗透层 (Infiltration)                      │
│              Catui-Eidolon (浏览器分身插件)                     │
├─────────────────────────────────────────────────────────────────┤
│                      表现层 (Expression)                        │
│   catui-editor    Catui-Game    Catui-Lesson            │
│   (创作表现)            (博弈表现)      (知识习得)               │
├─────────────────────────────────────────────────────────────────┤
│                      网关层 (Gateway)                           │
│              Catui-Agent-Gateway (HTTP + SSE)                  │
├─────────────────────────────────────────────────────────────────┤
│                      编排层 (Orchestration)                     │
│                     O-Mesh (多 Agent 编排)                      │
├─────────────────────────────────────────────────────────────────┤
│                      本体层 (Ontology)                          │
│                     Catui (心智核芯)                       │
│         NanoSoul (个性) + NanoMem (记忆) + AI Core              │
├─────────────────────────────────────────────────────────────────┤
│                      具身层 (Embodiment)                        │
│              Catui-Terminal (物理世界操作能力)                  │
├─────────────────────────────────────────────────────────────────┤
│                      评估层 (Evaluation)                        │
│              Catui-Evaluate (全链路自省与反馈)                  │
└─────────────────────────────────────────────────────────────────┘
```

## 1.4 调用链拓扑

```
                                              ┌─────────────────────────────────┐
   Catui CLI (本地)  ─── ACP ───────────►│    catui-agent 引擎 (in-proc)    │
                                              └─────────────────────────────────┘

   catui-editor (本地 ACP 模式)  ── ACP ──►  catui-agent CLI 子进程

   catui-editor (Remote HTTP 模式)  ┐
                                          │
   Catui CLI (远程模式)              ├── HTTP+SSE + API Key ──► Catui-Agent-Gateway
                                          │                          │
   第三方 OpenAI 客户端                    ┘                          ▼
                                                              ┌─────────────────────┐
                                                              │ CatuiAgent 实例    │
                                                              │  = catui-agent      │
                                                              │  + Soul + Memory    │
                                                              │  + Model + Personal.│
                                                              └─────────────────────┘
                                                              (Gateway 进程内多实例)

   Asgard 用户  ──── HTTP ──►  Asgard Platform  ── HTTP 代理 ──►  Catui-Agent-Gateway
                                  │
                                  └── 创建 CatuiAgent / 用量回写 / 计费

   钉钉 / 微信 / 飞书事件  ──► Catui-Agent-Gateway 内 Channel 子模块  ──► CatuiAgent

   用户浏览器任意页面  ────►  Catui-Eidolon Side Panel
                               ├── 本地模式: Native Messaging → Catui
                               └── 云端模式: OpenAI 兼容 API → Gateway

   O-Mesh Orchestrator  ────►  调度多个 Catui 实例  ──►  Blackboard 横向通信

   Catui-Evaluate  ────►  运行评估测试集  ──►  生成能力报告  ──►  反馈优化 Catui
```

## 1.5 核心数据流

```
用户意图
    ↓
┌─────────────────────────────────────────────────────┐
│                  Asgard-platform                     │
│         (Agent Marketplace / Chat / Console)        │
└─────────────────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────┐
│          Catui-Eidolon              │
│     (浏览器渗透：任意网页中)          │
└──────────────────────────────────────┘
    ↓
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  表现层      │ ←→ │  网关层      │ ←→ │  第三方应用  │
│ (Editor/Game)│    │  (Gateway)  │    │             │
└─────────────┘    └─────────────┘    └─────────────┘
    ↓
┌─────────────┐
│  编排层      │ ←→ O-Mesh Orchestrator
│  (O-Mesh)   │ ←→ Blackboard 横向通信
└─────────────┘
    ↓
┌─────────────┐    ┌─────────────┐
│  本体层      │ ←→ │  具身层      │
│ (Catui)│    │ (Terminal)  │
│ NanoSoul    │    │ 文件/Git/Shell│
│ NanoMem     │    └─────────────┘
└─────────────┘
    ↓
┌─────────────┐
│  评估层      │ → 反馈优化 → 本体层
│ (Evaluate)  │
└─────────────┘
```
