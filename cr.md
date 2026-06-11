# Code Review — Recent Commits

> Reviewed: 2026-06-11 03:00
> Commits: a520c98, 2b531ab, 76b9dc5, 65ab386
> Scope: teach extension, startup perf, task system, loop/cron 1:1 port

---

## Commit a520c98 — feat(teach): add guided knowledge teaching extension

### Issues

#### 1. [Medium] No P3 headers on reference .md files
All `references/*.md` files lack P3 headers. While they're data files not code, the project DIP spec says P3 is for code files, so this is borderline — but for consistency, consider adding at least a header comment.

#### 2. [Medium] `TeachRuntime` state stored in singleton class property
`TeachRuntime` holds `state: TeachState | null` as an instance property. If the extension is re-initialized (e.g., during `reload()`), the previous state is lost without cleanup. No dispose/teardown hook visible.

**File:** `extensions/builtin/teach/teach-runtime.ts`

#### 3. [Medium] Persistence uses synchronous `readFileSync` in critical path
If `TeachPersistence.loadMission()` or `loadLearningRecords()` is called synchronously, it could block the event loop. Verify the actual call chain is async all the way through.

#### 4. [Low] Large prompt strings inline in `teach-prompts.ts`
382 lines of prompt text in a single file. Could be split into smaller files per phase (mission_discovery, level1, etc.) for easier iteration.

#### 5. [Low] No test coverage for teach extension
No test files found for the teach extension. The state machine has multiple phases and transitions that should be unit-tested.

---

## Commit 2b531ab — perf(startup): load MCP off critical path + parallel/incremental build

### Issues

#### 6. [High] `_refreshMcpTools` MCP tool filter is a brittle heuristic
```typescript
const previousMcpTools = this._customTools.filter((t) =>
  t.name.startsWith("mcp_"),
);
```
This assumes all MCP tools are prefixed with `mcp_`. If an MCP server registers tools without that prefix, or a non-MCP tool happens to have it, recovery behavior will be incorrect.

**File:** `core/runtime/agent-session.ts`
**Suggestion:** Track MCP tools explicitly (e.g., tag them in `_customTools` or maintain a separate set) rather than relying on naming convention.

#### 7. [Medium] `warmupMcpTools()` is fire-and-forget in interactive mode
If the user makes a tool call before MCP warmup completes, they'll see fewer tools than expected. There's no UI feedback about "MCP still loading" in the current session.

The `sdk:mcp_ready` event is emitted, but the interactive mode may not be listening for it to show a status indicator.

**File:** `core/runtime/agent-session.ts`, `modes/interactive/interactive-mode.ts`

#### 8. [Medium] Build pipeline changes not fully covered by existing tests
`scripts/build-deps.js` introduces dependency-aware parallel builds. A failure in one sub-package could silently fail if error propagation isn't tested.

**File:** `scripts/build-deps.js`

#### 9. [Low] `process.once("exit")` handler moved outside the try/catch
In the old code, `process.once("exit", ...)` was inside the try block. Now it's registered before the try/catch for MCP init. This is actually fine, but the ordering change should be noted — if MCP init fails, the dispose handler still runs on exit with `currentMcpManager` possibly undefined.

**File:** `core/runtime/sdk.ts`

---

## Commit 76b9dc5 — feat(task): add TaskCreate/Get/Update/List/Stop/Output + ToolSearch extension

### Issues

#### 10. [High] Task ID scheme uses sequential integers, not UUIDs
Task IDs are auto-incremented integers stored as strings (`"1"`, `"2"`, ...). This is fine for single-session use, but:
- The high-water-mark approach is complex and fragile — if a `.highwatermark` file is lost or corrupted, ID reuse could cause stale references
- Claude Code's task system may use UUIDs; this deviates from 1:1 port
- Concurrent sessions in the same agentDir could create conflicting IDs

**File:** `extensions/builtin/task/task-store.ts`, `extensions/builtin/task/task-types.ts`

#### 11. [High] `deleteTask` has O(n×m) complexity — reads and writes ALL tasks
```typescript
const allTasks = await listTasks(agentDir, taskListId);
for (const task of allTasks) {
  // ... updateTask for each task that references the deleted one
}
```
Deleting one task triggers a full directory scan + potential N file writes. With many tasks, this becomes a bottleneck.

**File:** `extensions/builtin/task/task-store.ts` — `deleteTask()`

#### 12. [Medium] `updateTask` guidance claims "staleness check" but doesn't enforce it
The guidance text says "Make sure to read a task's latest state using TaskGet before updating it" but there's no optimistic concurrency check (e.g., version field, etag). The model could race against itself.

**File:** `extensions/builtin/task/task-tools/task-update-tool.ts`

#### 13. [Medium] `TaskUpdate` status validation missing
No validation that status transitions follow the expected workflow (`pending` → `in_progress` → `completed`). The tool accepts any status value without checking if the transition is valid.

**File:** `extensions/builtin/task/task-tools/task-update-tool.ts`

#### 14. [Medium] `ToolSearch` uses regex-based matching that may produce false positives
The search implementation escapes regex and matches against tool names/descriptions, but keyword ranking could return irrelevant results if tool descriptions share common words.

**File:** `extensions/builtin/task/task-tools/tool-search-tool.ts`

#### 15. [Low] No P3 header on `task-tools/tool-search-tool.ts` P3 header exists but the file is 344 lines — verify the header accurately reflects all functions exported.

