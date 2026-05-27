# Extension Telemetry — Smoke Test & Operating Guide

> ⚠ **Audience: pencil maintainers.** Documents the P0–P3 extension telemetry pipeline (the `ext_*` tables) and how to verify it locally. Code paths described here are part of the default product surface (extensions auto-loaded into user sessions) but the *data sink* is developer-owned: rows only land in the maintainer's insforge backend when `~/.memory-experiments/credentials.json` is present. Users without credentials pay zero cost (noop sink, no network traffic).

---

## 1. What this is

Four telemetry tables answer four questions about the extension ecosystem:

| Table | Answers |
|---|---|
| `ext_command_events` | Which extensions are users actually invoking? Which commands fail? Which are slow? |
| `ext_llm_calls` | Who initiated each LLM call? Was the user aware? **Detects idle-thinking-class bugs** (hooks silently calling models). |
| `ext_hook_events` | Which hooks are slow / failing? With per-hook sampling, scaled to estimate real frequencies. |
| `eval_runs` (SAL-owned, existing) | Session context: model, commit, variant, workspace. Joined to the `ext_*` tables via `run_id` when SAL eval is enabled. |

Architecture and code pointers:

- Tables created via insforge MCP `run-raw-sql`; no schema migration file (single-tenant maintainer backend)
- Sink implementation: `core/telemetry/ext-events.ts`
- Dispatch chokepoint for command attribution: `core/extensions/runner.ts` (`invokeCommand`, `invokeHookHandler`)
- Caller-context bus: `core/telemetry/caller-context.ts` (`AsyncLocalStorage`)
- LLM-call wrap: `core/runtime/extension-core-bindings.ts` (around `completeSimple` / `completeSimpleWithUsage` / `completeJson`)
- Privacy posture: no payload text, no prompt text, no LLM response text — only token counts, durations, outcomes, and enum-like signatures

---

## 2. Pre-flight

```bash
# Confirm credentials exist with both endpoint + api_key
jq '.credentials[] | select(.id=="insforge") | {endpoint, api_key: (.api_key|length>0), anon_key: (.anon_key|length>0)}' \
   ~/.memory-experiments/credentials.json
```

Expected: `endpoint` set; `api_key: true` or `anon_key: true`. If both are false, the factory returns the noop sink and nothing will land in any table.

Tables must already exist (created out-of-band via `mcp__insforge__run-raw-sql`):

```
ext_command_events    BIGSERIAL PK, indexed on (run_id, extension_name, started_at, outcome, variant)
ext_llm_calls         BIGSERIAL PK, indexed on (run_id, extension_name, is_user_initiated, started_at, command_event_id)
ext_hook_events       BIGSERIAL PK, indexed on (run_id, (extension_name, hook_name), recorded_at)
```

---

## 3. End-to-end smoke test

Run from the pencil repo root.

### Step A — note current row counts (baseline)

```bash
npx tsx scripts/smoke-ext-telemetry.ts --since=1m
```

Expected output: three `── ext_* ──` sections with row counts. If this is a quiet window, counts may all be 0. That's fine — we're establishing baseline.

### Step B — exercise pencil in another terminal

```bash
# Fresh session, do not run in --print mode (hooks behave differently)
npx tsx cli.ts
```

Inside the TUI, perform a sequence covering all three tables and both `is_user_initiated` values:

```
> hi, can you help me refactor something?
   ↑ triggers hooks (before_agent_start / after_agent_end) → ext_hook_events rows
   ↑ no LLM call from extensions (main agent loop calls LLM, but that's outside ext_* scope)

> /recap
   ↑ ext_command_events: extension_name=recap, command_name=recap, args_signature=no-args, outcome=ok

> /recap --smart
   ↑ ext_command_events: args_signature=--smart, outcome=ok
   ↑ ext_llm_calls:      caller_context="command:/recap --smart", is_user_initiated=true

> /notarealcommand foo
   ↑ NOTHING in ext_command_events (runner.invokeCommand returns found:false → no row)

> /btw what's a race condition?
   ↑ ext_command_events: extension_name=btw, outcome=ok
   ↑ ext_llm_calls: caller_context="command:/btw", is_user_initiated=true

# Ctrl+D to exit — triggers session_shutdown hook + close() on the sink (final batch flush)
```

### Step C — wait for batch flush, then re-query

```bash
sleep 3   # BatchingDispatcher default interval is 2000ms; close() flushes synchronously
npx tsx scripts/smoke-ext-telemetry.ts --since=10m
```

What you should see:

```
── ext_command_events ── ≥ 3 rows
  recap   recap   no-args   ok    < 50ms
  recap   recap   --smart   ok    1000–5000ms
  btw     btw     with-args ok    500–3000ms

── ext_llm_calls ── ≥ 2 rows  (0 auto-fired)
  recap  command:/recap --smart  true   ~400 in / ~80 out  ~2000ms
  btw    command:/btw            true   ~200 in / ~150 out ~1500ms

── ext_hook_events ── ≥ 10 sampled rows  (0 errors)
  presence · before_agent_start   N    N      < 5ms    0
  sal      · tool_execution_end   M    M*10   < 10ms   0     ← sampled at 10%
  …

verdict: DATA PRESENT, no auto-fired LLM calls. Pipeline healthy.
```

