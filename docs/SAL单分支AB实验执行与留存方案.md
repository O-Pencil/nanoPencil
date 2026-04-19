# SAL 单分支 A/B 实验执行与留存方案

> Type: Experiment Playbook  
> Status: Active  
> Scope: 代码改动型任务的 control/sal 对照实验  
> Purpose: 在一个专用分支内完成 A/B 实验，同时完整保留两组代码变更证据

## 1. 目标与结论

对于“会改代码”的 SAL 对照实验，**一个专用分支可以完成**，不需要长期维护多条实验分支。

关键做法不是“多分支”，而是：

1. 固定同一 `BASE_COMMIT`
2. control/sal 使用双 worktree 隔离执行
3. 将两组结果统一归档到同一 run 目录

---

## 2. 为什么不能只靠对话

代码改动型实验如果只看对话，会有三类问题：

1. 无法确认真实代码改动范围
2. 无法复盘 recall/anchor 与补丁结果是否一致
3. 无法对比两组改动质量（集中度、返工、噪音）

因此实验结论必须基于 artifacts（补丁、memory、eval 表数据）。

---

## 3. 单分支执行模型

### 3.1 角色划分

1. 专用实验分支：只存放实验任务定义、流程文档、结果归档规范。
2. 双 worktree：
   - `control`：`--nosal`
   - `sal`：默认开启 SAL

### 3.2 基本原则

1. same-commit
2. same-task
3. same-model
4. isolated workspace
5. isolated memory dir

---

## 4. 实验前检查清单

正式开始实验前，必须先确认以下条件：

1. **运行入口已固定**  
   两组必须使用同一种运行方式。要么都使用全局安装的 `pencil`，要么都在 worktree 内使用同一个本地源码入口。不能一组跑发布版，一组跑源码版。

2. **任务文本已固化到文件**  
   control 与 sal 必须读取同一个任务文件中的同一轮 prompt，不能靠人工复制后临时改写。

3. **模型与主要参数一致**  
   model、thinking、tools、扩展集必须保持一致。

4. **eval 上报已启用**  
   若需要保留 `eval_runs / eval_turns / eval_sal_anchors / eval_memory_recalls`，则必须提前配置好 `NANOPENCIL_EVAL_*` 或对应 credentials。只设置 `NANOMEM_MEMORY_DIR` 不能产生完整上报数据。

5. **run-id 已明确**  
   control 与 sal 应使用同一个实验 run 的命名体系，例如：
   - `RUN_ID=run-001`
   - `NANOPENCIL_EVAL_RUN_ID=$RUN_ID-control`
   - `NANOPENCIL_EVAL_RUN_ID=$RUN_ID-sal`

6. **基线提交已冻结**  
   在创建 worktree 前记录 `BASE_COMMIT`，实验中途不得切换代码基线。

只有满足以上 6 项，实验结果才具有可比性。

---

## 5. 标准执行流程

```bash
# 0) 固定基线
BASE_COMMIT=$(git rev-parse HEAD)
RUN_ID=run-001
ROOT=$PWD/.memory-experiments/runs/$RUN_ID
CTRL_WS=/tmp/np-exp-$RUN_ID-control
SAL_WS=/tmp/np-exp-$RUN_ID-sal

# 1) 建双 worktree
git worktree add --detach "$CTRL_WS" "$BASE_COMMIT"
git worktree add --detach "$SAL_WS" "$BASE_COMMIT"

# 2) 建隔离目录
mkdir -p "$ROOT/control/memory" "$ROOT/sal/memory" "$ROOT/compare"

# 3) 跑 control
cd "$CTRL_WS"
NANOMEM_MEMORY_DIR="$ROOT/control/memory" \
NANOPENCIL_EVAL_RUN_ID="$RUN_ID-control" \
NANOPENCIL_EVAL_VARIANT=control \
pencil --nosal "<TASK PROMPT>"

# 4) 跑 sal
cd "$SAL_WS"
NANOMEM_MEMORY_DIR="$ROOT/sal/memory" \
NANOPENCIL_EVAL_RUN_ID="$RUN_ID-sal" \
NANOPENCIL_EVAL_VARIANT=sal \
NANOPENCIL_EXPERIMENT_ID="$RUN_ID" \
pencil "<TASK PROMPT>"
```

---

## 6. 如何保存代码变更内容

### 6.1 最小留存（必做）

```bash
git -C "$CTRL_WS" diff > "$ROOT/control.patch"
git -C "$SAL_WS" diff > "$ROOT/sal.patch"
git -C "$CTRL_WS" diff --name-only > "$ROOT/control.files.txt"
git -C "$SAL_WS" diff --name-only > "$ROOT/sal.files.txt"
```

