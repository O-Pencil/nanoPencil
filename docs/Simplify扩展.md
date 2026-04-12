# Simplify 扩展

> Claude Code `/simplify` 风格的代码简化工具

## 概述

Simplify 是一个可选扩展，提供代码简化和重构能力。它通过 AI 分析代码，应用预定义的重构模式，在保持功能等价的前提下降低代码认知负荷。

**位置**: `extensions/optional/simplify/`

**特点**:
- 自动感知项目规范
- 预览确认机制
- 测试验证 + 失败回滚
- 多模型自动回退

---

## 四层架构

```
┌─────────────────────────────────────────────────────────────┐
│  感知层                                                        │
│  • 扫描 Git Diff（staged + unstaged）                        │
│  • 读取项目规范（AGENT.md, AGENTS.md, .cursor/rules）       │
│  • 分析代码结构                                                │
├─────────────────────────────────────────────────────────────┤
│  决策层                                                        │
│  • 卫语句转换 (Guard Clauses)                                 │
│  • 表达式折叠 (Expression Folding)                            │
│  • 冗余剥离 (Redundancy Removal)                              │
│  • 循环简化 (Loop Simplification)                             │
├─────────────────────────────────────────────────────────────┤
│  执行层                                                        │
│  • 生成代码 Diff                                              │
│  • 备份原文件                                                  │
│  • 应用变更                                                   │
├─────────────────────────────────────────────────────────────┤
│  验证层                                                        │
│  • 运行测试 (npm test / pytest / cargo test / go test)       │
│  • 失败自动回滚                                               │
│  • 汇报结果                                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 重构模式

### 1. 卫语句 (Guard Clauses)

将嵌套 if-else 转换为 early return：

```typescript
// Before
function processUser(user: User) {
    if (user) {
        if (user.isActive) {
            if (user.hasPermission) {
                // ... long code
            }
        }
    }
}

// After
function processUser(user: User) {
    if (!user) return;
    if (!user.isActive) return;
    if (!user.hasPermission) return;
    // ... long code
}
```

### 2. 表达式折叠

简化布尔逻辑：

```typescript
// Before                    → After
if (x === true)              → if (x)
if (a === false)             → if (!a)
if (!(a && b))               → if (!a || !b)
if (arr.length === 0)        → if (arr.length === 0)  // 保留
```

### 3. 冗余剥离

- 移除不必要的中间变量
- 移除未使用的私有方法
- 移除过时的注释

### 4. 循环简化

```typescript
// Before                              → After
arr.forEach(x => result.push(x))       → result = arr.map(x => x)
const results = [];                    → const activeUsers = users.filter(u => u.active)
for (const u of users) {               → 
    if (u.active) results.push(u);     
}

// Before                              → After
let sum = 0;                           → const sum = nums.reduce((a, b) => a + b, 0);
for (const n of nums) { sum += n; }
```

---

## 使用方法

### 基本命令

```bash
/simplify                    # 简化 Git 变更的文件
/simplify src/utils.ts       # 简化指定文件
/simplify src/               # 简化目录下的所有文件
```

### 选项

| 选项 | 说明 |
|------|------|
| `--dry-run` | 预览模式，不实际修改文件 |
| `--no-test` | 简化后不运行测试 |
| `--run-tests` | 简化后运行测试（默认） |

### 快捷键

| 快捷键 | 说明 |
|--------|------|
| `Ctrl+Shift+S` | 快速简化变更文件 |

### UI 交互

在预览界面中：

| 按键 | 说明 |
|------|------|
| `y` | 应用此次变更 |
| `n` | 跳过此文件 |
| `q` | 取消全部操作 |
| `Esc` | 取消全部操作 |

---

## 工作流程

```
1. 用户执行 /simplify
           ↓
2. 扫描 Git Diff（staged + unstaged）
           ↓
3. 加载项目规范（AGENT.md 等）
           ↓
4. 对每个文件调用 LLM 分析
           ↓
5. 显示预览 UI（Diff + 说明）
           ↓
6. 用户确认 (y/n/q)
           ↓
7a. 应用变更 → 运行测试 → 成功/失败处理
           ↓
7b. 跳过/取消 → 继续下一个或结束
           ↓
8. 汇报结果（应用数、节省行数）
```

---

## 安全保障

| 约束 | 说明 |
|------|------|
| ❌ 不改变函数签名 | 保持外部行为一致 |
| ❌ 不添加/删除功能 | 仅重构，不改变逻辑 |
| ❌ 不改变公共 API | 兼容现有调用方 |
| ✅ 保留所有副作用 | 精确等价 |
| ✅ 测试失败回滚 | 确保代码可用 |
| ✅ 操作前备份 | 可手动恢复 |

---

## LLM 调用

### 模型优先级

1. 当前会话模型
2. `claude-sonnet-4-5` (Anthropic)
3. `gpt-4o` (OpenAI)
4. `gemini-2.5-flash` (Google)

### Prompt 约束

系统提示中强调：
1. 不改变函数签名或外部行为
2. 不添加或删除功能
3. 不改变公共 API
4. 保留所有副作用

### 输出格式

期望返回 JSON：

```json
{
  "simplified": "简化后的代码",
  "explanation": "修改说明",
  "equivalent": true
}
```

如无需简化：

```json
{
  "simplified": null,
  "explanation": "Code is already simple and clean",
  "equivalent": true
}
```

---

## 配置检测

### 测试框架检测

自动检测项目使用的测试框架：

| 检测文件 | 测试命令 |
|----------|----------|
| `package.json` (有 `test` script) | `npm test` |
| `pytest.ini` | `pytest` |
| `setup.py` | `python -m pytest` |
| `Cargo.toml` | `cargo test` |
| `go.mod` | `go test ./...` |

### 项目规范加载

按优先级读取：

1. `AGENT.md`
2. `AGENTS.md`
3. `.cursor/rules`
4. `.github/copilot-instructions.md`

---

## 已知限制

1. **仅支持部分语言**: TypeScript, JavaScript, Python, Go, Rust, Java, C, C++, C#
2. **不支持的变更**: 重构模式仅限上述四种，大范围重构可能效果不佳
3. **LLM 依赖**: 需要有效的 API Key
4. **串行处理**: 多文件时逐个处理，大项目可能较慢

---

## 扩展开发参考

此扩展可作为开发自定义扩展的参考示例，展示了：

- 如何注册斜线命令 (`registerCommand`)
- 如何注册快捷键 (`registerShortcut`)
- 如何使用 UI 组件 (`ctx.ui.custom`)
- 如何调用 LLM (`complete`)
- 如何处理 Git 操作 (`execSync`)
- 如何实现预览/确认流程

**代码行数**: ~400 行

---

## 相关文档

- [扩展开发指南](./EXTENSIONS.md)
- [MCP 集成指南](./MCP集成指南.md)
- [记忆系统](./记忆系统.md)