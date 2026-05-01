# Issue Usage Metrics

> Type: Metrics
> Status: Draft
> Scope: Issue-driven Agent evaluation
> Purpose: Measure whether issue context improves task boundaries and validation quality

## Metrics

| Metric | Meaning | Caution |
|--------|---------|---------|
| Boundary clarity | Issue defines what is in and out of scope | Needs reviewer judgment |
| Acceptance coverage | Criteria cover expected behavior and non-goals | More criteria is not always better |
| Evidence preservation | Issue links back to eval observations | Missing links reduce auditability |
| Validation completion | Issue ends with replay, test, or review | Some research issues may remain open |
| Scope drift | Work expands beyond issue boundary | May be justified but must be recorded |

## Review Questions

1. Did the Agent identify the issue boundary before changing files?
2. Did implementation match acceptance criteria?
3. Did validation artifacts prove the issue outcome?
4. Did the issue preserve whether a suggestion was adopted or rejected?
