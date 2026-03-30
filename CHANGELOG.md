# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.11.15] - 2026-03-31

### Added
- feat(acp): improve zed agent parity
- feat(figma): improve remote MCP authentication flow
- feat(agent): hide internal traces and improve time grounding
- feat(mem): add graph-driven memory governance
- feat(team): add multi-agent team orchestration extension
- feat(providers): support custom protocol endpoints
- feat(loop): replace timer loop with autonomous task loop

### Fixed
- fix(mcp): load runtime config from the active MCP path
- fix(interactive): harden extension prompt focus flow
- fix(runtime): tighten workspace handling and startup prompts @o-pencil-agent
- fix(runtime): improve loop recovery and insights reporting
- fix(deps): add zod runtime dependency
- fix(ux): improve custom provider messaging
- fix(providers): reopen and refresh custom provider edits
- fix(providers): streamline custom provider setup
- fix: extract clipboard image data before sending to model

### Documentation
- docs(prompt): refine project assistant charter @o-pencil-agent
- docs(agents): require English for code strings and commits

### Maintenance
- chore(release): prepare 1.11.14 changelog
- chore(release): prepare 1.11.13 changelog
- chore(release): publish 1.11.12
- chore(release): prepare 1.11.12 changelog
- chore(release): publish 1.11.11
- chore(release): publish 1.11.10
- chore(release): publish 1.11.8
- chore(release): publish 1.11.6
- chore(release): publish 1.11.5


## [1.11.13] - 2026-03-29

### Added
- feat(figma): improve remote MCP authentication flow
- feat(agent): hide internal traces and improve time grounding
- feat(mem): add graph-driven memory governance
- feat(team): add multi-agent team orchestration extension
- feat(providers): support custom protocol endpoints
- feat(loop): replace timer loop with autonomous task loop

### Fixed
- fix(mcp): load runtime config from the active MCP path
- fix(interactive): harden extension prompt focus flow
- fix(runtime): tighten workspace handling and startup prompts @o-pencil-agent
- fix(runtime): improve loop recovery and insights reporting
- fix(deps): add zod runtime dependency
- fix(ux): improve custom provider messaging
- fix(providers): reopen and refresh custom provider edits
- fix(providers): streamline custom provider setup
- fix: extract clipboard image data before sending to model

### Documentation
- docs(prompt): refine project assistant charter @o-pencil-agent
- docs(agents): require English for code strings and commits

### Maintenance
- chore(release): prepare 1.11.13 changelog
- chore(release): publish 1.11.12
- chore(release): prepare 1.11.12 changelog
- chore(release): publish 1.11.11
- chore(release): publish 1.11.10
- chore(release): publish 1.11.8
- chore(release): publish 1.11.6
- chore(release): publish 1.11.5


## [1.11.13] - 2026-03-30

### Added
- feat(figma): add standalone Figma MCP OAuth groundwork and built-in Figma setup guidance

### Fixed
- fix(mcp): support streamable HTTP event-stream responses for remote MCP servers
- fix(mcp): allow HTTP MCP tools to execute through the NanoPencil MCP client
- fix(figma): make remote Figma MCP usable through built-in presets and authenticated tool discovery

## [1.11.12] - 2026-03-29

### Fixed
- Hardened interactive extension prompt focus handling so interview selectors, extension inputs, and multiline editors recover focus more reliably.
- Prevented stale prompt abort/cancel callbacks from dismissing a newer prompt, reducing the risk of blocked input during long-running or multi-step interactions.
- Restored editor focus more consistently around agent start/end transitions so users can keep typing while execution continues.


## [1.11.11] - 2026-03-29

### Added
- Added separate switches to hide working traces and NanoMem traces by default, making chat responses feel more natural.
- Added a built-in `time` tool so the agent can confirm the real current system time for time-sensitive questions.

### Changed
- Refresh the system prompt timestamp on every turn instead of relying on the session startup time.
- Include real system time context in NanoMem transcript extraction and store episode start/end time metadata for longer-term temporal recall.


## [1.11.10] - 2026-03-29

### Added
- **NanoMem memory governance**
  - Added key event memory, progressive graph context, and relation-aware recall
  - Added current state signals to separate short-term state from stable identity
  - Added alignment snapshot, conflict detection, and review tooling
  - Added memory editing and conflict resolution commands/tools

### Changed
- **NanoMem retrieval and forgetting**
  - Prioritize core memory and key events in progressive disclosure
  - Strengthen graph edges on successful recall and decay weak links over time
  - Let low-signal ambient and situational memory fade faster

### Fixed
- Reduced memory drift caused by temporary mood or short-lived context
- Reduced duplicate cue/context injection by de-duplicating graph neighbors and cue memories

---

## [1.11.2] - 2026-03-19

### Added
- **Interview 扩展优化**
  - 降低 Interview 触发频率，只在模糊需求或短文本时触发
  - 添加 `PI_JUST_SWITCHED_PERSONA` 环境变量，人格切换后跳过 interview
  - 添加 Interview 过程可视化（状态栏和通知）
- **人格包一键切换**: 支持在同一运行环境下按角色隔离 Pencil/Soul/NanoMEM/Skills/MCP 并通过 reload 即时生效

### Fixed
- 修复 /persona 命令在混合消息中无法识别的问题
- 修复版本比较逻辑导致低版本误报更新提示

---

## [1.11.1] - 2026-03-11

### Added
- **Interview 扩展**: 需求澄清扩展，类似 Cursor/Claude Interview，通过交互式问答帮助用户明确需求

### Fixed
- 修复 interview 扩展类型错误
- 更新模型配置

---

## [1.11.0] - 2026-03-10

### Added
- **架构重构**
  - 抽取 AgentSession 协调器，职责更清晰
  - system-prompt 动态化
  - MCP 抽象化为扩展 + ToolSource 接口

### Changed
- **目录重构**
  - `core/` 重构为子目录结构
  - `extensions/` 拆分为 `defaults/` 和 `optional/`
  - `nano-mem` -> `mem-core`, `soul` -> `soul-core`
  - `utils` 目录归类

### Added
- **NanoMem 新功能**
  - 新增 namespaced tools 和 priority 系统
  - 新增 human-insights 模块
  - 新增 generateEnhancedInsights 方法
  - 新增大白话洞察类型和 Prompt

---

## [1.10.7] - 2026-02-28

### Added
- 优化记忆系统提示词，使其更自然类人
- 添加对百度千帆和火山方舟 Coding Plan 的支持
- link-world 扩展支持自动检测并加载 internet-search skill

---

## [1.10.6] - 2026-02-20

### Added
- 添加 MiniMax 和智谱 Coding Plan 支持

---

## [1.10.5] - 2026-02-15

### Added
- 安全审计扩展添加拦截模式 (strict)

---

## [1.10.4] - 2026-02-10

### Fixed
- 将 security-audit 添加到内置扩展加载列表

---

## [1.10.3] - 2026-02-05

### Added
- Security Audit Extension 安全审计扩展

---

## [1.10.2] - 2026-01-28

### Added
- 更新模型选择器以支持无认证模型和 API 密钥提示
- 优化 context 使用显示和颜色逻辑

---

## [1.10.1] - 2026-01-20

### Fixed
- 修复构建脚本和 skill 目录结构

---

## [1.10.0] - 2026-01-15

### Added
- 统一 Soul 包并迁移为扩展

---

*Changelog generated from commit history. For older releases, please refer to git history.*
