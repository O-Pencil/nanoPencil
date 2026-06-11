# Tool Usage Analysis

> Type: Evaluation Category
> Status: Draft
> Scope: Agent tool traces, tool sequences, and tool-quality signals
> Purpose: Evaluate tool usage with reproducible analysis while keeping recommendations separate from adopted behavior

## 1. Question

Does the Agent use tools in a necessary, efficient, recoverable, and verifiable way?

This category currently focuses on `eval_tool_traces`. It does not require schema changes or upload-logic changes.

## 2. Documents

| File | Purpose |
|------|---------|
| `sop.md` | Trigger-based analysis workflow |
| `metrics.md` | Stable metric definitions |
| `invalid-data-rules.md` | Rules for low-signal or invalid trace records |
| `report-template.md` | One-shot analysis report template |

## 3. Analysis Boundary

Tool trace analysis can produce suggestions such as:

1. A tool sequence may be inefficient.
2. A task class may need a different tool policy.
3. A field may be insufficient for attribution.
4. A trace pattern may need replay.

It should not directly conclude that Agent behavior must change.
