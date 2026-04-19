# Run-001: startup-performance · 实验报告

## 任务目标
- **R1:** 调查包体积和可读性痛点，实施一个低风险的可逆优化，提供 npm pack 大小对比
- **R2:** 基于 R1 发现，在 dev/test 源码层改善可读性，同时保持 release 行为不变

## 执行概况

| 轮次 | 变体 | 改动文件 | 改动量 | 核心策略 |
|------|------|---------|--------|---------|
| **R1** | Control (`--nosal`) | `packages/mem-core/package.json` | -1 行 | 移除 mem-core 的 `"src"` from files |
| **R1** | Sal (默认) | `package.json` (根) | -1 行 | 移除根包的 `"docs"` from files |
| **R2** | Control | `packages/mem-core/package.json` | +9/-2 行 | 添加 `"./src/*"` export + `"source"` 字段 + 验证脚本 |
| **R2** | Sal | **6 文件** | **+182/-124 行** | 完整的 dev/release 双路径构建系统 |

## Round-2 关键差异

**Control R2 — 包级 dev 导出:**
- 添加 `"source": "./src/index.ts"` 和 `"./src/*"` exports 到 mem-core
- 添加 `validate-release` 和更新 `prepublishOnly`
- **未产出**: `tsconfig.test.json` 和 `scripts/validate-release.mjs`（超时未完成）

**Sal R2 — 全项目构建系统改造:**
1. **根 `package.json`**: 新增 `build:dev`、`build:dev:deps`、`verify:release` 脚本；`prepublishOnly` 增加 release 验证
2. **3 个子包** (`agent-core`, `ai`, `tui`): 添加 `build:dev` 使用 `tsconfig.dev.json`
3. **`bundle-deps.js`**: 打包时跳过 `src/` 目录（减少 release 包体积）
4. **`models.generated.ts`**: 重新生成（284 行变化）

## 对比分析

| 维度 | Control | Sal |
|------|---------|-----|
| R1→R2 增量 | ✅ 基于 R1 扩展（移除 src + 添加 src export） | ✅ 基于 R1 扩展（移除 docs + 完整构建系统） |
| 改动范围 | 1 文件（mem-core） | 6 文件（根+子包+脚本+生成文件） |
| 代码行数 | +9/-2 | +182/-124 |
| 可逆性 | ✅ 一行改回 | ✅ 脚本可单独移除 |
| Release 兼容 | ✅ `src/` 不在 files 数组 | ✅ `bundle-deps.js` 跳过 src，verify:release 验证 |
| Dev 可读性 | 部分（仅 mem-core） | **完整**（全项目 dev/release 分离） |

## 观察
1. **Sal R2 远超预期** — 不是简单修修补补，而是设计了完整的 dev vs release 双路径架构
2. **Control R2 未完全完成** — 有设计但缺了 tsconfig 和验证脚本文件
3. **两个变体都正确继承了 R1 memory** — 都在 R1 的基础上做扩展，没有推翻重来

## 已留存
```
.memory-experiments/runs/run-001/ (14MB)
├── control-round1.patch (284B)
├── control-round2.patch (1.5KB)
├── sal-round1.patch (245B)
├── sal-round2.patch (21KB) ← 最大改动
├── *.files.txt (各轮改动文件列表)
├── *-output.log (原始输出日志)
├── control/memory/ (完整)
└── sal/memory/ (完整)
```
