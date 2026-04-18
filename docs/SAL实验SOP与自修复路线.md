# SAL 实验 SOP 与自修复路线

> Type: SOP Outline
> Status: Draft
> Scope: 实验管线的标准化执行流程 + 自我进化方向
> Purpose: 让任何新实验（SAL / Soul / 未来模块）能快速复用采集-上报-评估管线；为 Pencil 自修复闭环留下可执行路径

---

## Part 1: 通用实验 SOP

### 1. 实验定义

- 实验 ID / 名称 / 目标假设
- 控制变量（对应哪个 CLI flag，如 `--nosal`、`--nosoul`）
- 实验类型：A/B 对照 | 前后对照 | 长期观察
- 事件类型注册（该实验需要采集哪些 event_type）
- 评估指标定义（自动可算 vs 人工判读，明确区分）

### 2. 基础设施准备

- InsForge 表结构：通用表（eval_runs / eval_turns）+ 实验专属表的 DDL
- credentials.json 配置：endpoint / api_key / adapter
- Sink 路由：当前阶段在 insforge-sink 的 routeEvent 中扩展；未来可演进为注册表模式
- 本地 sidecar 目录：`.memory-experiments/runs/<run-id>/`

### 3. 任务设计

- 任务集 YAML 编写规范（参考 `SAL实验任务集.yaml`）
- 轮次设计原则：
  - Round-1（seed）：首次执行，建立 memory
  - Round-2（follow-up）：验证 R1 经验复用
- 任务选型指南：
  - 简单任务（2-3 turn）：验证定位准确性
  - 复杂任务（10+ turn）：验证记忆召回 + 经验复用
  - 跨模块任务：最能体现结构感知价值

### 4. 执行流程

```
固定基线 (BASE_COMMIT / MODEL / TASK)
    ↓
创建双 worktree + 双 memory 目录
    ↓
运行 control (--noXXX) → 收集 eval 数据
    ↓
运行 experiment (default) → 收集 eval 数据
    ↓
导出 patch / memory 快照 / eval 数据
    ↓
清理 worktree
```

- 环境变量模板：NANOPENCIL_EVAL_RUN_ID / NANOPENCIL_EVAL_VARIANT / NANOMEM_MEMORY_DIR
- Memory 继承规则：每组 R2 只继承自己 R1 的 memory，严禁跨组

### 5. 数据治理

- 噪声识别标准：
  - test/probe run（run_id 含 test/probe/mcp-real）
  - trivial run（prompt < 30 字符的问候/测试）
  - zombie run（model=unknown 或无 turn 数据）
  - plan-mode 自动触发（"I've entered plan mode"）
- 清理操作：按 FK 顺序 DELETE（recalls → anchors → turns → runs）
- run 完整性校验：status=completed / turn_count>0 / ended_at 非空

### 6. 评估

- 自动可算指标（从 eval 表直接查询）：
  - run 完成率（completed / total）
  - anchor 命中率（task module == action module）
  - recall 数量 / 注入数量 / 平均 score_final
  - turn 数 / 总时长
- 人工判读指标：
  - patch 集中度（改动是否聚焦）
  - follow-up 复用质量
  - 返工次数
- 判定标准：至少命中一项正向信号且稳定复现
- 判废条件：违反 same-commit / same-model / same-task / state-isolation 任一

### 7. 归档与复盘

- artifacts 归档路径：`.memory-experiments/runs/<run-id>/`
- 结论记录：`.memory-experiments/notes/<experiment-name>.md`
- 下一轮改进方向的输入来源

---

## Part 2: 实验复用指南

### 新实验快速启动检查清单

```
[ ] 定义实验 ID 和目标假设
[ ] 确定控制变量（哪个 flag）
[ ] 定义需要采集的事件类型
[ ] 在 InsForge 创建实验专属表（如需要）
[ ] 在 extension 的 agent_end hook 中添加事件发射
[ ] 在 insforge-sink 的 routeEvent 中添加路由（或注册）
[ ] 编写任务集 YAML
[ ] 准备 credentials.json
[ ] 执行 A/B 流程
[ ] 数据清理 + 评估
```

### 复用层 vs 专属层

| 层 | 复用 | 每个实验自己做 |
|---|---|---|
| EvalSink 生命周期 | eval/index.ts factory | — |
| run/turn 通用事件 | run_start / run_end | — |
| InsForge 通用表 | eval_runs / eval_turns | 专属表 DDL |
| 事件信封格式 | EvalEventEnvelope | payload schema |
| A/B 执行框架 | worktree + env vars | flag + task YAML |
| 噪声清理逻辑 | 分类标准 | 专属表 DELETE |
| credentials | 共享配置 | — |

---

## Part 3: 自修复路线（Pencil 修复 Pencil）

### 目标

让 Pencil 能基于实验评估数据，自动发现自身缺陷并生成修复方案。不是替代人工决策，而是缩短「发现问题 → 定位根因 → 生成修复 → 验证效果」的循环。

### 三层自修复架构

