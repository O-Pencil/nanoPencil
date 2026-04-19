# Run-002: package-footprint-readability · 实验报告

## 任务目标
- **R1:** 诊断并优化 startup 延迟，建立 reproducible startup timing baseline
- **R2:** 将优化模式扩展到 print/rpc/acp 启动路径，添加回归检查或 timing 脚本

## 执行概况

| 轮次 | 变体 | 改动文件 | 改动量 | 核心策略 |
|------|------|---------|--------|---------|
| **R1** | Control (`--nosal`) | 3 文件 | +36/-19 | timing 插桩 (NANOPENCIL_TIMING=1) |
| **R1** | Sal (默认) | 2 文件 | +13/-1 | 修复 `--no-extensions` bug + 复用已有 timings.js |
| **R2** | Control | 1 文件 | +9/-2 | 添加 `"./src/*"` export + `"source"` 字段 + 验证脚本 |
| **R2** | Sal | **3 文件** | **+35/-13** | 完整的 dev/release 双路径构建系统 |

## Round-2 关键差异

**Control R2:**
- 新增 `scripts/verify-quiet.sh` smoke test 脚本
- main.ts 增加了 ACP mode 的 quiet 支持
- 尝试修复 smoke test 中的 bug（`set -e` + grep 问题）

**Sal R2:**
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
.memory-experiments/runs/run-002/ (~14MB)
├── control-round1.patch (6KB)
├── control-round2.patch (8KB)
├── sal-round1.patch (6KB)
├── sal-round2.patch (6KB, same as R1)
├── *.files.txt (各轮改动文件列表)
├── *-output.log (原始输出日志)
├── control/memory/ (完整)
└── sal/memory/ (完整)
```
