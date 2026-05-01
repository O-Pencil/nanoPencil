# Eval Documentation Map

> Type: P2 Module Map
> Status: Active
> Scope: `docs/eval/` evaluation documentation
> Purpose: Keep experiment governance, SAL memory-anchor evaluation, tool-usage analysis, and issue-usage evaluation navigable and mutually verifiable

## Responsibility

This directory documents NanoPencil evaluation work. It does not define production behavior by itself. Eval documents produce observations and suggestions; adoption requires a follow-up experiment, replay, human review, or code-level validation.

## Members

| Path | Responsibility |
|------|----------------|
| `README.md` | Eval system entry point and category map |
| `experiment-protocol.md` | Shared experiment lifecycle and adoption rules |
| `decision-log-template.md` | Reusable template for recording suggestions and validation status |
| `sal-memory-anchor/` | SAL memory-anchor experiment documentation |
| `tool-usage-analysis/` | Tool trace analysis and tool-quality evaluation documentation |
| `issue-usage/` | Issue-driven workflow evaluation documentation |

## Evaluation Categories

1. Experiment governance: shared lifecycle, evidence levels, and adoption gates.
2. SAL memory anchors: whether structural anchors improve memory recall and task navigation.
3. Tool usage analysis: whether Agent tool calls are necessary, efficient, recoverable, and verifiable.
4. Issue usage: whether issues become bounded tasks with acceptance criteria, implementation, and validation.

## Rules

1. Do not treat eval output as a final conclusion.
2. Record suggestions separately from adopted changes.
3. Keep analysis reproducible through run IDs, task text, model, commit, variant, and artifact references.
4. Prefer trigger-based analysis commands over implicit daily routines.
5. Update this file when adding or deleting eval documentation subdirectories.
