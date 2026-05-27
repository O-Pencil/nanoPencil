# F08: 自身 quality rule 与实现严重背离，缺 CI 守门

```yaml
finding_id: F08
severity: opinionated
lenses: [DIP]
files_primary:
  - core/CLAUDE.md
  - core/runtime/CLAUDE.md
  - scripts/verify-dip.ts
files_secondary:
  - package.json
  - .github/workflows/
discovered_in_phase: 1
status: open
```

## Problem

`core/CLAUDE.md §Quality Rules` 自己写下了硬性规则：

> - Single file limit: ~400 lines for complex modules
> - Directory file limit: ~15 files per subdirectory
> - **No circular dependencies between modules**
> - All public APIs must have JSDoc

实际：

| 规则 | 实际 |
|------|------|
| Single file ≤ 400 lines | 至少 12 个文件 ≥ 1000 行；`interactive-mode.ts` 7868（19.6×），`agent-session.ts` 3408（8.5×） |
| Directory file ≤ 15 | `extensions/defaults/` 22 个子目录、`modes/interactive/components/` 47 个文件 |
| No circular deps | madge 报告至少 **5 个真环**（F03 + F04） |
| Public APIs JSDoc | 大部分有 P3 头，但 `core/extensions/types.ts` 1446 行类型缺乏聚集 JSDoc |

DIP verifier 通过（445/445 P3、30 P2 全绿）但**只验证了文档存在性，没有验证规则本身**。这是典型的"map verifies itself but not against terrain"。

观察：

1. 这本身**不是 finding 的核心** —— F01/F02/F03/F04 已经是这些规则被违反的具体表现
2. 真正的 finding 是：**没有任何自动化机制把这些规则提升为 CI 守门** —— 任何新增的违反在 PR 阶段都不可见
3. `scripts/verify-dip.ts` 已经是 CI-friendly（read-only 7s 跑完），但**只查文档结构**，不查上面这 4 条 quality rule
4. 既然 maintainer 已经接受了"diagnosis 走 PR + 维护者 review"，这条 finding 就是这个治理模式的自然延伸

## Deletion test

> 删除 `core/CLAUDE.md §Quality Rules` 整段？

**Result**: **complexity stays roughly the same**（代码不会变），但**信号也消失了** —— 没人再能 cite 这些数字。**inconclusive**，所以本 finding 严重度降为 `opinionated`。

→ 这意味着推荐**不是删规则**，而是**把规则提升为 CI 校验**，否则它们是死字。

## Proposed direction

扩展 `scripts/verify-dip.ts`（或独立 `scripts/verify-quality.ts`），加入 4 项校验：

```ts
// scripts/verify-quality.ts (new)
const RULES = {
  maxFileLines: 400,
  maxFileLinesHardCap: 1500,    // 超过此值 fail；400-1500 之间 warn
  maxFilesPerDir: 15,
  forbidCycles: true,
  exceptions: {
    "packages/ai/src/models.generated.ts": "generated",
    "core/extensions/types.ts": "deprecated-monolith; tracked by F05",
    // ...
  },
};
```

CI 集成：

- 加 GitHub Actions workflow（参考已有的 `charter-sync-notify.yml` 风格）
- PR 触发；warn 时评论 PR，fail 时阻断 merge
- 与现有 `wiki:verify` 并行

**例外清单的关键作用**：让 F01–F07 描述的"已知大文件"成为**有期限的债**，每次 PR 时显示倒计时；新增违反不在白名单里就 fail。

## Benefits

- **Leverage**：把死字（charter）变成活的守门员；不需要 maintainer 在 review 时人工记忆 4 条规则
- **Locality**：所有规则违反在 PR 状态栏可见，不需要打开 `core/CLAUDE.md`
- **作为 F01–F07 的"棘轮"**：实施完 F01 拆分后，把例外白名单条目删除；新增违反者会立即被 CI 拦截 → 防止架构债再次累积

**不直接 leverage 提升**：本 finding 不修任何代码 friction；它是**防回归层**。所以严重度是 opinionated 而非 structural/load-bearing。

## Before / after sketch

```
BEFORE                              AFTER

CLAUDE.md §Quality Rules            CLAUDE.md §Quality Rules
   ↓ 规则只是文字                       ↓ 规则可执行
                                    scripts/verify-quality.ts
                                    .github/workflows/quality.yml
                                       ↓ PR 自动评论 / 失败
                                    例外白名单 = 架构债 ledger
```

## ADR / DIP conflict callouts

无；本 finding 是在已有 DIP 守门体系上加一层。

## References

- Methodology: DIP isomorphism
- Existing tool: `scripts/verify-dip.ts`、`scripts/llm-wiki.ts`
- Adjacent: F01–F07 全部（本 finding 是它们的防回归层）
