# Invalid and Low-Signal Tool Trace Rules

> Type: Data Quality Rules
> Status: Draft
> Scope: `eval_tool_traces` review
> Purpose: Separate telemetry quality issues from Agent behavior suggestions

## Invalid Records

Mark a record invalid for metric aggregation when:

1. Required identifiers are missing, such as `run_id`.
2. Numeric fields cannot be parsed for metrics that need them.
3. `tool_sequence` is expected but cannot be parsed.
4. The same `run_id`, `turn_id`, and `event_id` appears as a duplicate without a clear reason.

## Low-Signal Records

Keep but annotate records when:

1. `tool_sequence` is empty and the turn may be discussion-only.
2. `intent` is `unknown`.
3. Tool output was truncated and no useful summary exists.
4. The trace lacks enough per-call detail to attribute failures.
5. The task complexity is unknown.

## Suggestion Rule

Do not turn low-signal data into behavior changes. Use it to suggest better instrumentation, replay, or manual review.
