# NanoPencil MCP 快速参考

## 🚀 快速开始

```bash
# 启用 MCP
nanopencil --enable-mcp
```

## 🎯 默认启用的免费工具

| 工具 | 用途 | 命令示例 |
|------|------|----------|
| **Filesystem** | 文件操作 | "列出 src/ 的 ts 文件" |
| **Fetch** | 读取网页 | "读取 example.com 的内容" |
| **Puppeteer** | 浏览器自动化 | "截取 example.com 的首页" |
| **SQLite** | 数据库 | "查询 users 表" |
| **Git** | 版本控制 | "克隆 GitHub 仓库" |

## 🔧 可选工具 (需 API Key)

| 工具 | API Key | 免费额度 | 获取方式 |
|------|---------|----------|----------|
| **GitHub** | GITHUB_TOKEN | ✅ 免费 | [GitHub Tokens](https://github.com/settings/tokens) |
| **Brave Search** | BRAVE_API_KEY | 2000次/月 | [Brave API](https://api.search.brave.com/app/keys) |
| **PostgreSQL** | CONNECTION_STRING | ✅ 免费 | 本地数据库 |

## 📝 使用示例

### 读取网页
```
你: 读取 https://www.example.com 的标题
```

### 网页搜索 (需 Brave API)
```
你: 搜索 "Python 3.12 新特性"
```

### 截图 (使用 Puppeteer)
```
你: 截图 https://example.com
```

### Git 操作
```
你: 克隆 https://github.com/user/repo.git
```

## 📁 配置文件

**位置**: `~/.nanopencil/agent/mcp.json`

**启用 GitHub**:
```json
{
  "id": "github",
  "enabled": true,
  "env": {
    "GITHUB_TOKEN": "你的token"
  }
}
```

**启用 Brave Search**:
```json
{
  "id": "brave-search",
  "enabled": true,
  "env": {
    "BRAVE_API_KEY": "你的API key"
  }
}
```

## 🔍 常用场景

### 研究 + 总结
```
你: 搜索 React 19 新特性，总结到 react19.md
```

### 网页抓取
```
你: 读取 https://news.ycombinator.com 首页的前 5 个标题
```

### 自动化测试
```
你: 使用 Puppeteer 访问 example.com 并截图
```

### 代码分析
```
你: 克隆仓库，分析 TypeScript 代码，生成报告
```

## ⚠️ 注意事项

1. **性能**: Puppeteer 较慢，按需使用
2. **安全**: 工具可访问文件系统和网络
3. **隐私**: 搜索和抓取会发送数据到外部
4. **兼容性**: 首次使用需下载 MCP 服务器包

## 📖 更多信息

- [完整文档](docs/内置MCP工具.md)
- [MCP 指南](docs/MCP集成指南.md)
- [MCP 官方文档](https://modelcontextprotocol.io)

---

**开始使用强大的 MCP 工具吧！** 🎉
