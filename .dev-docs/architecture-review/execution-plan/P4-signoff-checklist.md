# P4 Sign-off Checklist — runtime god 拆出口门（单文件 · 换机即跑）

```yaml
phase: P4
purpose: 在能跑 npm 的机器上一把验完 P4 出口门；逐条勾选 + 粘贴证据
branch: refactor/arch-candidate-d
status_source: ../runtime-session-review/README.md#closeout--p4-sign-off-handoff
```

> **范围声明**：本表只验 **P4(runtime god 拆)这一个 phase 的出口门**。
> **不在这里跑 `wiki:all`** —— llm-wiki 是**全仓库合 main 的一次性证据**，见末尾 §3 与
> [refactor-validation.md §5](../refactor-validation.md)。P5–P8 还会改代码，现在跑 wiki 立即作废。

---

## 0. 前置（已在分支上完成，无需重跑）

结构门 RS-1/RS-2/RS-3 已用 grep 在分支上客观验证（[Closeout 证据表](../runtime-session-review/README.md#closeout--p4-sign-off-handoff)）：

- [x] RS-1 无控制器 `import` `agent-session.ts`（0 命中）
- [x] RS-2 4 个窄 `*ControllerContext`；`session-context.ts` 不反依赖组合根
- [x] RS-3 `agent-session.ts` 持 0 个 abort slot（3 slot 各归 compaction/tree 控制器）

> 想自查可复跑：
> ```bash
> cd core/runtime
> grep -nE '^\s*import.*agent-session' *-controller.ts bash-runner.ts prompt-assembly.ts export-bridge.ts event-bridge.ts   # 期望: 无输出
> grep -c 'ControllerContext' session-context.ts                                                                          # 期望: 4
> ```

---

## 1. P4 出口重型门（capable machine · 逐条勾选）

全部在 `refactor/arch-candidate-d` 分支根目录执行。先确保依赖与内部库 dist 就绪：

```bash
npm install
npm run build:deps      # 关键：core/lib/{ai,agent-core,tui} 先出 dist，否则 tsc 报 Cannot find module '@pencil-agent/*'
```

运行结果（2026-06-02，`6a72b43`，机器 `/Users/lucy.cl/...`）：

| # | 门 | 命令 | 通过标准 | 状态 | 证据 |
|---|----|------|---------|------|------|
| C1 | 编译 | `npx tsc --noEmit` | 无输出（exit 0） | ✅ | exit 0，3307ms（collect-baseline 内跑）|
| C2 | 构建 | `npm run build` | 成功（含 ai 包自身 tsconfig.build.json）| ✅ | `dist/build-meta.json` v1.14.6, 6a72b43 |
| C3 | 符号不变（V4-2）| 见下方 **§2** | diff 为空，或仅"已声明的有意变更" | ✅ | 零差异（296 == 296）|
| C4 | 行为基线（V4-3）| `npx vitest run tests/characterization` | 全过（cassette/golden 零回归）| 🚧 挂起 | cassette 未录 → 见 **§2b** |
| C5 | 无新环（V4-6）| `npx tsx scripts/verify-quality.ts` | exit 0（或白名单带 deadline）| ✅ | passed，529 文件（madge≈22 属噪声，非判据）|
| C6 | DIP 同构（RS-6）| `npx tsx scripts/verify-dip.ts` | exit 0（含 `core/runtime/CLAUDE.md` Capability Ownership 表与成员表一致）| ✅ | passed，478 P3 + 30 P2 |

> 注：`npm test` 脚本本仓库不存在；characterization 用 `vitest run tests/characterization` 直跑。
> **C5 判据是 verify-quality（零真实环），不是 madge 原始计数** —— build:deps 出 dist 后 madge≈22 全是 type-only/跨包噪声，verify-quality（F08 剥 type-only + SCC）才是唯一环门。

---

## 2. C3 符号 diff 操作（wiki 无关）

P0 已冻结 `main` 的公共符号快照（296 个导出）。在分支上重产并比对：

```bash
# 1) 在重构分支产出当前符号表
npx tsx scripts/collect-baseline.ts          # 写 .baseline-out/public-api-symbols.txt

# 2) 与 P0 main 基线 diff
diff .dev-docs/architecture-review/baseline/public-api-symbols-main.txt \
     .baseline-out/public-api-symbols.txt
```

- **期望**：无差异（god 拆是内部重构，公共面应不变 → 功能不变硬指标）。
- 若有差异：必须每一行对应一个**已在 review 卡/Phase 文档声明的有意变更**（GB-2）；否则视为回归，C3 不通过。
- 这一步**不需要 llm-wiki** —— 是独立纯文本快照，专为 per-phase 出口设计。

---

## 2b. C4 挂起：行为基线待在 `main` 上录制

C4 当前**无法判定**，因为 `tests/characterization/cases/*/cassette.json` 与 `__golden__/` **从未在重构前的 `main` 上录过**（P0 标的"冻结 main cassette/golden"硬前置，受限沙箱当时跑不了）。报错 `missing cassette ...; run RECORD=1 on main first` 即此意 —— 不是回归，是**无基线可比**。

**解除挂起的步骤（需真实 API key + 一次真模型调用，仅在 main 录一次）**：

```bash
git checkout main          # 冻结基线点（P0 记 0eea985）
RECORD=1 OPENAI_API_KEY=sk-... npx vitest run --config tests/characterization/vitest.config.ts
#   ⚠️ 首次录:run-case.ts 顶部有 1 个待确认假设(apiKey env 注入 / createAgentSession 选项名)
git add tests/characterization/cases/*/cassette.json tests/characterization/__golden__
git commit -m "test(characterization): record pre-refactor golden baseline on main"
git checkout refactor/arch-candidate-d
git checkout main -- tests/characterization/cases tests/characterization/__golden__   # 带回 cassette+golden
npx vitest run tests/characterization      # 回放:全绿=行为不变(C4 过);红=真回归
```

只有 2 个 case（hello / read-file），录一次很快。**录制完成前 P4 不能 `completed`** —— 行为不变只证了结构半边（C3 符号），行为半边（C4）仍空。

---

## 3. 不在本表内：合 main 才跑的一次性证据

以下属 [sign-off-main.md](./sign-off-main.md)，**所有 phase（P2–P8）landed 之后跑一次**，不要在 P4 跑：

- `npm run wiki:all` → 重生成 llm-wiki，与 main 基线 diff（S-1 富证据 / 结构版功能清单刷新）
- 冷启动时间 / dist 体积 vs P0 Baseline（S-4 性能）
- `~/.pencils/agents/` 向后兼容 smoke（S-6 用户态）

> **为什么 wiki 不放 per-phase**：它是全图扫描产物，P5(UI 拆)/P6/P7/P8 任一改代码即作废。
> per-phase 的"功能不变"由 §2 纯符号 diff + §1 characterization 担保，已足够且便宜。

---

## 4. 通过后

- [ ] C1–C6 **全绿（含 C4 行为基线）** → 在 [P4-runtime-split.md](./P4-runtime-split.md) V4 表把 V4-2/3/6 标 ✅
- [ ] 回填本表"证据"列（粘贴关键输出）
- [ ] P4 status `structure_landed → completed`
- [ ] 继续 P5（UI 拆，串行于 P4 之后）

> **⛔ 合 main 硬门(重申)**：`refactor/arch-candidate-d` **禁止合入 `main`，直到全部改动确认完毕** ——
> 不是单个 phase 过门就行，而是 **P2–P8 各域门组 B 全过 + 本表 C1–C6（含 C4）全绿 +
> [sign-off-main.md](./sign-off-main.md) S-1…S-6 全填 + maintainer 签字**。任一项未确认即不得开 PR 合 main。
> 当前 P4：C4 行为基线尚挂起 → **即使 P4 其余全绿，也不构成可合 main 的依据**。

---

## 关联

- WHY（每个边界为何这么拆）：[runtime-session-review/findings/AS*.md §Resolution](../runtime-session-review/)
- WHO-OWNS-WHAT：[core/runtime/CLAUDE.md §Capability Ownership](../../../core/runtime/CLAUDE.md)
- 出口门定义：[gates.md 门组 B](./gates.md)、[P4 runbook V4 表](./P4-runtime-split.md#验证门控dod)
- 合 main 终验：[sign-off-main.md](./sign-off-main.md)、[refactor-validation.md](../refactor-validation.md)
