# nanoPencil 性能与体积基线

> HEAD = `d35dd04` (1.13.14) · Node v22.22.1 · 2026-05-04
> 本文是 `docs/project-structure-optimization.md` 的 Phase 0 度量产物。
> 三个优化目标：**包体积** / **包架构** / **启动性能**。

---

## TL;DR

| 目标 | 当前值 | 主要矛盾 |
|---|---|---|
| 包体积 | tarball **1.7 MB** / 解压 7.4 MB / dist 9.4 MB | `dist/extensions/defaults/browser` 1.8 MB（含 1.6 MB 数据资源），`@sinclair/typebox` 845 文件，`@pencil-agent/ai` vendored 1.6 MB |
| 包架构 | core 中混杂 export-html (288 KB)、TUI 在 cli boot 路径 eager 加载 | core/extensions 边界不清；模式/扩展 eager-import |
| 启动性能 | **冷启动到 main_entry = 15.9 s** | `cli.js → main.js` 静态导入图 = **2 457 个模块** 的解析+编译 |

→ 三个目标里，启动性能问题最严重；包体积是次要矛盾；包架构是这两件事的根因之一。

---

## 1. 包体积 (Bundle Size)

### 1.1 总量

| 指标 | 数值 |
|---|---|
| `npm pack --dry-run` 打包后 (gzip) | **1.7 MB** |
| 解压安装后 | **7.4 MB** |
| 文件数 | 943 |
| `dist/` 总大小 | 9.4 MB |

### 1.2 dist 子目录 Top 5

| 子目录 | 大小 | 占比 | 说明 |
|---|---|---|---|
| `dist/extensions/defaults/browser/` | **1.8 MB** | 19% | 内含 `agent-workspace/domain-skills/` 1.6 MB（数据，非代码） |
| `dist/core/` | 1.8 MB | 19% | 含 export-html 288 KB |
| `dist/node_modules/@pencil-agent/ai/` | 1.6 MB | 17% | vendored AI SDK |
| `dist/modes/` | 1.2 MB | 13% | interactive 占 964 KB（含 components 592 KB） |
| `dist/packages/mem-core/` | 676 KB | 7% | |
| 其余（cli/utils/extensions 其余/main） | ~2.4 MB | 25% | |

### 1.3 体积优化候选

| # | 行动 | 估算节省 | 难度 |
|---|---|---|---|
| B1 | browser 的 `domain-skills/` 数据资源拆出，按需下载或独立 npm 包 | -1.6 MB tarball 中相当部分 | 低 |
| B2 | `@sinclair/typebox` 改为只导入需要的子模块或换成 zod-only | -500 KB 量级（取决于使用面） | 中 |
| B3 | export-html 出 core，用户没用就不打包 | -288 KB | 低 |
| B4 | `dist/modes/interactive/components/` 取消把所有 component import 到 barrel，让 tree-shake 生效 | -200 KB 估算 | 中 |

---

## 2. 包架构 (Architecture Boundaries)

### 2.1 当前的边界破口

来自模块解析图与目录结构对照：

| 破口 | 表现 | 后果 |
|---|---|---|
| `cli.js → main.js` 静态导入了 `InteractiveMode / runPrintMode / runRpcMode` | `--version` 等任何路径都拖入 TUI 与全部模式代码 | 启动慢 |
| core 中保留 `export-html/` 288 KB | 一个用户从不调用的功能强制随核心打包 | 体积 + 架构 |
| `modes/interactive/components/index.js` barrel 重导出 30+ 组件 | 引一个组件 = 引全部 | 体积 + 启动 |
| 17 个默认扩展全 eager-load，不区分"有 hook"与"纯 slash command" | session_start 时全部跑一遍 | 启动 |
| OpenAI / Anthropic SDK 在 `core/runtime/` 路径就被 import | 即便用户配的是别的 provider，也付了 492 个模块的钱 | 启动 + 体积 |

### 2.2 提议的边界

```
cli.ts                          # 只 parse argv，决定走 short-circuit 还是 main
├── if --version/--help → 直接打印，不 import main
└── main.ts
    ├── core/                   # runtime / model registry / session / config / tools (必需路径)
    ├── modes/<mode>            # 按 argv 决策后再 import
    └── extensions/             # session_start 时按 strategy 加载
        ├── eager (有 hook)    # soul, mcp, diagnostics, idle-think, team, sal, presence, subagent, loop, security-audit, grub, btw, debug
        └── lazy (仅 slash)    # browser, link-world, plan, interview, export-html(待迁出)
```

