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

## 4. 标准执行流程

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

## 5. 如何保存代码变更内容

### 5.1 最小留存（必做）

```bash
git -C "$CTRL_WS" diff > "$ROOT/control.patch"
git -C "$SAL_WS" diff > "$ROOT/sal.patch"
git -C "$CTRL_WS" diff --name-only > "$ROOT/control.files.txt"
git -C "$SAL_WS" diff --name-only > "$ROOT/sal.files.txt"
```

### 5.2 可复现留存（推荐）

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

### 5.3 结构化证据（配合代码补丁）

每个 run 至少保留：

1. `eval_runs`
2. `eval_turns`
3. `eval_sal_anchors`
4. `eval_memory_recalls`
5. control/sal memory 快照

---

## 6. 实验后清理

```bash
git worktree remove "$CTRL_WS"
git worktree remove "$SAL_WS"
```

可选：仅删除 worktree，不删除 run artifacts。

---

## 7. 一次实验是否必须跑两次任务

正常开发不需要同任务重复执行；  
但 A/B 实验的本质就是控制变量比较，因此必须执行 control 与 sal 两组。

建议把它视为“实验成本”，而不是日常开发流程。

---

## 8. 判废条件

出现以下任一情况，该 run 建议判废：

1. control 与 sal 不是同一 `BASE_COMMIT`
2. task prompt 有实质差异
3. model/thinking 配置不一致
4. 两组共享了 workspace 或 memory dir
5. 没有保留 patch 与 eval 证据
