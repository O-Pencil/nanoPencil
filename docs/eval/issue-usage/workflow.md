# Issue Usage Workflow

> Type: Workflow
> Status: Draft
> Scope: Turning eval suggestions into executable issues
> Purpose: Keep suggested improvements bounded, reviewable, and validated

## 1. Flow

```text
Eval Suggestion -> Experiment Issue -> Implementation or Replay -> Validation -> Adopted / Rejected
```

## 2. Issue Requirements

An eval-derived issue should include:

1. Observation source.
2. Suggested change or experiment.
3. Acceptance criteria.
4. Required artifacts.
5. Validation method.
6. Non-goals.

## 3. Acceptance Criteria

Good acceptance criteria are observable:

1. A report exists.
2. A replay passes.
3. A metric changes under comparable conditions.
4. A test covers the behavior.
5. A reviewer marks the sample as resolved.

Avoid criteria such as "Agent is better" or "tool use is smarter" without measurable evidence.

## 4. Closure

Close the issue only when the suggestion is adopted, rejected, or explicitly deferred with a reason.
