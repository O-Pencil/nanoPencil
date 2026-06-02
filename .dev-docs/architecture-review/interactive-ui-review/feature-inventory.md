# interactive-mode 功能特性清单 v0

```yaml
doc: feature-inventory
version: v0    # 从摸底 182 方法 + /command + 键位 + handleEvent + overlay 反推，待 maintainer 校全
parent: ./README.md
purpose: |
  P5 的验收基准（功能验收，非 characterization）+ 维护者特性目录。
  重构后逐条确认「功能正确」，不比对实现。完整度 = 验收强度（UI01 核心风险）。
source_of_truth: modes/interactive/interactive-mode.ts @ 7960 行（拆前快照）
legend:
  owner: 拟拆入的 controller（见 P5 §现状摸底簇表 / gates.md Single-Owner）
  verify: 重构后确认列（⬜ 待验 / ✅ 通过 / ✗ 回归 / ⚠️ 有意变更-已声明）
```

> **怎么用**：每条 = `触发 → 预期行为(验收标准)`。重构后按"触发"复现，确认"预期"成立即 ✅。
> 有意改了行为/符号 → 标 ⚠️ 并在对应 review 卡/Phase 写明（GB-2），不算回归。
> **v0 是反推骨架，maintainer 需校全**（漏列 = 该功能无保护）。

---

## A. Slash 命令（33 条，owner: slash-dispatcher 除非另注）

| 命令 | 触发 | 预期行为(验收标准) | owner | verify |
|------|------|-------------------|-------|--------|
| `/model [term]` | 输入 | 打开模型选择 overlay；带 term 则预过滤 | model-overlay | ⬜ |
| `/scoped-models` | 输入 | 打开 scoped-models 选择器 | model-overlay | ⬜ |
| `/thinking [lvl]` | 输入 | 切换/设置 thinking level | model-overlay | ⬜ |
| `/agent-loop` | 输入 | 切换 agent loop framework | slash-dispatcher | ⬜ |
| `/settings` | 输入 | 打开设置选择器 | model-overlay | ⬜ |
| `/apikey` | 输入 | 进入 API key 录入流 | auth | ⬜ |
| `/login [provider]` | 输入 | OAuth 登录（带 provider 直登，否则选择器）| auth | ⬜ |
| `/logout` | 输入 | OAuth 登出选择器 | auth | ⬜ |
| `/mcp [args]` | 输入 | 列/启停 MCP server | slash-dispatcher（经 facade，UI03）| ⬜ |
| `/export [path]` | 输入 | 导出会话 HTML | slash-dispatcher | ⬜ |
| `/share` | 输入 | 上传/生成分享链接 | slash-dispatcher | ⬜ |
| `/copy` | 输入 | 复制最后 assistant 文本 | slash-dispatcher | ⬜ |
| `/status` | 输入 | 显示会话/系统状态 | slash-dispatcher | ⬜ |
| `/usage` | 输入 | 显示 token/费用用量 | slash-dispatcher | ⬜ |
| `/name [text]` | 输入 | 设会话名 | slash-dispatcher | ⬜ |
| `/session` | 输入 | 会话信息/操作 | slash-dispatcher | ⬜ |
| `/resume` | 输入 | 打开会话恢复选择器 | tree-overlay | ⬜ |
| `/new` | 输入 | 新建会话（清空）| tree-overlay/lifecycle | ⬜ |
| `/fork` | 输入 | 从用户消息分叉 | tree-overlay | ⬜ |
| `/tree` | 输入 | 打开分支树选择器 | tree-overlay | ⬜ |
| `/changelog` | 输入 | 显示变更日志 | slash-dispatcher | ⬜ |
| `/hotkeys` | 输入 | 显示键位表 | slash-dispatcher | ⬜ |
| `/resources` | 输入 | 显示已加载资源(扩展/技能/主题) | slash-dispatcher | ⬜ |
| `/reload` | 输入 | 重载配置/资源 | slash-dispatcher（runtime reload）| ⬜ |
| `/compact [instr]` | 输入 | 手动压缩上下文(可带指令) | slash-dispatcher（经 AgentSession）| ⬜ |
| `/soul` | 输入 | 显示 soul 状态 | slash-dispatcher | ⬜ |
| `/persona [text]` | 输入 | 切换/显示 persona | slash-dispatcher | ⬜ |
| `/memory` | 输入 | 显示 memory 状态 | slash-dispatcher | ⬜ |
| `/language [lang]` | 输入 | 切换界面语言 | slash-dispatcher | ⬜ |
| `/update` | 输入 | 检查并更新版本 | self-update | ⬜ |
| `/reinstall` | 输入 | 重装 | self-update | ⬜ |
| `/quit` | 输入 | 退出 | _shell/cancellation | ⬜ |
| `/arminsayshi` | 输入 | 彩蛋 | slash-dispatcher | ⬜ |

