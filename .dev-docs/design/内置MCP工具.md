# NanoPencil 内置 MCP 工具

## 概述

NanoPencil 内置了多个免费的 MCP (Model Context Protocol) 服务器，让 AI 助手可以：
- 🌐 读取网页内容
- 🔍 搜索网络
- 🤖 自动化浏览器操作
- 💾 操作 SQLite 数据库
- 📁 文件系统操作
- 🔄 Git 操作

## 默认启用的工具 (免费)

### 1. 📁 Filesystem (文件系统)
- **包名**: `@modelcontextprotocol/server-filesystem`
- **用途**: 读取、写入、搜索文件系统
- **工具**:
  - `read_file` - 读取文件内容
  - `write_file` - 写入文件
  - `create_directory` - 创建目录
  - `list_directory` - 列出目录
  - `search_files` - 搜索文件
- **权限**: 当前工作目录
- **费用**: 免费

示例:
```
你: 列出当前目录的 TypeScript 文件
AI: [调用 filesystem/search_files 工具，查找 *.ts 文件]
```

### 2. 🌐 Fetch (网页抓取)
- **包名**: `@modelcontextprotocol/server-fetch`
- **用途**: 读取网页内容、下载文件
- **工具**:
  - `fetch` - 获取网页内容
  - `fetchBytes` - 下载二进制文件
- **费用**: 免费

示例:
```
你: 读取 https://example.com 的内容
AI: [调用 fetch 工具获取网页]
```

### 3. 🤖 Puppeteer (浏览器自动化)
- **包名**: `@modelcontextprotocol/server-puppeteer`
- **用途**: 自动化浏览器操作、截图、PDF 生成
- **工具**:
  - `Puppeteer_navigateTo` - 导航到 URL
  - `Puppeteer_screenshot` - 截图
  - `Puppeteer_pdf` - 生成 PDF
  - `Puppeteer_click` - 点击元素
  - `Puppeteer_fill` - 填写表单
- **费用**: 免费 (本地浏览器)

示例:
```
你: 访问 https://example.com 并截图
AI: [调用 Puppeteer_navigateTo 和 Puppeteer_screenshot]
```

### 4. 💾 SQLite (数据库)
- **包名**: `@modelcontextprotocol/server-sqlite`
- **用途**: 操作 SQLite 数据库
- **工具**:
  - `query` - 执行 SQL 查询
  - `createTable` - 创建表
  - `insert` - 插入数据
  - `update` - 更新数据
- **费用**: 免费

示例:
```
你: 查询 users 表中所有用户
AI: [调用 sqlite/query 工具执行 SELECT * FROM users]
```

### 5. 🔄 Git (版本控制)
- **包名**: `@executeautomation/server-git`
- **用途**: Git 仓库操作
- **工具**:
  - `git_clone` - 克隆仓库
  - `git_create_branch` - 创建分支
  - `git_commit` - 提交更改
  - `git_status` - 查看状态
- **费用**: 免费

示例:
```
你: 克隆 https://github.com/user/repo.git
AI: [调用 git_clone 工具]
```

## 需要配置的工具 (有免费额度)

### 6. 🐙 GitHub (代码托管)
- **包名**: `@modelcontextprotocol/server-github`
- **用途**: GitHub 仓库、issues、PRs 管理
- **工具**:
  - `create_or_update_file` - 创建/更新文件
  - `create_issue` - 创建 issue
  - `create_pull_request` - 创建 PR
  - `push_files` - 推送文件
- **配置**: 需要 `GITHUB_TOKEN`
- **费用**: 免费 (GitHub 自带)
- **获取 Token**: https://github.com/settings/tokens

启用方法:
```json
{
  "id": "github",
  "enabled": true,
  "env": {
    "GITHUB_TOKEN": "ghp_xxxxxxxx"
  }
}
```

### 7. 🔍 Brave Search (网页搜索)
- **包名**: `@modelcontextprotocol/server-brave-search`
- **用途**: 网页搜索
- **工具**:
  - `brave_web_search` - 搜索网页
- **配置**: 需要 `BRAVE_API_KEY`
- **费用**: 每月 2000 次免费查询
- **获取 API Key**: https://api.search.brave.com/app/keys

启用方法:
```json
{
  "id": "brave-search",
  "enabled": true,
  "env": {
    "BRAVE_API_KEY": "BSxxxxx"
  }
}
```

### 8. 🐘 PostgreSQL (数据库)
- **包名**: `@modelcontextprotocol/server-postgres`
- **用途**: PostgreSQL 数据库操作
- **工具**:
  - `query` - 执行 SQL 查询
  - `executeBatch` - 批量执行
