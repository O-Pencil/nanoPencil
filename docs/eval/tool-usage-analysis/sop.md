# Tool Usage Analysis SOP

> Type: SOP
> Status: Draft
> Scope: Trigger-based analysis of Agent tool traces
> Purpose: Make tool usage analysis repeatable without relying on ad hoc SQL or daily manual review

## 1. Trigger

Run this workflow on demand through a shortcut, CLI command, npm script, or manual query set.

Common triggers:

1. Before changing tool policy.
2. After a SAL or prompt experiment.
3. After suspected tool regressions.
4. Before writing an issue from eval findings.

## 2. Inputs

Minimum input:

1. `eval_tool_traces`
2. Data window
3. Optional experiment ID or run IDs

Optional related inputs:

1. `eval_runs`
2. `eval_turns`
3. `eval_memory_recalls`
4. SAL anchor tables
5. Patches, logs, and user feedback

## 3. Analysis Steps

1. Record the data window and sample size.
2. Normalize parseable fields for analysis only.
3. Group by intent, run, and tool sequence.
4. Identify high-cost, high-error, empty-tool, and truncated samples.
5. Review representative samples before writing suggestions.
6. Record suggestions in the decision log template.
7. Convert validated next steps into experiment issues.

## 4. Required Output

Each run should output:

1. Scope and data window.
2. Sample size and excluded records.
3. Metric summary.
4. Suspicious samples with IDs.
5. Suggestions.
6. Validation required before adoption.

## 5. Non-Goals

This SOP does not:

1. Change table schemas.
2. Change trace upload logic.
3. Automatically adopt tool policy changes.
4. Treat fewer tool calls as inherently better.
