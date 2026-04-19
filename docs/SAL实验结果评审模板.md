# SAL 实验结果评审模板

> Type: Review Template  
> Status: Active  
> Scope: SAL A/B 实验结果复盘与汇总结论  
> Purpose: 用统一模板评估 control / sal 两组结果，降低主观波动，保留独立评审视角

## 1. 使用原则

这份模板用于**实验完成后**的结果评审，不用于实验执行。

评审顺序固定为：

1. 先看自动指标
2. 再看代码补丁
3. 最后做综合结论

评审原则：

1. 执行实验的 agent 不做最终裁判
2. 优先看可量化证据，再看主观判断
3. 代码结果与行为轨迹分开评
4. 尽量先盲评 patch，再揭示 control / sal 身份

---

## 2. 单个实验结果总表

每个 task family 建议单独填写一份。

```text
Run ID:
Task Family:
Commit:
Model:
Thinking:
Reviewer:
Review Date:

Variant A:
Variant B:

任务描述:
Round 1:
Round 2:
```

---

## 3. 自动指标表

以下指标应优先来自 artifacts / eval 数据，而不是人工印象。

### 3.1 行为指标

```text
| Metric | Control | SAL | Better | Notes |
|--------|---------|-----|--------|-------|
| time_to_target |  |  |  |  |
| search_noise |  |  |  |  |
| task_anchor_hit_rate |  |  |  |  |
| action_anchor_precision |  |  |  |  |
| recall_relevance |  |  |  |  |
| recall_noise_ratio |  |  |  |  |
| follow_up_reuse |  |  |  |  |
| high_rank_injection_effectiveness |  |  |  |  |
```

### 3.2 结果指标

```text
| Metric | Control | SAL | Better | Notes |
|--------|---------|-----|--------|-------|
| patch_concentration |  |  |  |  |
| blast_radius |  |  |  |  |
| total_files_touched |  |  |  |  |
| total_turns_to_completion |  |  |  |  |
| tests_added_or_updated |  |  |  |  |
| validation_evidence |  |  |  |  |
```

---

## 4. Patch 盲评模板

建议在不知道哪份是 control / sal 的前提下，先对两份 patch 做判断。

```text
Patch Blind Review

Patch A:
- correctness confidence:
- change concentration:
- regression risk:
- maintainability:
- unnecessary edits:
- likely keep? yes / no / maybe

Patch B:
- correctness confidence:
- change concentration:
- regression risk:
- maintainability:
- unnecessary edits:
- likely keep? yes / no / maybe
```

盲评结束后再揭示：

```text
Patch A = control / sal
Patch B = control / sal
```

---

## 5. 人工评审 Rubric

每项 1 到 5 分。

### 5.1 行为层

```text
| Dimension | Control | SAL | Notes |
|-----------|---------|-----|-------|
| 定位速度 |  |  |  |
| 搜索噪音控制 |  |  |  |
| recall 相关性 |  |  |  |
| follow-up 复用 |  |  |  |
```

### 5.2 结果层

```text
| Dimension | Control | SAL | Notes |
|-----------|---------|-----|-------|
| correctness |  |  |  |
| patch 集中度 |  |  |  |
| 回归风险 |  |  |  |
| 可维护性 |  |  |  |
| 测试/验证支持 |  |  |  |
```

---

## 6. 单任务结论模板

```text
Single Task Verdict

Behavior Winner:
Result Winner:

Overall Verdict:
- SAL clearly better
- SAL neutral
- SAL worse
- inconclusive

Why:
1.
2.
3.

Would I keep the SAL-side code result if this were a real feature?
- yes
- no
- partially

If partially, what would I keep:
```

---

## 7. 三个实验汇总模板

当三个 task family 都完成后，再做这一层汇总。

```text
Experiment Suite Summary

Task 1:
- verdict:
- strongest signal:
- weakest signal:

Task 2:
- verdict:
- strongest signal:
- weakest signal:

Task 3:
- verdict:
- strongest signal:
- weakest signal:
```

### 7.1 跨任务一致性总结

```text
Cross-Task Consistency

哪些指标在三个任务中都改善了？
- 

哪些指标只在特定任务类型中改善？
- 

哪些指标波动大，说明当前 SAL 还不稳定？
- 
```

### 7.2 最终结论模板

```text
Final Conclusion

SAL currently helps most on:
- 

SAL is currently neutral on:
- 

SAL is currently weakest on:
- 

Current recommendation:
- continue investment
- narrow scope
- keep as experimental
- pause and revisit

Evidence basis:
1.
2.
3.
```

---

## 8. 建议优先使用的最小指标集

如果你想先把评审流程跑通，不必一开始把所有指标都填满。

建议先固定这 6 个：

1. `time_to_target`
2. `search_noise`
3. `task_anchor_hit_rate`
4. `follow_up_reuse`
5. `patch_concentration`
6. `correctness`

这 6 个已经足够支撑第一轮 SAL 结果判断。
