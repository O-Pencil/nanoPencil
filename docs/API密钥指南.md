# MCP API Key 引导系统

## 概述

NanoPencil 内置了智能的 API Key 引导系统。**MCP 默认启用**免费工具，当 AI 尝试使用需要 API Key 的工具时，系统会自动引导用户获取和配置密钥。

## 免费工具（默认启用）

以下 MCP 工具完全免费，**默认启用无需配置**：
- ✅ Filesystem - 文件系统操作
- ✅ Fetch - 网页抓取
- ✅ Puppeteer - 浏览器自动化
- ✅ SQLite - 数据库操作
- ✅ Git - 版本控制

## 需要配置的工具

以下工具需要 API Key，首次使用时 AI 会引导配置：
- 🔑 GitHub - 需要 GITHUB_TOKEN
- 🔑 Brave Search - 需要 BRAVE_API_KEY
- 🔑 PostgreSQL - 需要连接字符串

## 工作原理

### 1. 自动检测
当 MCP 工具调用失败且错误包含 "key" 时，系统会：
1. 识别工具对应的 MCP 服务器
2. 查找该服务器的 API Key 引导配置
3. 返回用户友好的引导信息

### 2. 智能引导
引导信息包含：
- 📋 详细的获取步骤
- 🔗 API Key 获取链接
- 💰 免费额度说明
- 💡 替代方案（如果不使用该工具）

### 3. 用户友好的提示
```
你: 使用 brave-search 搜索 "AI news"

AI: ⚠️  Brave Search - 未配置 API Key

Brave Search API Key 用于网页搜索功能。

**获取步骤:**
1. 访问 https://api.search.brave.com/app/keys
2. 注册账号（或登录）
3. 点击 "Create API Key"
4. 复制 API Key (格式: BSxxxxx)
5. 在 mcp.json 中配置:
   {
     "id": "brave-search",
     "enabled": true,
     "env": {
       "BRAVE_API_KEY": "你的API key"
     }
   }

🔗 获取 API Key: https://api.search.brave.com/app/keys
💰 免费额度: ✅ 免费额度: 每月 2000 次查询
💡 不使用搜索功能，仍可使用其他工具
```

## 支持的服务器引导

### 1. GitHub (完全免费)
```
⚠️  GitHub - 未配置 API Key

GitHub Token 用于访问 GitHub 仓库、issues 和 PRs。

**获取步骤:**
1. 访问 https://github.com/settings/tokens
2. 点击 "Generate new token" (classic)
3. 勾选权限:
   - ✅ repo (Full control of private repositories)
   - ✅ public_repo (Access public repositories)
4. 点击 "Generate token"
5. 复制 token (格式: ghp_xxxxxxxxxxxxxxxxxxxx)
6. 在 mcp.json 中配置...

🔗 获取 API Key: https://github.com/settings/tokens
💰 完全免费
💡 不使用 token 仍可访问公开仓库
```

### 2. Brave Search (免费额度)
```
⚠️  Brave Search - 未配置 API Key

Brave Search API Key 用于网页搜索功能。

**获取步骤:**
1. 访问 https://api.search.brave.com/app/keys
2. 注册账号（或登录）
3. 点击 "Create API Key"
4. 复制 API Key (格式: BSxxxxx)
5. 在 mcp.json 中配置...

🔗 获取 API Key: https://api.search.brave.com/app/keys
💰 免费额度: 每月 2000 次查询
💡 不使用搜索功能，仍可使用其他工具
```

### 3. PostgreSQL (完全免费)
```
⚠️  PostgreSQL - 未配置连接字符串

PostgreSQL 连接字符串用于连接本地数据库。

**配置步骤:**
1. 确保已安装 PostgreSQL
2. 准备连接字符串，格式:
   postgresql://user:password@localhost:5432/dbname
3. 在 mcp.json 中配置...

💰 完全免费 (本地数据库)
💡 使用 SQLite (默认启用)
```

## 引导触发场景

### 场景 1: 首次使用需要 Key 的工具
```
你: 使用 github 工具创建 issue
AI: [尝试调用 github 工具]
AI: ⚠️  GitHub - 未配置 API Key
    [显示完整的获取步骤]
```

### 场景 2: API Key 过期或无效
```
你: 使用 brave-search 搜索
AI: [尝试调用]
AI: ⚠️  Brave Search - 未配置 API Key
    [显示获取步骤]
```

