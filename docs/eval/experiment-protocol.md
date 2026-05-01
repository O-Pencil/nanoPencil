# Eval Experiment Protocol

> Type: Experiment Protocol
> Status: Draft
> Scope: Shared lifecycle for SAL, tool-usage, and issue-usage experiments
> Purpose: Keep eval suggestions reproducible, comparable, and separated from adopted Agent behavior

## 1. Lifecycle

Every eval experiment follows this lifecycle:

1. Define the question.
2. Fix the baseline.
3. Run or collect comparable samples.
4. Analyze observations.
5. Write suggestions, not conclusions.
6. Validate suggestions through a follow-up experiment, replay, review, or tests.
7. Mark each suggestion as adopted, rejected, or still open.

## 2. Required Metadata

Record these fields whenever possible:

| Field | Purpose |
|-------|---------|
| `experiment_id` | Stable identifier for grouping related runs |
| `run_id` | Runtime execution identifier |
| `turn_id` | Turn-level trace identifier |
| `variant` | Example: `control`, `sal`, `tool-policy-v2` |
| `commit` | Source baseline |
| `branch` | Source branch |
| `model` | Model/provider used for the run |
| `task_text` | Exact user task or issue reference |
| `data_window` | Trace collection window |
| `artifacts` | Patches, logs, reports, screenshots, or table exports |

## 3. Comparison Rules

Comparable experiments should hold these constant:

1. Same task or issue.
2. Same commit.
3. Same model and important generation settings.
4. Same tool availability unless the experiment is about tools.
5. Isolated memory and workspace state when behavior can be stateful.

If one of these cannot be held constant, record the limitation before writing suggestions.

## 4. Suggestion Quality

A useful suggestion has:

1. Evidence: where the observation came from.
2. Mechanism: why the behavior may have happened.
3. Proposed next step: what to validate.
4. Risk: what could be harmed if adopted blindly.
5. Validation path: how to prove or reject it.

## 5. Adoption Gate

Do not adopt a suggestion into Agent behavior until at least one validation path is complete:

1. Controlled A/B experiment.
2. Replay on fixed traces or fixed tasks.
3. Human review of representative samples.
4. Code-level test or integration test.
5. Production-like dry run with artifact review.

## 6. Rejection Gate

Reject or defer a suggestion when:

1. Evidence is too sparse.
2. The signal depends on non-comparable runs.
3. The change would optimize one task class while harming another.
4. The metric cannot distinguish efficient behavior from skipped reasoning.
5. The telemetry is insufficient to support the claim.
