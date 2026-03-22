# MCP (Model Context Protocol) 支持

## 概述

NanoPencil 现在支持 MCP (Model Context Protocol)，允许 AI 助手调用外部 MCP 服务器提供的工具。

## 什么是 MCP？

MCP 是一个开放协议，让 AI 应用能够：
- 调用外部工具（如文件系统、GitHub、数据库等）
- 访问实时数据和资源
- 执行复杂的操作

更多信息: https://modelcontextprotocol.io

## 配置 MCP 服务器

### 配置文件位置

MCP 配置文件位于: `~/.nanopencil/agent/mcp.json`

### 默认配置

NanoPencil 预配置了几个常用的 MCP 服务器：

```json
{
  "mcpServers": [
    {
      "id": "filesystem",
      "name": "Filesystem",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "C:\\Users\\Windows11"],
      "enabled": true
    },
    {
      "id": "github",
      "name": "GitHub",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "enabled": false
    },
    {
      "id": "brave-search",
      "name": "Brave Search",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "env": {
        "BRAVE_API_KEY": ""
      },
      "enabled": false
    }
  ]
}
```

### 启用 MCP

**MCP 默认已启用**，无需额外配置。免费工具（Filesystem、Fetch、Puppeteer、SQLite、Git）会自动加载。

如需禁用 MCP，使用 `--disable-mcp` 参数：

```bash
nanopencil --disable-mcp
```

### 可用的 MCP 服务器

#### 1. Filesystem (文件系统)
- **ID**: `filesystem`
- **功能**: 读取、写入、搜索文件系统
- **工具**: `read_file`, `write_file`, `create_directory`, `list_directory`, `search_files`
- **启用**: 默认启用

示例:
```
你: 使用 filesystem 工具读取 README.md 的内容
AI: [调用 filesystem/read_file 工具]
```

#### 2. GitHub
- **ID**: `github`
- **功能**: 访问 GitHub 仓库、issues、PRs
- **工具**: `create_or_update_file`, `create_pull_request`, `push_files`
- **启用**: 需手动启用（需要 GITHUB_TOKEN）

配置:
```json
{
  "id": "github",
  "name": "GitHub",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-github"],
  "env": {
    "GITHUB_TOKEN": "your_github_token"
  },
  "enabled": true
}
```

#### 3. Brave Search
- **ID**: `brave-search`
- **功能**: 网页搜索
- **工具**: `brave_web_search`
- **启用**: 需手动启用（需要 BRAVE_API_KEY）

## 命令

### /mcp 命令

管理 MCP 服务器的命令：

```bash
/mcp                    # 列出所有 MCP 服务器
/mcp enable <id>         # 启用指定的服务器
/mcp disable <id>        # 禁用指定的服务器
/mcp list-tools         # 列出所有可用的 MCP 工具
```

## 工具调用

MCP 工具通过以下格式调用：

```
<server_id>/<tool_name>
```

例如:
- `filesystem/read_file`
- `github/create_or_update_file`
- `brave-search/brave_web_search`

## 自定义 MCP 服务器

你可以添加自己的 MCP 服务器：

### 1. 编辑配置文件

```bash
# Windows
notepad %USERPROFILE%\.nanopencil\agent\mcp.json

# Linux/Mac
nano ~/.nanopencil/agent/mcp.json
```

### 2. 添加服务器配置

```json
{
  "mcpServers": [
    {
      "id": "my-server",
      "name": "My Custom Server",
      "command": "node",
      "args": ["path/to/server.js"],
      "enabled": true
    }
  ]
}
```

### 3. 重启 NanoPencil

```bash
nanopencil --enable-mcp
```

## 环境变量

某些 MCP 服务器需要环境变量：

```bash
# GitHub
GITHUB_TOKEN=ghp_xxxxx

# Brave Search
BRAVE_API_KEY=your_brave_api_key

# 自定义服务器
MY_API_KEY=your_key
```

在配置文件中设置：

```json
{
  "env": {
    "GITHUB_TOKEN": "ghp_xxxxx",
    "BRAVE_API_KEY": "your_key"
  }
}
```

## 故障排除

### MCP 工具不可用

1. 确认已启用 MCP: `--enable-mcp`
2. 检查服务器是否启用: `/mcp`
3. 查看服务器状态

### 服务器启动失败

1. 检查命令是否正确安装
2. 检查参数是否正确
3. 查看错误日志

### 工具调用失败

1. 确认服务器已启用
2. 检查所需的环境变量是否设置
3. 确认服务器正在运行

## 示例

### 示例 1: 使用 Filesystem 工具

```
你: 使用 filesystem 工具读取当前目录的所有文件

AI: 我会使用 filesystem/list_directory 工具来列出当前目录的文件
[调用 filesystem/list_directory]
```

### 示例 2: 使用 GitHub 工具

```
你: 创建一个 GitHub issue 来报告 bug

AI: 我会使用 github 工具来创建 issue
[调用 github/create_issue]
```

### 示例 3: 使用搜索工具

```
你: 搜索 "TypeScript 最新特性"

AI: 我会使用 brave-search 工具来搜索
[调用 brave-search/brave_web_search]
```

## 相关文档

- [MCP 官方文档](https://modelcontextprotocol.io)
- [MCP 服务器列表](https://github.com/modelcontextprotocol/servers)
- NanoPencil 工具系统文档

## 注意事项

1. **安全性**: MCP 工具可以访问文件系统和外部服务，请谨慎启用
2. **性能**: MCP 服务器启动需要时间，可能影响启动速度
3. **兼容性**: 并非所有 MCP 服务器都经过测试
4. **网络**: 某些 MCP 服务器需要网络连接