### 2.3 架构优化候选

| # | 行动 | 影响 | 难度 |
|---|---|---|---|
| A1 | `cli.ts` 在 `--version/--help/migrate/login` 等子命令下短路前不 import main.ts | 立刻减少 ≥1 500 模块 | 低 |
| A2 | export-html 整体迁到 `extensions/defaults/export-html/` | core 减重 + 边界清晰 | 低 |
| A3 | `modes/interactive/components/index.ts` 拆 barrel；TUI 所有静态路径改深路径直引 | 编译期 tree-shake 起作用 | 中 |
| A4 | 默认扩展加 `meta.loadStrategy: "eager" \| "lazy"` 元数据 | 为 lazy 加载铺路 | 低 |
| A5 | 重扩展（team/subagent/idle-think/mcp）拆"占位入口（只挂 slash + 触发动态 import）"+ "实现入口" | session_start 时 -4 800 模块 | 高 |

---

## 3. 启动性能 (Startup Performance)

### 3.1 冷启动检查点（带 `NANOPENCIL_PROFILE_STARTUP=1` 实测）

```
[profile] main_entry: 15912.0 ms                     ← cli.js → main.js 的纯加载耗时
[profile] after_migrations: 16003.7 ms (+91.8 ms)
[profile] before_settings_manager: 16006.6 ms (+2.9 ms)
[profile] settings_manager_ready: 16095.1 ms (+88.5 ms)
[profile] auth_storage_created: 16097.1 ms (+2.0 ms)
[profile] nanopencil_defaults_ensured: 16140.4 ms (+43.3 ms)
[profile] model_registry_created: 16794.6 ms (+654.2 ms)
[profile] before_resource_loader_create: 16911.2 ms (+116.6 ms)
                                                       (此后 timeout 截断)
```

**关键拐点**：
- 0 → 15.9 s：**纯 import 图解析与编译**，用户尚未感知任何业务行为
- 15.9 → 16.8 s：settings + auth + model registry，约 880 ms
- 16.8 → 17 s+：resource loader + 扩展加载，未完全测到（之后 TUI 才能显示）

也就是说：用户敲 `pencil` 到看到提示符 ≥ **17 秒**，其中 **94% 时间花在 import**，6% 在业务初始化。这就是当前的真实痛点。

### 3.2 `--version`（已 warm cache 下限）

10 次中位 9 240 ms，最小 7 144 ms / 最大 11 422 ms。比 `node -e 'console.log(1)'` 的 160 ms 慢 57 倍。

### 3.3 模块解析数量

| 路径 | 模块数 |
|---|---|
| `--version` | **2 457** |
| 全部默认扩展并发 import | 2 695 |
| Δ（扩展独有） | 仅 +238 |

→ **扩展不是冷启动的主因**，cli/main 静态导入图本身就拉了 91% 的模块。

### 3.4 `--version` 模块分布

| 模块数 | 来源 | 是否启动期必需 |
|---|---|---|
| 825 | `@sinclair/typebox` | 否（只用少量 helper） |
| 346 | `openai` SDK | 否（用了再 import） |
| 198 | Node builtin | 是 |
| 176 | `zod` | 否 |
| 155 | `modes/interactive/*` | 否（只在交互模式需要） |
| 146 | `@anthropic-ai` SDK | 否 |
| 129 | vendored `@pencil-agent/ai` | 部分 |
| 94 | vendored `@pencil-agent/tui` | 否（同 modes/interactive） |
| 36 | `core/tools/*` | 是 |

**可推迟比例**：粗略 ≥1 700 / 2 457 ≈ 70% 的模块本不该在 boot 时加载。

### 3.5 CPU profile 热点（`--version`）

| 自耗时 (ms) | 函数 | 含义 |
|---|---|---|
| 1 016 | `compileSourceTextModule` (node:internal) | ESM 编译 |
| 319 | `parseCJS` | CJS 解析 |
| 263 | `parseSource` | |
| 166 | `finalizeResolution` | 路径解析 |
| **164** | **`registerLanguage`** in `highlight.js/lib/core.js` | **启动期注册全部 highlight 语言** |
| 138 | `wrapSafe` | |
| 99 | `realpathSync` | |

→ 编译解析 + I/O 占用 90%+，没有热点能用算法优化绕过；**唯一抓手是减少要 import 的模块数量**。

### 3.6 启动性能优化候选