> 另：扩展注册的 `/command` 经 `isExtensionCommand` 路由到 ExtensionRunner（owner: extension-ui + slash-dispatcher 协作，统一 dispatch 表是 F02/UI02 的 seam 目标）。bash 模式（`!` 前缀）由 `handleBashCommand` 处理（owner: slash-dispatcher）。

---

## B. 键位动作（22 个 AppAction，owner 见注）

| 动作 | 默认键 | 预期行为 | owner | verify |
|------|--------|---------|-------|--------|
| interrupt | `esc` | 中断当前 agent 运行；双击 esc 可触发 tree/配置动作 | _shell/cancellation | ⬜ |
| clear | `ctrl+c` | 清空/退出确认（双击退出）| _shell/cancellation | ⬜ |
| exit | `ctrl+d` | 退出 | _shell/cancellation | ⬜ |
| suspend | `ctrl+z` | 挂起进程 | _shell/cancellation | ⬜ |
| showResources | `ctrl+h` | 显示已加载资源 | slash-dispatcher | ⬜ |
| cycleThinkingLevel | `shift+tab` | 循环 thinking level | model-overlay | ⬜ |
| cycleModelForward | `ctrl+p` | 下一个模型 | model-overlay | ⬜ |
| cycleModelBackward | `shift+ctrl+p` | 上一个模型 | model-overlay | ⬜ |
| selectModel | `ctrl+l` | 打开模型选择器 | model-overlay | ⬜ |
| selectProviderThenModel | `ctrl+shift+l` | provider→模型选择 | model-overlay | ⬜ |
| expandTools | `ctrl+o` | 展开/折叠工具输出 | mount(render) | ⬜ |
| toggleThinking | `ctrl+t` | 显隐 thinking block | mount(render) | ⬜ |
| toggleSessionNamedFilter | `ctrl+n` | 切换会话命名过滤 | tree-overlay | ⬜ |
| externalEditor | `ctrl+g` | 打开外部编辑器 | mount | ⬜ |
| followUp | `alt+enter` | 追加 follow-up 消息 | mount(queue) | ⬜ |
| dequeue | `alt+up` | 取回排队消息 | mount(queue) | ⬜ |
| pasteImage | `ctrl+v` | 粘贴剪贴板图像 | image-pipeline | ⬜ |
| newSession | (无默认) | 新建会话 | tree-overlay/lifecycle | ⬜ |
| tree | (无默认) | 分支树 | tree-overlay | ⬜ |
| fork | (无默认) | 分叉 | tree-overlay | ⬜ |
| resume | (无默认) | 恢复会话 | tree-overlay | ⬜ |
| 附件导航 | 方向键(附件态) | 在附件条上移动/删除 | image-pipeline | ⬜ |

---

## C. Overlay / 选择器（owner 见注）