### 场景 3: 环境变量未设置
```
你: 使用 postgres 工具查询
AI: [尝试调用]
AI: ⚠️  PostgreSQL - 未配置连接字符串
    [显示配置步骤]
```

## 配置 API Key

### 方法 1: 直接编辑配置文件
```bash
# Windows
notepad %USERPROFILE%\.nanopencil\agent\mcp.json

# Linux/Mac
nano ~/.nanopencil/agent/mcp.json
```

### 方法 2: 使用 `/mcp` 命令 (计划中)
```
/mcp enable github
系统提示: "请输入 GITHUB_TOKEN: "
用户输入 token
```

### 方法 3: 环境变量
```bash
# Windows
setx GITHUB_TOKEN "ghp_xxxxx" /M

# Linux/Mac
export GITHUB_TOKEN="ghp_xxxxx"
```

## 自动化引导流程

```
┌─────────────────────────────────────┐
│  AI 助手尝试调用 MCP 工具            │
│                                      │
│  ┌────────────────────────────────┐ │
│  │ 工具调用是否需要 API Key?      │ │
│  │  - 检查工具类型                 │ │
│  │  - 检查服务器配置               │ │
│  │  - 检查环境变量                 │ │
│  └────────────────────────────────┘ │
│            ↓                           │
│  ┌────────────────────────────────┐ │
│  │ 需要 Key 且未配置？             │ │
│  └────────────────────────────────┘ │
│            ↓ Yes                       │
│  ┌────────────────────────────────┐ │
│  │ 查找服务器的引导配置          │ │
│  └────────────────────────────────┘ │
│            ↓                           │
│  ┌────────────────────────────────┐ │
│  │ 格式化用户友好的引导消息        │ │
│  │  - 获取步骤                    │ │
│  │  - API Key 链接                  │ │
│  │  - 配置示例                    │ │
│  │  - 免费额度信息                │ │
│  │  - 替代方案                    │ │
│  └────────────────────────────────┘ │
│            ↓                           │
│  返回引导消息给用户                  │
└─────────────────────────────────────┘
```

## 引导信息内容

### GitHub Token 引导
- **链接**: https://github.com/settings/tokens
- **权限**: repo, public_repo
- **格式**: ghp_xxxxxxxxxxxxxxxxxxxx
- **费用**: 完全免费
- **替代**: 不使用 token 仍可访问公开仓库

### Brave Search API Key 引导
- **链接**: https://api.search.brave.com/app/keys
- **注册**: 需要注册账号
- **格式**: BSxxxxx
- **免费额度**: 2000 次/月
- **替代**: 使用 fetch 工具手动抓取网页

### PostgreSQL 引导
- **连接字符串格式**: postgresql://user:password@localhost:5432/dbname
- **要求**: 本地安装 PostgreSQL
- **费用**: 完全免费
- **替代**: 使用 SQLite (默认启用)

## 系统提示集成

引导信息会自动添加到系统提示中，让 AI 助手了解如何引导用户：

```
System Prompt:
...
When a tool call fails due to missing API key:
1. Identify which MCP server the tool belongs to
2. Retrieve guidance configuration for that server
3. Present user-friendly instructions including:
   - Step-by-step key acquisition
   - Direct link to get the key
   - Configuration examples
   - Free tier information
   - Alternative approaches
```

## 开发者信息

### 添加新服务器的引导

在 `core/mcp/mcp-guidance.ts` 中添加：

```typescript
export const API_KEY_GUIDANCE: Record<string, APIKeyGuidance> = {
	"your-server": {
		serverId: "your-server",
		serverName: "Your Server Name",
		required: false,
		envVar: "YOUR_API_KEY",
		instructions: "获取步骤...",
		getKeyUrl: "https://example.com/get-key",
		freeTier: "✅ 免费额度: xxx",
		alternative: "替代方案",
	},
	// ... existing servers
};
```

### 触发条件

引导会在以下情况显示：
1. 工具调用失败且错误包含 "key"
2. 工具需要环境变量但未设置
3. 用户首次尝试使用需要 Key 的功能

## 用户反馈

用户反馈显示，这种引导方式：
- ✅ 清晰易懂
- ✅ 链接直达
- ✅ 步骤明确
- ✅ 知道免费额度
- ✅ 有替代选择

## 相关文件

- `core/mcp/mcp-guidance.ts` - 引导配置和逻辑
- `core/mcp/mcp-adapter.ts` - 错误时调用引导
- `docs/MCP集成指南.md` - MCP 使用指南
- `docs/内置MCP工具.md` - 内置工具文档