```
Layer 0: 被动诊断（当前可做）
  输入: eval 表数据
  输出: 诊断报告（哪些指标异常、哪些 run 有问题）
  执行者: Pencil 自己（通过 /sal:report 或 grub 任务）

Layer 1: 主动定位（近期目标）
  输入: 诊断报告 + 源码
  输出: 根因定位（具体到文件/函数/逻辑分支）
  执行者: Pencil 读诊断报告 → 读相关源码 → 输出根因分析

Layer 2: 自动修复（远期目标）
  输入: 根因分析 + 修复约束
  输出: 修复 patch + 验证实验
  执行者: Pencil 生成修复 → 在隔离 worktree 验证 → 人工审批
```

### Layer 0: 被动诊断

Pencil 定期（或按需）从 InsForge 拉取 eval 数据，生成诊断报告。

**可诊断的问题模式：**

| 模式 | 检测方法 | 示例 |
|---|---|---|
| run 不完整 | status != completed | session_shutdown 未触发 |
| anchor 系统性 miss | 按 module 分组 hit rate < 30% | locateTask 对某类 prompt 无效 |
| recall 噪音过高 | was_injected=true 但 anchor_module 与 action 不匹配 | 无关记忆被注入 |
| 分数区分度不足 | score_final 标准差 < 0.1 | 打分公式权重需要调整 |
| 结构分缺失 | score_structural 全为 0 或 null | SAL anchor 未传递到 mem-core |
| 特定模型表现差 | 按 model 分组的 hit rate 方差大 | 某模型的 prompt 解析能力弱 |

**实现路径：**
- 写一个 `/sal:diagnose` 命令或 grub 任务
- 从 InsForge 查询最近 N 个 run 的数据
- 按上述模式检测，输出结构化诊断报告
- 诊断报告写入 `.memory-experiments/diagnostics/`

### Layer 1: 主动定位

Pencil 读取 Layer 0 的诊断报告，结合源码上下文，定位根因。

**工作流：**

```
诊断报告: "anchor hit rate 对 packages/ 下的任务只有 15%"
    ↓
Pencil 读取 sal/anchors.ts 的 locateTask 逻辑
    ↓
Pencil 分析: "prompt 中的中文关键词没有映射到 packages/ 模块的 P2 entry"
    ↓
输出: 根因 = P2 member list 的 token 与中文 prompt 的语义桥接不足
      建议 = 在 locateTask 中加入 cwd-relative 路径推断作为 fallback
```

**前置条件：**
- Layer 0 的诊断报告足够结构化（不是自然语言段落，而是 JSON）
- Pencil 能通过 tool 读取诊断文件 + 相关源码
- 根因分析输出到 `.memory-experiments/diagnostics/<issue-id>.analysis.md`

### Layer 2: 自动修复

Pencil 基于 Layer 1 的根因分析，在隔离环境中生成修复并验证。

**工作流：**

```
根因分析: locateTask 缺少 cwd fallback
    ↓
Pencil 在隔离 worktree 中生成修复 patch
    ↓
在同一 worktree 中跑相同的实验任务（重放失败案例）
    ↓
对比修复前后的指标（hit rate 是否提升）
    ↓
如果指标改善 → 输出 patch + 验证报告 → 等待人工审批
如果无改善 → 标记为 "未解决"，记录尝试过的方案
```

**关键约束：**
- 修复必须在隔离 worktree 中生成和验证，不得直接改主分支
- 必须有量化的前后对比（不能只靠 "看起来好了"）
- 人工审批是必须的——Pencil 提出修复，人决定是否采纳
- 每次修复尝试本身也是一个 eval run，形成可审计的修复历史

### 自修复闭环

```
日常使用（eval 数据持续采集）
    ↓
定期诊断（Layer 0 → 发现异常模式）
    ↓
主动定位（Layer 1 → 根因 + 建议）
    ↓
自动修复（Layer 2 → patch + 验证）
    ↓
人工审批 → merge 到 main
    ↓
新版本上线 → 日常使用 → 新的 eval 数据
    ↓
循环
```

### 从 SAL 到通用自修复

SAL 实验是第一个验证场景。如果这套闭环在 SAL 上跑通：
- anchor 命中率可以通过自修复从 28% 逐步提升
- 每次修复都有 eval 数据证明效果

那么同样的模式可以推广到：
- **Soul**: 人格漂移检测 → 定位 soul-core 的权重/衰减参数 → 自动调参
- **Memory**: 召回噪音检测 → 定位 engine-scoring 的公式权重 → 自动调参
- **工具链**: 工具调用失败率检测 → 定位 tool 实现的边界条件 → 自动修复

### 当前可执行的最小步骤

1. **Layer 0 先落地**：写 `/sal:diagnose` 命令，从 InsForge 查数据，输出结构化诊断
2. **跑一期 A/B**：积累够量的 eval 数据
3. **用 Pencil 自己分析诊断报告**：手动触发 Layer 1（不需要自动化，先走通路径）
4. **验证一次手动 Layer 2**：针对 anchor miss 问题，让 Pencil 在 worktree 中尝试修复

先证明路径可行，再逐步自动化。