| Overlay | 触发 | 预期行为 | owner | verify |
|---------|------|---------|-------|--------|
| 模型选择器 | `/model` `ctrl+l` | 列模型、选中切换 | model-overlay | ⬜ |
| provider→模型 | `ctrl+shift+l` | 先选 provider 再选模型 | model-overlay | ⬜ |
| scoped-models | `/scoped-models` | 多模型作用域配置 | model-overlay | ⬜ |
| 设置选择器 | `/settings` | 设置项浏览/修改 | model-overlay | ⬜ |
| 会话恢复选择器 | `/resume` | 列历史会话、恢复 | tree-overlay | ⬜ |
| 分支树选择器 | `/tree` | 树导航、选叶子 | tree-overlay | ⬜ |
| 用户消息选择器 | `/fork` | 选分叉点 | tree-overlay | ⬜ |
| OAuth 选择器 | `/login` `/logout` | 选 provider 登录/登出 | auth | ⬜ |
| 登录对话框 | login 流 | 输入凭据/OAuth 跳转 | auth | ⬜ |
| 更新选项 | `/update` | 选更新方式 | self-update | ⬜ |
| 重试选项 | 更新失败 | 重试/放弃 | self-update | ⬜ |
| 扩展选择器/输入/编辑器/确认/通知/错误 | 扩展 API | 扩展驱动的 UI 表面 | extension-ui | ⬜ |

---

## D. 流式渲染特性（handleEvent，13 事件，owner: mount/render — UI04 deferred）

| 事件 | 预期渲染 | verify |
|------|---------|--------|
| agent_start | 起 loading/working 动画 + 计时 | ⬜ |
| message_start | 起 streaming assistant 组件 | ⬜ |
| message_update | 增量刷 assistant 文本/thinking/toolCall | ⬜ |
| message_end | 定稿 assistant 消息 | ⬜ |
| tool_execution_start | 起工具执行组件 | ⬜ |
| tool_execution_update | 刷工具进度 | ⬜ |
| tool_execution_end | 定稿工具结果(可展开) | ⬜ |
| agent_end | 停动画/计时，回到 idle | ⬜ |
| auto_compaction_start/end | 压缩 loader + 排队消息提示 | ⬜ |
| auto_retry_start/end | 重试 loader + esc 处理 | ⬜ |

---

## E. 其它特性（owner 见注）

| 特性 | 触发 | 预期 | owner | verify |
|------|------|------|-------|--------|
| 附件/图像管线 | 粘贴/拖入/`ctrl+v` | 加入附件条、随消息发送 | image-pipeline | ⬜ |
| 文本中图像提取 | 含路径文本 | 解析为附件 | image-pipeline | ⬜ |
| 自动补全 | 输入 `/` `@` 等 | 候选提示 | mount(setupAutocomplete) | ⬜ |
| 消息排队/取回 | 运行中输入 | 排队、agent 结束后处理 | mount(queue) | ⬜ |
| 启动版本检查 | 启动 | 后台检查、有新版提示 | self-update | ⬜ |
| buddy pet | 状态变化 | 宠物动画随状态 | mount(buddyPet) | ⬜ |
| 扩展 widget/footer/header | 扩展 API | 注入区域渲染 | extension-ui | ⬜ |
| 会话导航 banner | switch/fork/tree | 顶部提示 | tree-overlay | ⬜ |
| 启动横幅/资源加载展示 | 启动/`/resources` | 欢迎+诊断 | mount | ⬜ |

---

## 待校全清单（v0 → v1，maintainer）

- [ ] 校对 A 的 33 条是否完整（是否有未走 `executeBuiltinSlashCommand` 的命令）
- [ ] 补 B 中"双击 esc 动作"、editor 层键位（EditorAction）是否纳入验收
- [ ] D 的渲染特性是否需要更细的验收标准（如"工具输出展开/折叠"逐态）
- [ ] 标注每条的 **hybrid 决策**：纯搬(preserve-check) vs 重写(功能验收)
- [ ] 扩展注册命令/键位的动态部分如何验收（依赖装了哪些扩展）

> 校全后此表即 P5 验收门 + 维护者特性目录；每抽一个 controller，回填该 owner 名下功能的 verify 列。
