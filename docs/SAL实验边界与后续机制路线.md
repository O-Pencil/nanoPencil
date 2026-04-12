# SAL 实验边界与后续机制路线

> Type: Experimental Boundary Note
> Status: Active
> Scope: Current SAL evaluation boundary and future experiment mechanism roadmap
> Purpose: Keep the current experiment runnable without letting experimental infrastructure become a hard dependency of product code

## 1. 当前结论

当前阶段的目标不是把整套实验 runner 和评分机制完全产品化。

当前阶段只要求满足两件事：

1. SAL 对比实验可以在仓库内实际跑通
2. 实验本身不会影响源码主功能和正常使用

也就是说，当前优先级是：

- 实验可执行
- 实验结果可落盘
- 源码运行不受实验流程干扰

而不是：

- 一次性做完整实验平台
- 把实验逻辑深度耦合进主运行链路

---

## 2. 当前边界定义

### 2.1 什么叫“实验和源码解耦”

当前语境下，“解耦”的定义是：

- 不跑实验时，主程序功能、默认交互、发布行为不受影响
- 删除实验文档、实验报告脚本、实验模板，不会破坏主产品功能
- 实验数据只写入 `.memory-experiments/` 或显式指定的实验目录
- 实验分析基于导出的 artifacts，而不是修改正常业务路径

### 2.2 当前允许的最小耦合

以下耦合在当前阶段是可以接受的：

- SAL 增加可选 flag，例如 `--experiment-id`
- SAL 在开启实验时把 anchors 写到 run-local 目录
- 离线脚本读取 memory / anchors 生成 report

原因：

这类耦合是“可选实验输出能力”，不是“主功能运行依赖”。

### 2.3 当前不应该继续做的事

以下内容不属于当前必须落地：

- 把完整实验 runner 深度接到主 CLI 命令树
- 为实验引入复杂的新运行模式
- 让主产品逻辑依赖实验报告生成器
- 让 NanoMem 或 SAL 为实验机制重构自身核心数据流

这些工作可以做，但应该作为后续机制化阶段，而不是当前交付边界。

---

## 3. 当前可接受的实验形态

当前推荐实验形态是：

- 同一源码提交
- control 与 SAL 使用隔离 memory 目录
- SAL 使用可选 `experiment-id` 输出 run-local anchors
- 实验结果由离线脚本生成 variant report / compare report / scorecard

这意味着当前实验流程可以是：

1. 在当前源码提交上准备任务文件
2. 分别运行 control 和 SAL
3. 把 artifacts 收敛到 `.memory-experiments/runs/<run-id>/`
4. 使用离线报告脚本生成报告
5. 人工阅读 compare report 做判断

这个流程已经足够支持实验评估。

---

## 4. 当前实现应该坚持的约束

### 4.1 主链路无实验强依赖

主链路必须保持：

- 不传 `--experiment-id` 也能正常运行
- 不存在 `.memory-experiments/` 也能正常运行
- 不执行实验报告脚本也能正常运行

### 4.2 实验输出只增不侵入

当前实验相关实现只应该做“附加输出”，不应该改变主要行为。

例如：

- SAL anchor 可以多写一份到 run-local 目录
- 但不能为了实验改变正常任务执行逻辑
- 报告脚本可以读取 memory
- 但不能要求 memory 只能按实验模式运行

### 4.3 报告生成器是离线工具

报告生成器的定位应该明确：

- 是实验辅助工具
- 不是主运行时的一部分
- 不参与正常会话流程
- 不参与正常产品功能判定

---

## 5. 当前阶段已经足够的能力

只要具备以下能力，就可以认为“当前实验可跑通，且不会影响源码”：

1. 有 control / SAL 两组隔离 memory
2. 有 run-local anchors 能力
3. 有统一的 report / scorecard 生成能力
4. 有任务模板和实验文档

当前阶段不要求：

- 一条命令自动跑完整个实验
- 自动创建隔离 workspace
- 自动执行多轮任务
- 自动汇总 touched files / transcript / diff

这些属于未来机制完善方向。

---

## 6. 当前实验建议工作流

建议工作流如下：

### Step 1

保持当前源码在一个明确 commit 上，不切长期实验分支。

### Step 2

准备任务文件和 `run-id`。

### Step 3

分别运行：

- control: `--nosal`
- sal: 默认 SAL

并把 memory、anchors、round data 收敛到：

```text
.memory-experiments/runs/<run-id>/
```

### Step 4

执行离线报告脚本生成：

- variant report
- compare report
- scorecard

### Step 5

人工复核 compare report，确认实验是否有效。

---

## 7. 为什么当前做法足够安全

因为当前实验能力的主要组成部分都属于以下类型：

- 文档
- 测试模板
- 离线脚本
- 可选 flag

这些东西即使未来全部删除，也不会破坏主产品功能。

从工程角度看，这已经满足：

- 实验能力存在
- 产品功能不依赖实验能力

所以当前边界是合理的。

---

## 8. 后续机制化方向

后续如果要把实验做成完整机制，建议分阶段推进。

### Phase A: 现阶段

目标：

- 实验可跑
- 实验可比
- 不影响源码

交付：

- task template
- run-local anchors
- report generator
- compare scorecard

### Phase B: 半自动化

目标：

- 降低人工整理成本

建议增加：

- run manifest
- round result schema
- transcript export
- patch export
- touched files export

### Phase C: 机制化 runner

目标：

- 一条命令完成整个实验

建议增加：

- detached workspace runner
- task-file driven orchestration
- control / SAL 自动执行
- 自动 compare report 生成

### Phase D: 稳定实验接口

目标：

- 实验机制不再依赖当前内部文件结构

建议增加：

- artifact schema versioning
- stable export contract
- recorder abstraction
- report generator 只消费标准导出格式

---

## 9. 当前与未来的明确分界

当前应该做的是：

- 保证实验能跑通
- 保证结果能归档
- 保证源码主功能不被实验机制绑架

当前不应该强行做的是：

- 完整实验平台产品化
- 实验 runner 与主 CLI 深耦合
- 围绕实验去改主系统核心架构

这个分界要明确。

否则实验基础设施会反过来拖慢产品演进。

---

## 10. 对当前工作的判断标准

如果满足以下判断，就说明当前阶段已经做对了：

- 我可以做 control vs SAL 对比实验
- 我可以保存实验 artifacts
- 我可以生成统一报告
- 我不跑实验时，源码功能完全正常

只要这 4 条成立，当前阶段就达标。

---

## 11. 建议结论

当前建议是：

- 继续保留实验相关能力
- 但把它们定位成“实验辅助层”
- 不再把“完整机制化 runner”当作当前阻塞项
- 把后续完善工作收敛在文档和路线图中

换句话说：

当前应以“可跑且不扰动源码”为完成标准。

未来再以“机制化、可复现、低维护成本”为下一阶段目标。