### 6.2 可复现留存（推荐）

如果你希望后续“可直接重放某组改动”，建议在 worktree 内做临时提交并导出 patch：

```bash
# control
git -C "$CTRL_WS" add -A
git -C "$CTRL_WS" commit -m "exp(control): $RUN_ID"
git -C "$CTRL_WS" format-patch -1 --stdout > "$ROOT/control.commit.patch"

# sal
git -C "$SAL_WS" add -A
git -C "$SAL_WS" commit -m "exp(sal): $RUN_ID"
git -C "$SAL_WS" format-patch -1 --stdout > "$ROOT/sal.commit.patch"
```

说明：

1. 这些提交只存在临时 worktree，不会污染主分支。
2. 归档 `*.commit.patch` 后，删除 worktree 即可。

### 6.3 结构化证据（配合代码补丁）

每个 run 至少保留：

1. `eval_runs`
2. `eval_turns`
3. `eval_sal_anchors`
4. `eval_memory_recalls`
5. control/sal memory 快照

---

## 7. 实验后清理

```bash
git worktree remove "$CTRL_WS"
git worktree remove "$SAL_WS"
```

可选：仅删除 worktree，不删除 run artifacts。

---

## 8. 需要保留实验结果时如何处理

默认情况下，A/B 实验运行应被视为“实验运行”，而不是直接进入主线的正式开发提交。

推荐分两步处理：

### 8.1 默认策略：先留证据，不直接合入

先保留：

1. `control.patch`
2. `sal.patch`
3. `*.files.txt`
4. `*.commit.patch`（如果做了临时提交）
5. memory 快照与 eval 表数据

这样你可以先完成对比评估，再决定哪一组值得保留。

### 8.2 晋升策略：只提取一组最优结果

如果实验后确认某一组结果值得保留：

1. 不要把 `exp(control)` 和 `exp(sal)` 两组实验提交都合进主线。
2. 只选择一组最优结果（通常是 `sal` 或 `control` 中的一组）。
3. 回到实验分支或新整理分支，将该组 patch 单独应用并重新验证。
4. 使用正式业务提交信息重新提交，而不是保留实验提交名。

示例：

```bash
# 以 sal 结果为例
git apply "$ROOT/sal.commit.patch"
git add -A
git commit -m "fix(startup): reduce extension bootstrap overhead"
```

### 8.3 原则

1. 实验提交用于留证，不用于直接发布。
2. 正式合入只保留一组最优改动。
3. 正式合入前必须重新验证，不直接把实验 patch 当成最终产物。

---

## 9. 多轮任务的 Memory 继承

当任务包含多轮（如 round-1 + round-2）时，每组必须独立继承自己的 memory：

- **control round-2** 继承 **control round-1** 的 memory 目录
- **sal round-2** 继承 **sal round-1** 的 memory 目录

**严禁**跨组继承（sal round-2 读 control round-1 的 memory），否则变量不再隔离。

推荐执行顺序与 memory 流向：

```
control round-1  →  control round-2
   (MEMORY_DIR=$ROOT/control/memory)

sal round-1      →  sal round-2
   (MEMORY_DIR=$ROOT/sal/memory)
```

每轮 round-2 启动时，对应 memory 目录已包含 round-1 沉淀的记忆。这正是 follow-up 评估的核心：**同组 round-1 经验是否被正确复用**。

---

## 10. 多个任务族如何组织运行

任务集中的多个 task family 可以放在**同一个实验分支**中执行，但**不应在同一个 run 目录或同一对 worktree 中连续混跑**。

推荐做法是：

1. 一个 task family 对应一个独立 `RUN_ID`
2. 一个 `RUN_ID` 对应一对独立 worktree
3. 跑完一个任务族并归档后，再开始下一个任务族

示例：

```text
startup-performance        -> run-startup-001
package-footprint         -> run-package-001
cross-module-config       -> run-config-001
```

这意味着：

1. 三个任务族可以都在 `experiment/sal-ab-comparison` 分支上跑
2. 但它们应当是三次独立实验，不是一次 run 里串起来执行
3. 每个任务族都应独立保留自己的 patch、memory、eval 数据

---

## 11. 一次实验是否必须跑两次任务

正常开发不需要同任务重复执行；  
但 A/B 实验的本质就是控制变量比较，因此必须执行 control 与 sal 两组。

建议把它视为”实验成本”，而不是日常开发流程。

---

## 12. 判废条件

出现以下任一情况，该 run 建议判废：

1. control 与 sal 不是同一 `BASE_COMMIT`
2. task prompt 有实质差异
3. model/thinking 配置不一致
4. 两组共享了 workspace 或 memory dir
5. 没有保留 patch 与 eval 证据