### Step D — verify the idle-thinking probe (negative test)

The pipeline should report **zero** `is_user_initiated=false` LLM calls during normal use. If non-zero, it means a hook is silently calling the model — exactly the bug class this telemetry was built to detect.

```bash
npx tsx scripts/smoke-ext-telemetry.ts --since=1h
# Look for "⚠ Idle-thinking probe: auto-fired LLM calls detected."
```

If you see this in normal operation, the offending extension is named in the output. Investigate by reading the `caller_context` value (e.g. `hook:before_agent_start` tells you which lifecycle hook).

---

## 4. Common follow-up queries

Run via insforge MCP or your psql session:

```sql
-- Usage frequency by extension (last 7d)
SELECT extension_name, count(*) AS invocations,
       count(DISTINCT session_id) AS unique_sessions
FROM ext_command_events
WHERE started_at > now() - interval '7 days'
GROUP BY 1 ORDER BY invocations DESC;

-- Slowest commands (p95 latency)
SELECT extension_name, command_name, count(*) AS n,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms) AS p50,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95
FROM ext_command_events
WHERE outcome='ok' AND started_at > now() - interval '7 days'
GROUP BY 1, 2 HAVING count(*) > 5
ORDER BY p95 DESC;

-- Error patterns (which commands fail, with which error_code)
SELECT extension_name, command_name, error_code, count(*) AS occurrences
FROM ext_command_events
WHERE outcome='error' AND started_at > now() - interval '7 days'
GROUP BY 1, 2, 3 ORDER BY occurrences DESC;

-- Idle-thinking detector: auto-fired LLM calls, ranked by cost
SELECT extension_name, caller_context, count(*) AS calls,
       sum(tokens_in + tokens_out) AS tokens,
       sum(cost_total)::numeric(10,4) AS cost_usd
FROM ext_llm_calls
WHERE is_user_initiated = false AND started_at > now() - interval '7 days'
GROUP BY 1, 2 ORDER BY cost_usd DESC NULLS LAST;

-- Hook timing with sample extrapolation
SELECT extension_name, hook_name, count(*) AS sampled,
       round(count(*) / avg(sample_rate))::int AS estimated_real,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95_ms
FROM ext_hook_events
WHERE recorded_at > now() - interval '7 days'
GROUP BY 1, 2 ORDER BY p95_ms DESC;
```

---

## 5. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Smoke script reports `NO DATA` even after running pencil | (a) credentials.json missing or `api_key` empty → sink is noop. (b) Pencil never ran. (c) Batch hasn't flushed — wait 3s and re-query. (d) Network failure → check `core/utils/diagnostics.ts` debug log filtered by `source=ext.telemetry`. |
| Smoke script reports auto-fired LLM calls in normal use | A hook is calling `ctx.completeSimple*` without an explicit user-initiated context. Find the extension via `caller_context` (format `hook:<name>`). Either remove the call or wrap it explicitly. |
| Hook counts are way lower than expected | Tool-related hooks (`tool_call` / `tool_result` / `tool_execution_*`) sample at 10%. Multiply by `1.0 / sample_rate` to get the real count. All other hooks sample at 100%. See `HOOK_SAMPLE_RATES` in `core/telemetry/ext-events.ts`. |
| `extension_name=unknown` in a row | The runner couldn't find the owning extension at dispatch time (rare; possible during hot-reload). `caller_context` should still be informative. |
| `session_id` is null | The `_tryExecuteExtensionCommand` path passes session_id; the LLM-call path reads it from `host.sessionManager.getSessionId()`. Null implies a path we haven't instrumented. |

---

## 6. Privacy & cost contract

- **No user text in any column.** `args_signature` is the only field that could carry user input, and it's bucketed into `no-args` / `--<flag>` / `with-args` — original args never leave the process.
- **No LLM payload.** Only token counts, cost, duration, model_id, ok flag.
- **No prompt or response.** The wrappers in `extension-core-bindings.ts` measure around `completeSimple` calls but do not read the prompt or completion text.
- **Zero cost when not configured.** Without `credentials.json`, `createExtensionTelemetrySink()` returns `NoopExtensionTelemetrySink` which discards every event synchronously. No batches, no timers, no network.
- **No retention bound enforced by pencil.** The maintainer owns insforge and is responsible for retention policy on the backend.

---

## 7. When to update this doc

- New table added (e.g. P4 `ext_resource_events`) → add to §1 and §4
- Sample rate changed → update §2 / §5 reference
- New idle-thinking pattern discovered → add a query in §4
- Privacy posture changes (e.g. start storing args length buckets) → update §6