| # | 行动 | 估算节省 | 难度 |
|---|---|---|---|
| S1 | A1 + cli 早期 short-circuit `--version/--help` | -3 ~ -5 s（warm cache 视角） | 低 |
| S2 | OpenAI / Anthropic / Google SDK 改成首次 streamModel 时动态 import | -500 模块 / -1 s | 中 |
| S3 | TUI / `modes/interactive` 只在 isInteractive 决策后再 import | -250 模块 / -0.7 s | 中 |
| S4 | `highlight.js` 改成首次渲染高亮时再注册语言 | -164 ms + 大量子模块 | 低 |
| S5 | TypeBox 825 模块审计与替代 | -500 模块 / -1 s | 中 |
| S6 | 重扩展（team/subagent/idle-think/mcp）从 session_start 移除，改为占位入口 + 触发时动态 load | -3 ~ -5 s | 高 |
| S7 | `tsconfig.build.json` 启用 `--isolatedModules` + 检查不必要的 barrel re-export | -100~300 模块 | 中 |

完成 S1+S2+S3+S4 的预期：冷启动 17 s → **8-10 s**；模块数 2 457 → **≤900**。
完成 S6 后：8-10 s → **5-7 s**。

---

## 4. 与原方案 (`project-structure-optimization.md`) 的对照

原方案 | 实测验证 | 结论
---|---|---
"整包体积膨胀" | tarball 1.7 MB | **过度悲观**；体积是次要矛盾
"npm workspaces 重构" | `package.json` 已声明 workspaces | **已完成**，删去
"核心包过于沉重" | core 1.8 MB，仅 export-html 是真冗余 | **方向对，但具体目标只有一个：export-html** |
"惰性加载 Extensions" | 扩展只占 238/2 457 模块 = 9.7% | **优先级被高估**；先治 cli/main 静态图
"tree-shaking" | tarball 已经只 1.7 MB | **不优先**

---

## 5. 修订后的总执行顺序

> 按 **(用户感知收益) ÷ (改动风险)** 排序

```
Phase 1：架构修边（低风险，先做铺路）
  A1  cli.ts 短路 --version/--help/migrate（不 import main.ts）           ~0.5d
  A2  export-html 出 core                                                  ~1d
  A4  扩展声明 loadStrategy 元数据                                          ~0.5d

Phase 2：启动主路径瘦身（中风险，最大收益）
  S2  AI 三大 provider SDK 改 lazy import                                  ~1d
  S3  modes/interactive 改 lazy（仅在 isInteractive 时 import）             ~0.5d
  S4  highlight.js 语言注册 lazy                                           ~0.5d
  A3  modes/interactive/components 拆 barrel                               ~1d

Phase 3：扩展惰性化（高风险，需先有契约保护）
  A5/S6  team/subagent/idle-think/mcp 拆占位入口（前置：扩展生命周期合约测试） ~3-5d

Phase 4：体积二次收敛（次要）
  B1  browser/agent-workspace/domain-skills 拆数据资源                      ~1d
  B2  @sinclair/typebox 审计                                                ~1-2d

Phase 5：复测与回填
  把每一阶段完成后的 main_entry / 模块数 / tarball 三项填入本文表格
```

每个 Phase 完成后跑 `§6` 复测脚本，把数字回填进表格作为 acceptance criteria。

---

## 6. 复测脚本

```bash
# (a) tarball 体积
npm pack --dry-run 2>&1 | grep -E "package size|unpacked size|total files"

# (b) 模块解析数（需要 /tmp/module-counter.mjs）
node --import /tmp/module-counter.mjs dist/cli.js --version 2>/tmp/r.log
echo "modules: $(grep -c '^RESOLVED ' /tmp/r.log)"

# (c) --version 冷启动 10 次中位
for i in $(seq 1 10); do
  { time node dist/cli.js --version >/dev/null 2>&1 ; } 2>&1 | grep real
done

# (d) 真实交互冷启动到 main_entry
NANOPENCIL_PROFILE_STARTUP=1 timeout 20 node dist/cli.js </dev/null 2>/tmp/p.err
grep "main_entry\|model_registry_created\|resource_loader_reload" /tmp/p.err
```

辅助文件：
- `/tmp/module-counter.mjs` — `import { register } from "node:module"; register(new URL("./module-counter-loader.mjs", import.meta.url));`
- `/tmp/module-counter-loader.mjs` — `export async function resolve(s,c,n){const r=await n(s,c); if(r.url) process.stderr.write("RESOLVED "+r.url+"\n"); return r;}`

Phase 1 时这两个文件会落进 `scripts/perf/` 进版本控制。
