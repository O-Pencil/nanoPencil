# UI01: P5 验收用「功能特性清单 + 验收矩阵」，非 characterization

```yaml
finding_id: UI01
severity: load-bearing
lenses: [risk, leverage]
files_primary:
  - .dev-docs/architecture-review/interactive-ui-review/feature-inventory.md
  - modes/interactive/interactive-mode.ts
files_secondary:
  - tests/characterization/
status: selected
supersedes: UI01-v1（characterization blocker，已废）
```

## Problem

P5 与 P4 的本质区别：**P4 是行为保持搬运**（AS 卡反复"byte-identical to original"），**P5 要重新评审原实现、接受重写**（Stage B 本意：重写/复用/拆分，降耦合、清冗余）。

这决定了**验收工具必须换**：

| | characterization（golden-master）| 功能验收（feature-acceptance）|
|---|---|---|
| 问 | 输出字节变了吗？ | 功能还对吗？ |
| 对重写 | **敌对** —— 每个改进都报成 diff，逼手动 bless | 友好 —— 实现随便，功能对即可 |
| 连 bug | **钉死**（连原 bug 都不许动）| 不管，只看现在对不对 |
| 适用 | Stage A 纯搬运 | **Stage B 重审+重写 ← P5** |

characterization 的设计目的是"一字节不许变"，与"我想写得更好"直接冲突。对一个**允许重写**的拆分，它会处处作对 → **不是 P5 的验收工具**。

> 注：本卡 supersede 了初版（把 characterization 定为 blocker）。初版的判断对 P4 那种 preserve 拆分成立，但对 P5 的 rewrite 拆分是错配。

## 关键权衡（必须明示）

换成功能验收，**得到重写自由，失去"自动全量保护"**：

- characterization 覆盖**一切**（含没想到的边角），代价是钉死实现。
- 功能验收只覆盖**清单里列出的功能**；**漏列的功能/边界，重写时坏了也没人报**。

→ 安全网从"工具自动兜底"变成"**功能清单有多全**"。工作量不消失，是**转移**到"把清单列全 + 每条定验收标准"。这是 maintainer **主动选择**的 trade，本卡记录在案。

## 一物两用

P5 的功能验收矩阵 = 项目早先就想要的"**功能特性清单 + 对应实现，给维护者学习追溯**"。characterization 录完是测试产物；功能清单建完是**长期文档资产**。

## Verdict — SELECTED（功能清单驱动验收，可选 hybrid preserve-check）

1. **建 [`feature-inventory.md`](../feature-inventory.md)**：从摸底的 182 方法 + import + `/command` + 键位 + overlay 反推，列全 interactive-mode 支持的功能；每条 `{ 触发方式, 预期行为(验收标准), 重写后确认 }`。
2. **重构后逐条验收功能正确**，不比对实现字节。
3. **Hybrid（建议保留）**：一簇一簇定"纯搬 vs 重写"——
   - **纯搬运**簇（如 image-pipeline、self-update）：顺手做 preserve-check（tsc + 符号 diff + 手测），几乎免费且强。
   - **重写**簇（如 slash-dispatcher 统一调度、model/auth 边界重划）：走功能验收，接受有意的内部/符号变更。

## 对 P5 出口门的影响（松绑声明）

因为接受重写：

- **V5-1 零回归** → 重述为"**功能清单逐条验收通过**"（非字节级 golden）。
- **V5-3 符号不变** → 松绑为"**有意符号变更须在卡/Phase 显式声明**（GB-2）"，不再要求 diff 为空。
- 验收强度 = **功能清单完整度**（本卡的核心风险点）。

## Decision Criteria

- 功能清单覆盖全部 `/command` + 键位 + overlay + 渲染特性 + 自更新（完整度是命门）。
- 每条有可判定的验收标准（触发 → 预期），重写后逐条确认。
- hybrid 边界（纯搬/重写）逐簇在评审中显式标注。
- 有意符号/行为变更显式声明（GB-2），不靠"碰巧没变"。

## References

- 起源讨论：Stage B「重写还是复用」；早先「功能特性清单 + 实现，给维护者」诉求
- 产出：[feature-inventory.md](../feature-inventory.md)
- Gate：[gates.md](../gates.md) UI-G4（重述为功能验收）
- 摸底：[P5 §现状摸底](../../execution-plan/P5-ui-split.md#现状摸底2026-06-02)