**File:** `extensions/builtin/task/task-tools/tool-search-tool.ts`

#### 16. [Low] `blockTask` doesn't check for circular dependencies
Adding a block relationship could create cycles (A blocks B, B blocks A). No cycle detection is present.

**File:** `extensions/builtin/task/task-store.ts` — `blockTask()`

---

## Commit 65ab386 — feat(loop): 1:1 port CC cron/loop system

### Issues

#### 17. [High] Old loop features removed: `--name`, `--max`, `--quiet`, `--paused` flags
The port drops several CLI flags that may be in use:
- `--max` (auto-cancel after N runs) — the new scheduler has `recurringMaxAgeMs` but not a run-count limit
- `--paused` — no way to temporarily suspend a recurring task
- `--name` — tasks can no longer be given human-readable names

**Files:** `extensions/builtin/loop/` (multiple)
**Impact:** Breaking change for users relying on these flags

#### 18. [High] `.claude/scheduled_tasks.json` path mismatch
The port writes to `.claude/scheduled_tasks.json` (Claude Code's path) instead of `.nanopencil/`. This creates an invisible dependency on Claude Code's directory convention and could conflict if a user has both tools in the same project.

**Files:** `extensions/builtin/loop/cron/cron-tasks.ts`
**Suggestion:** Use `.nanopencil/scheduled_tasks.json` or make the path configurable.

#### 19. [Medium] `dispatchTask` removed — scheduler now only sends followUp messages
The old code had a `dispatchTask()` function that handled slash command execution vs. prompt execution differently:
```
Old: if task.isSlashCommand → api.runSlashCommand(...)
New: only currentApi.sendUserMessage(prompt, { deliverAs: "followUp" })
```
If tasks were created with slash commands (e.g., `/compact`), the new implementation will send the literal text as a user message rather than executing the command.

**File:** `extensions/builtin/loop/index.ts`

#### 20. [Medium] Scheduler lock uses process-level PID, not reliable across all platforms
`isProcessRunning(pid)` uses `process.kill(pid, 0)` which works on Unix but may behave differently on Windows. If a PID is recycled quickly, a new process could be mistaken for a live scheduler.

**File:** `extensions/builtin/loop/cron/cron-tasks-lock.ts`

#### 21. [Medium] `removeCronTasks` always sweeps session store first
```typescript
const removedFromSession = removeSessionCronTasks(ids);
if (removedFromSession === ids.length) return;
```
This assumes session store is always checked first, but the nanoPriel note says "always sweep since extension API always provides dir". If `dir` is always provided, this early-return path is dead code that adds unnecessary overhead.

**File:** `extensions/builtin/loop/cron/cron-tasks.ts`

#### 22. [Medium] `lastBlockedBy` is module-level mutable state
```typescript
let lastBlockedBy: string | undefined;
```
This tracks the last blocking session ID for logging, but is global module state. If multiple lock instances exist (shouldn't happen but possible), they'd share this state.

**File:** `extensions/builtin/loop/cron/cron-tasks-lock.ts`

#### 23. [Medium] Chokidar watcher with `persistent: false` may not fire reliably
```typescript
watcher = chokidar.watch(path, { persistent: false, ... });
```
With `persistent: false`, the watcher won't keep the Node process alive. If the event loop has no other work, the watcher might not fire. This is intentional ("Don't keep the process alive for the scheduler alone") but means file changes might not trigger `load()` if no other timers are active.

**File:** `extensions/builtin/loop/cron/cron-scheduler.ts`

#### 24. [Low] `Co-Authored-By` in commit message violates AGENTS.md convention
AGENTS.md states: "**No `Co-Authored-By:`**: Do not add any `Co-Authored-By:` trailer to commit messages"

The commit message includes: `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`

#### 25. [Low] Interview extension deleted but test file `interview-grill.test.ts` also removed
The test removal is clean, but there's no migration path or deprecation notice for users who had interview-enabled sessions.

**File:** `extensions/builtin/interview/` (deleted), `test/interview-grill.test.ts` (deleted)

#### 26. [Low] `getNextFireTime` returns `null` when all entries are `Infinity`
```typescript
let min = Infinity;
for (const t of nextFireAt.values()) {
  if (t < min) min = t;
}
return min === Infinity ? null : min;
```
If `nextFireAt` has entries but all are `Infinity`, this returns `null`. This is correct behavior (no actionable fire time), but the distinction between "empty schedule" and "all Infinity" is lost to callers.

**File:** `extensions/builtin/loop/cron/cron-scheduler.ts`

---

## Summary

| Severity | Count | Key Items |
|----------|-------|-----------|
| High | 4 | MCP tool filter heuristic (#6), Task ID scheme (#10), deleteTask O(n×m) (#11), dispatchTask removed (#19), .claude path (#18), lost CLI flags (#17) |
| Medium | 9 | State management (#2), warmup UX (#7), build error prop (#8), optimistic concurrency (#12), status validation (#13), slash command dispatch (#19), PID lock (#20), chokidar persistence (#23) |
| Low | 8 | Missing tests (#5), P3 headers (#1), Co-Authored (#24), cycle detection (#16), etc. |

### Top 3 Recommendations

1. **Fix `.claude/` → `.nanopencil/` path** (#18) — most visible inconsistency with the rest of the codebase
2. **Restore slash command dispatch in loop** (#19) — breaking behavior change for scheduled commands
3. **Add status transition validation to TaskUpdate** (#13) — prevents invalid state machine transitions
