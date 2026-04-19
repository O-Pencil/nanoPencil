# Run-003: cross-module-config · 实验报告

## 任务目标
- **R1:** 添加 `--quiet` CLI flag 解析到 cli.ts，存入 settings，并在 interactive mode startup 中生效
- **R2:** 基于 R1，将 `--quiet` 扩展到 print 和 ACP mode，添加 smoke test 验证端到端功能

## 执行概况

| 轮次 | 变体 | 改动文件 | 改动量 | 核心策略 |
|------|------|---------|--------|---------|
| **R1** | Control (`--nosal`) | `cli/args.ts`, `main.ts`, `interactive-mode.ts` | +35/-23 | `--quiet` flag 定义、解析、interactive mode 生效 |
| **R1** | Sal (默认) | `cli/args.ts`, `main.ts`, `interactive-mode.ts` | +35/-13 | 几乎相同的 `--quiet` flag 实现，复用了 quietStartup 设置 |
| **R2** | Control | `cli/args.ts`, `main.ts`, `interactive-mode.ts` | +41/-23 | 增加了 smoke test 脚本 + ACP 模式 quiet 支持 |
| **R2** | Sal | 0 文件 | 0 | **零增量** — 与 R1 完全相同 |

## 关键差异

**Control R1 → R2 增量:**
- 新增 `scripts/verify-quiet.sh` smoke test 脚本
- main.ts 增加了 ACP mode 的 quiet 支持
- 尝试修复 smoke test 中的 bug（`set -e` + grep 问题）

**Sal R1 → R2 增量:**
- ❌ 没有任何新增代码变更
- Sal 在 R2 中似乎卡在了分析阶段，没有产出任何新的代码改动

## 质量对比

| 维度 | Control | Sal |
|------|---------|-----|
| R1 代码质量 | ✅ 完整的 flag 实现 | ✅ 同样的完整实现 |
| R2 增量 | ✅ smoke test + ACP 支持 | ❌ 零增量 |
| R2 测试意识 | ✅ 写了验证脚本（虽然没完全修好） | ❌ 没有测试意识 |
| 跨模式覆盖 | ✅ interactive + print + ACP | ⚠️ 仅 interactive |

## 观察
1. **R1 两个变体几乎一样** — 说明对于"加 CLI flag"这种明确任务，SAL 没有带来明显差异
2. **Control R2 有增量** — 延续了 R1 的工作，加了 smoke test 和 ACP 支持
3. **Sal R2 完全没增量** — 和之前的 pattern 一致，SAL 在多轮任务中更容易卡在分析阶段
4. **smoke test 有 bug** — Control 写的验证脚本有 `set -e` + grep 的兼容性问题，但至少有测试意识

## 已留存
```
.memory-experiments/runs/run-003/ (~14MB)
├── control-round1.patch (6KB)
├── control-round2.patch (8KB)
├── sal-round1.patch (6KB)
├── sal-round2.patch (6KB, same as R1)
├── *.files.txt (各轮改动文件列表)
├── *-output.log (原始输出日志)
├── control/memory/ (完整)
└── sal/memory/ (完整)
```
