# Behavior Review Log

```yaml
doc: behavior-review-log
parent: ./README.md
purpose: |
  第三评审层。结构评审(UI/AS 卡)问"边界对不对";功能验收(feature-inventory)问
  "功能还在不变吗";本日志问"功能本身对不对" —— 主动挖每个核心功能的真实 bug。
  纯搬/抽象会忠实保留 main 既有 bug;抽取该功能时顺带做行为评审,挖出即修(GB-2 声明)。
trigger: 每抽取/触碰一个核心功能时，对它做一次主动行为评审（不只"是否搬动正确"）。
why_needed: |
  P4(agent-session)是纯搬+抽象，从未主动审过行为，因此把 main 既有 bug 原样保留。
  结构正确 ≠ 行为正确。本日志补上这一层，并可回溯（P4 各核心功能待补行为评审）。
```

> 每条 = `现象(phenomenon) → 根因(essence) → 修复(commit, GB-2) → 状态`。
> 行为评审发现的修复是**有意行为变更**，按 GB-2 显式声明，不属于纯搬。

---

## image-pipeline（P5 首刀，2026-06-02/03）

抽取时 + maintainer 实测中挖出 **5 个 main 既有 bug / UX 缺陷**，均已 GB-2 修复：

| # | 现象 | 根因 | 修复 | 状态 |
|---|------|------|------|------|
| B1 | `/new` 后附件栏不清，残留旧图 | `handleClearCommand` 等清了 chat/streaming 却漏了附件 | `clearAttachments()` 接入所有会话切换点 (`2840395`) | ✅ |
| B2 | 单张图时方向键无响应、无法删除 | 旧逻辑只在 `length>1` 才拦截 ↑↓；`selectedIndex` 卡在 -1 → Del 永不触发 | 重设计 `handleAttachmentKeyNavigation`：↑ 进栏/导航/Del (`4e67d7e`) | ✅ |
| B3 | 一轮对话结束后附件栏不清，下次粘贴堆积成第二张 | 仅在 submit 清；"agent 读磁盘文件"路径下附件从未被消费 | `agent_end` 也清附件 (`4e67d7e`) | ✅ |
| B4 | 有文本输入时无法用方向键选附件 | 进栏判据用 `isEditorEmpty`，有文本即拒 | 改判据为 `isEditorSingleLine`（单行即可进栏，多行保留光标）(`52c982f`) | ✅ |
| B5 | 对话结束栏清空但磁盘路径还在；新粘贴复用旧图文件名 | `clearAttachments`/`takePendingAttachments` 重置 seq→0 但不删盘文件 → 新粘贴复用 `_np_clipboard_image_1.png` | `clearAttachments` 同时删盘文件 (`52c982f`) | ✅ |

> 非代码 bug（记录以备追溯）：图片"未送达模型" → 实为自定义端点/模型不支持视觉；nanoPencil 发送链正确（paste→attachment→userContent→provider image_url）。换支持视觉的端点后正常。

### 交互模型（梳理后定稿）

附件栏在编辑器**上方**。
- **粘贴** → 图入栏（暂存，不阻塞输入）。可继续打字；**发送时随消息带走并清栈**。
- **进栏选择**：编辑器单行时（空 或 单行文本）按 **↑** 进栏，选中最近一张；栏内 ↑/↓ 移动，**越界退栏**（键交还编辑器/历史）。多行文本时 ↑/↓ 归光标。
- **删除**：栏内按 Del/Backspace 删选中。
- **清空**：发送时清 + **一轮对话结束(agent_end)清** + 会话切换清；清栈**同时删盘文件**（避免文件名复用）。
- 已知取舍：**多行文本时无法用 ↑ 进栏**（↑ 要给光标）；需先回到单行。`Editor.state` 为 private，"光标在顶行才进栏"的完整版需给 tui 加 `isCursorAtTop()`，按需再做。

---

## 待补：P4 核心功能回溯行为评审

P4 是纯搬+抽象，以下核心功能**只验过"不变"，未主动审过"对不对"**，建议逐个补行为评审（同上模式）：

- [ ] model set/cycle/restore（ModelController）
- [ ] compaction 手动/自动（CompactionController）
- [ ] session new/switch/fork（SessionLifecycleController）
- [ ] tree 导航 + 分支摘要（SessionTreeController）
- [ ] bash 执行 + 队列（BashRunner）
- [ ] 工具运行时合并/包装（ToolRuntimeController）

> 触发时机：可在各自被再次触碰时做，或集中一轮。发现即修（GB-2），记录于
> `runtime-session-review/behavior-review-log.md`（待建）。