- **配置**: 需要 `POSTGRES_CONNECTION_STRING`
- **费用**: 免费 (本地数据库)

## 使用示例

### 示例 1: 读取网页内容
```
你: 读取 https://news.ycombinator.com 的首页标题
AI: 我会使用 fetch 工具读取该网页
[调用 fetch/read_resource 工具]
```

### 示例 2: 网页搜索 (需要 Brave API Key)
```
你: 搜索 "TypeScript latest features"
AI: 我会使用 brave-search 工具搜索
[调用 brave-search/brave_web_search 工具]
```

### 示例 3: 网页自动化
```
你: 打开 example.com，截图并保存为 example.png
AI: 我会使用 Puppeteer 工具:
1. 导航到 example.com
2. 截图
3. 保存图片
```

### 示例 4: Git 操作
```
你: 克隆我的仓库并创建新分支
AI: [调用 git_clone 和 git_create_branch]
```

## 实际场景

### 场景 1: 研究 + 总结
```
你: 搜索 React 19 新特性，总结并保存到 react19.md
AI: 
1. 使用 brave-search 搜索
2. 使用 fetch 读取相关文章
3. 使用 filesystem/write_file 保存到 react19.md
```

### 场景 2: 网页截图
```
你: 截图 https://example.com 首页，保存为 screenshot.png
AI:
1. 使用 Puppeteer_navigateTo 导航
2. 使用 Puppeteer_screenshot 截图
3. 使用 filesystem/write_file 保存
```

### 场景 3: 数据分析
```
你: 从 SQLite 数据库读取用户数据并分析
AI:
1. 使用 sqlite/query 执行查询
2. 分析数据
3. 使用 filesystem/write_file 生成报告
```

## 工具组合使用

这些 MCP 工具可以组合使用，实现强大的自动化流程：

```
你: 从 GitHub 克隆仓库，分析代码，创建 PDF 报告

AI: 
1. [git_clone] 克隆仓库
2. [filesystem/search_files] 查找代码文件
3. [filesystem/read_file] 读取代码
4. [fetch/read_resource] 获取相关文档
5. [puppeteer/pdf] 生成 PDF 报告
6. [github/create_or_update_file] 上传到仓库
```

## 配置文件位置

配置文件: `~/.nanopencil/agent/mcp.json`

查看当前配置:
```bash
cat ~/.nanopencil/agent/mcp.json
```

编辑配置:
```bash
# Windows
notepad %USERPROFILE%\.nanopencil\agent\mcp.json

# Linux/Mac
nano ~/.nanopencil/agent/mcp.json
```

## 启用 NanoPencil with MCP

**MCP 默认已启用**，免费工具会自动加载。直接运行：

```bash
nanopencil
```

如需禁用 MCP：
```bash
nanopencil --disable-mcp
```

## 工具调用格式

```
<server_id>/<tool_name>
```

例如:
- `filesystem/read_file`
- `fetch/fetch`
- `puppeteer/Puppeteer_screenshot`
- `sqlite/query`
- `git/git_clone`
- `github/create_issue`
- `brave-search/brave_web_search`

## 注意事项

### 性能
- Puppeteer 启动浏览器较慢
- 多个 MCP 服务器会增加启动时间
- 按需禁用不用的工具

### 安全
- Puppeteer 可以访问任意网站
- Git 工具可以修改仓库
- Filesystem 工具可以访问文件系统

### 隐私
- Fetch 工具会访问外部网站
- Brave Search 会发送搜索查询
- GitHub 工具需要访问权限

## 获取免费 API Key

### GitHub Token (免费)
1. 访问 https://github.com/settings/tokens
2. 点击 "Generate new token"
3. 选择权限 (repo, public_repo)
4. 生成并复制 token

### Brave Search API Key (免费额度)
1. 访问 https://api.search.brave.com/app/keys
2. 注册账号
3. 获取 API Key
4. 每月 2000 次免费查询

## 故障排除

### 工具无法调用
1. 检查是否启用 `--enable-mcp`
2. 检查工具是否启用
3. 查看错误日志

### Puppeteer 启动失败
1. 检查系统是否安装了 Chrome/Chromium
2. 检查网络连接

### Git 工具失败
1. 检查 git 是否已安装
2. 检查是否有权限访问仓库

## 相关资源

- [MCP 官方服务器列表](https://github.com/modelcontextprotocol/servers)
- [NanoPencil MCP 指南](MCP集成指南.md)
- [MCP 规范](https://modelcontextprotocol.io)

---

**🎉 享受强大的 MCP 工具吧！**
