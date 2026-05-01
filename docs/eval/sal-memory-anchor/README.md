# SAL Memory Anchor Evaluation

> Type: Evaluation Category
> Status: Draft
> Scope: SAL structural anchors and memory recall behavior
> Purpose: Evaluate whether memory anchors improve Agent navigation and recall without overstating unvalidated results

## 1. Question

Does SAL help the Agent use structural memory in the right place, at the right time, and with lower noise?

This category focuses on memory-anchor behavior, not general answer quality.

## 2. Documents

| File | Purpose |
|------|---------|
| `hypothesis.md` | Testable hypotheses for SAL memory-anchor behavior |
| `metrics.md` | Metrics and review dimensions |
| `runs.md` | Run notes and experiment references |

## 3. Primary Signals

1. Task anchor lands near the actual work area.
2. Memory recall is structurally relevant to the current task.
3. Follow-up tasks reuse useful context with less repeated exploration.
4. Irrelevant memory injection does not increase.
5. Recalled anchors do not push the Agent toward stale or wrong code.

## 4. Required Caution

SAL signals must be interpreted with task complexity. Simple single-file tasks may not show meaningful SAL value. Cross-module follow-up tasks are better candidates.
