# NanoPencil Eval

> Type: Evaluation Overview
> Status: Draft
> Scope: SAL, tool usage, and issue-driven Agent evaluation
> Purpose: Provide one entry point for evaluation documentation without changing data collection, schema, or runtime behavior

## 1. Purpose

The eval system exists to turn Agent behavior into auditable suggestions. It should help answer:

1. What did the Agent do?
2. Which behavior looks useful, wasteful, risky, or unclear?
3. What should be tested next?
4. Which suggestions were later adopted or rejected?

Eval documents do not authorize behavior changes by themselves. A suggestion becomes an adopted change only after a follow-up experiment, replay, human review, or code-level validation.

## 2. Evaluation Categories

| Category | Directory | Core Question |
|----------|-----------|---------------|
| Experiment governance | `experiment-protocol.md` | How should observations become validated changes? |
| SAL memory anchors | `sal-memory-anchor/` | Do structural anchors improve memory recall and task navigation? |
| Tool usage analysis | `tool-usage-analysis/` | Does the Agent use tools with the right sequence, cost, and recovery behavior? |
| Issue usage | `issue-usage/` | Does the Agent convert issues into bounded tasks and verifiable outcomes? |

## 3. Evidence Language

Use conservative language in eval work:

| Term | Meaning |
|------|---------|
| Observation | A measured or reviewed behavior from traces, artifacts, or replay |
| Signal | A repeated observation that may indicate a pattern |
| Suggestion | A proposed change or next experiment derived from signals |
| Validation | A replay, experiment, human review, or test proving whether a suggestion holds |
| Adoption | A change accepted into Agent behavior, prompts, runtime policy, or documentation |

Avoid writing "conclusion" unless the validation path is documented.

## 4. Trigger-Based Workflow

Eval should be runnable on demand through a shortcut, CLI command, npm script, or manual query set. It is not required to run daily.

Standard trigger output should include:

1. Data window and sample size.
2. Input tables or artifacts.
3. Normalized metrics.
4. Suspicious or high-value samples.
5. Suggestions with confidence and required validation.
6. Links to related run IDs, experiment IDs, commits, and issues.

## 5. Adoption Flow

```text
Observation -> Signal -> Suggestion -> Experiment Issue -> Validation -> Adopted / Rejected
```

This flow prevents trace analysis from directly mutating Agent behavior without evidence.

## 6. Current Boundary

This documentation layer does not:

1. Change InsForge table schemas.
2. Change telemetry upload logic.
3. Add automatic reports.
4. Change SAL, memory, tool, or issue behavior.

Those changes should be proposed as suggestions first and validated through the experiment protocol.
