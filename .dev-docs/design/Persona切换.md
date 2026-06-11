# Persona 切换（人格包）

Persona 切换用于在同一套 NanoPencil 运行环境内切换不同的「身份/性格/能力」组合。

## 目录结构

默认 persona 状态存储：
`~/.nanopencil/agent/persona.json`

persona 目录：
`~/.nanopencil/agent/personas/<personaId>/`

推荐放置以下文件/目录（按需）：
- `PENCIL.md`：人格上下文正文（会替换全局的 `~/.nanopencil/agent/.PENCIL.md` 注入内容）
- `skills/`：该人格专属技能（用于 `SKILL.md` 的载入）
- `mcp.json`：该人格专属 MCP server 开关（用于启用/禁用不同的 MCP tools）
- `soul/`：Soul 人格持久化存储
- `memory/`：NanoMem 记忆持久化存储

## 使用方式

当前交互模式支持：
- `/persona list`：列出本机已存在的 persona
- `/persona use <personaId>`：切换到指定 persona（会创建新的会话分支并应用该 persona 的 Pencil/Soul/NanoMEM/Skills/MCP）

## 验证建议

切换后建议按下面步骤做“可观察”的验证（尽量用可唯一检索的标识词）：

## 1. 准备两个 persona

以 `designer` / `game-planner` 为例（你可以用任意目录名）：

1. 创建目录：
   - `mkdir -p ~/.nanopencil/agent/personas/designer/{skills,memory,soul}`
   - `mkdir -p ~/.nanopencil/agent/personas/game-planner/{skills,memory,soul}`
2. 为每个 persona 写入 `PENCIL.md`（让身份描述明显不同）。
3. （可选）为每个 persona 准备不同的 `skills/` 目录与 `SKILL.md`（至少保证其中一个技能存在且名字不同）。
4. （可选）为每个 persona 写入不同的 `mcp.json`：
   - 例如让 `designer` 启用 filesystem+sequential-thinking
   - 让 `game-planner` 启用 memory+sqlite（把对应 server 的 `enabled` 改成 `true`）

## 2. 验证 Pencil（系统提示词注入）

1. 启动 nanoPencil 并执行：
   - `/persona list`
   - `/persona use designer`
2. 发送一条提问（例如“给我一个你作为 designer 的写作风格示例”）。
3. 使用 `/debug`（如果可用）查看 system prompt 或观察回复风格：应反映 `designer/PENCIL.md` 的差异。

## 3. 验证 NanoMEM（memoryDir 隔离）

1. 在 `designer` persona 下发送一句包含唯一标识的内容：
   - `记住：MEM_DESIGNER_UNIQUE_12345`
2. 稍后执行（NanoMem 扩展提供的命令）：
   - `/mem-search MEM_DESIGNER_UNIQUE_12345`
   - 预计返回至少一条命中。
3. 切换到 `game-planner` persona：
   - `/persona use game-planner`
4. 再执行：
   - `/mem-search MEM_DESIGNER_UNIQUE_12345`
   - 预计命中数量应明显降低/为 0。

## 4. 验证 Soul（人格持久化与 stats 变化）

1. 在 `designer` 下执行：`/soul`
2. 做几轮对话（最好包含不同的任务/工具使用，让 Soul 有进化机会）
3. 切换到 `game-planner` 再执行：`/soul`
4. 预期：两者的 stats/表现应不同，并且持久化文件落在各自的 `personas/<id>/soul/` 目录下。

## 5. 验证 Skills（persona 专属技能集合）

1. 在 `designer` 下执行 `/resources`（或在 UI 中查看 loaded resources/skills）
2. 在 `game-planner` 下执行 `/resources`
3. 预期：技能命令与可用技能集合存在明显差异（例如 `/skill:<name>` 能/不能用）。

## 6. 验证 MCP（mcp.json 隔离 + reload 生效）

1. 在 `designer` persona 下执行：
   - `/mcp list`
   - `/mcp tools`（或 `/mcp status` / `/mcp tools`，以 UI 支持为准）
2. 切换到 `game-planner` persona：
   - `/persona use game-planner`
3. 再执行：
   - `/mcp list`
   - `/mcp tools`
4. 预期：工具数量/工具名可见性应随 persona 改变。

## 7. 验证 `/mcp enable/disable + /reload`

1. 在同一 persona 下修改 `mcp.json` 或执行：
   - `/mcp enable <id>`
   - `/mcp disable <id>`
2. 执行 `/reload`
3. 再执行 `/mcp tools`
4. 预期：工具集合应随配置变化而刷新（无需重启进程）。

