# F07: dist 9MB 构成 —— vendor 整 copy + browser 1.4MB + ai 1.5MB，无 tree-shaking

```yaml
finding_id: F07
severity: structural
lenses: [leverage, locality]
files_primary:
  - scripts/bundle-deps.js
  - extensions/defaults/browser/
  - packages/ai/src/models.generated.ts
files_secondary:
  - package.json
  - packages/ai/package.json
  - dist/
discovered_in_phase: 1
status: open
```

## Problem

发布产物 `dist/` 9.0 MB 的尺寸构成揭示几条独立浪费：

```
dist/extensions/         3.0 MB   ← 22 个 default 扩展整 copy
  └─ defaults/browser/   1.4 MB   ← 单一扩展占近一半，含 vendored Python + Browser Harness
dist/node_modules/       2.1 MB   ← vendored 内部 packages 的整目录 copy
  └─ @pencil-agent/ai/   1.5 MB   ← 主要是 models.generated.ts 14506 行
  └─ @pencil-agent/tui/  0.5 MB
  └─ @pencil-agent/agent-core/ 140 KB
dist/core/               1.8 MB
dist/modes/              1.1 MB   ← interactive god 文件 + 重复 mode skeleton
dist/packages/           0.9 MB   ← mem-core + soul-core
```

`scripts/bundle-deps.js` 的策略是**整目录 copy**（VENDOR = ai, agent-core, tui；BUNDLE = mem-core, soul-core）。没有任何 esbuild / rollup / swc 介入，意味着：

1. **零 tree-shaking** —— 比如 `@pencil-agent/ai/models.generated.ts` 14506 行包含**所有 provider × 所有 model 元数据**，但用户实际只用 1 个 provider 也付出整 1.5MB
2. **零 dead code elimination** —— ext-events 在没有凭据时返回 NoopSink（feat 1f8a47b 设计正确），但 NoopSink + InsforgeSink 两份代码都进了 dist
3. **无 mode-level split** —— interactive 7868 行哪怕 SDK 用户不用也照样 emit（与 F06 互证）
4. **`extensions/defaults/browser/` 整 1.4MB 包括 Python 源码 + CDP daemon + workspace seed** —— 即使用户从不开浏览器自动化也必须下载
5. **`dist/node_modules/@pencil-agent/*` 是 vendoring（不是 bundling）**，意味着 npm 解包时这部分文件占两份：一份在 `node_modules/@pencil-agent/...`（用户安装时 npm 拉），一份在 nano-pencil 包自己的 `dist/node_modules/`

观察：`package.json` "files" 字段：

```json
"files": ["dist/**/*.js", "dist/**/*.d.ts", "dist/**/*.json", "dist/**/*.md",
          "dist/**/*.py", "dist/**/*.html", "dist/**/*.css", "docs", ...]
```

`.py` 入选是为了 Browser Harness Python，`.html/.css` 是为了 export-html 模板。这些是**正确的**，但揭示了浏览器扩展的体积分布是**不可压缩资产**，应该改为**按需下载**而非默认捆绑。

## Deletion test

> 若 `bundle-deps.js` 换成 esbuild + tree-shaking + per-mode/per-extension entry，产物会变成什么样？

**Result**: **concentrates** —— bundle 工具本身在做实际工作，但当前的 `bundle-deps.js` "仅 copy" 策略是 **shallow**。

更精准 deletion：删 `bundle-deps.js` 的 vendor 步骤 + 改为发布时分别用 `npm pack` 各 workspace 包 + nano-pencil package.json 声明 `dependencies: { "@pencil-agent/ai": "workspace:*" }` → vendor 步骤的 2.1MB 完全 vanish（npm 自动解决 monorepo workspace 关系）。这个方向已经被 npm 7+ 的 workspace 原生支持。

## Proposed direction

**短期（< 1 周）**：

1. **拆 Browser 扩展为 opt-in**：
   - 不再默认 vendored 到 `dist/extensions/defaults/browser/`
   - 改为 `npm install -g @pencil-agent/browser-harness`（独立包）
   - `nanopencil` 启动时检测到该包就启用 browser tools，否则给出安装提示
   - 预计 `dist/` 减少 ~1.3MB

2. **`@pencil-agent/ai` lazy provider loading**：
   - `models.generated.ts` 拆成 `models-<provider>.ts` 11 个文件 + 一个动态注册器
   - 启动时按 `models.json` 已配置的 provider 动态 import
   - 预计 `models.generated.ts` 用户付出的运行时 cost 降 ~80%

3. **移除 vendor，改用 npm workspace 发布**：
   - `package.json` 把 `@pencil-agent/{ai,agent-core,tui,mem-core,soul-core}` 声明为正式 dependencies
   - 删除 `scripts/bundle-deps.js`
   - 预计 `dist/` 减少 ~3MB（vendor + bundled）

**中期（2–4 周）**：

4. **引入 esbuild 作为产物 bundler**：
   - 入口 = mode 分片（与 F06 协同）：`dist/modes/{interactive,print,rpc,acp}.js`
   - core / extensions 之间不互相 bundle 但启用 tree-shaking
   - 预计 minified 后总体可降到 ~4MB

## Benefits

- **Leverage**：
  - SDK consumers 安装时间减半；CI 缓存命中率提高（更小 tarball）
  - Browser Harness 只对真正用浏览器的用户产生成本
- **Locality**：
  - 升级 `@pencil-agent/ai` 不再需要重 build 整个 nano-pencil
  - 新增 provider 不再撞行数
- **结构性性能受益**：冷启动减小（特别是 lazy provider + mode lazy），冷启动是用户感知最强的性能轴

## Before / after sketch

```
BEFORE (9.0 MB)

  dist/
  ├── extensions/ 3.0 MB
  │     └── browser/ 1.4 MB        ← 整 Python 包 vendored
  ├── node_modules/ 2.1 MB
  │     └── @pencil-agent/ai/ 1.5 MB
  ├── core/ 1.8 MB
  ├── modes/ 1.1 MB
  └── packages/ 0.9 MB

AFTER (≈ 4.0 MB)

  dist/
  ├── extensions/ 1.6 MB           ← browser 移出，opt-in
  ├── core/ 1.8 MB (bundled)
  ├── modes/ split per-entry       ← lazy load
  └── packages/ 0.6 MB             ← mem/soul tree-shaken
  (无 vendored node_modules ── 走正式 npm dep)
```

## ADR / DIP conflict callouts

- **conflict**: `.PENCIL.md` Privacy First / Terminal First 与本 finding 不冲突；Browser 改 opt-in 反而强化了 "你只为你用的东西付出"
- **触碰 SOP §3.3 stability contract**（package "files" 字段、`bundle-deps.js`）→ 走 REVIEW，不可走 AUTO-FIX
- **触碰 `core/CLAUDE.md` "Privacy First"**？不冲突；ext-telemetry 仍然 opt-in

## References

- Methodology: leverage、locality
- Adjacent: F06（mode lazy load）、F08（CI metric "max-dist-size"）
- 工具：esbuild、rollup、tsup 任选其一
