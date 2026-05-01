# SAL Memory Anchor Hypotheses

> Type: Hypothesis List
> Status: Draft
> Scope: Testable SAL memory-anchor claims
> Purpose: Keep SAL evaluation focused on falsifiable behavior

## H1: Structural Recall Relevance

SAL should increase the share of recalled memories that map to the module or file area later touched by the Agent.

Validation path:

1. Compare control and SAL runs on the same task.
2. Review `eval_memory_recalls`, anchor paths, and final diff.
3. Check whether high-rank injected memories align with touched files.

## H2: Reduced Repeated Exploration

SAL should reduce repeated exploration in follow-up tasks within the same structural area.

Validation path:

1. Use two-round experiments: seed task and follow-up task.
2. Compare first useful file access position.
3. Compare redundant search/read/tool loops.

## H3: Noise Control

SAL should not increase irrelevant memory injection.

Validation path:

1. Review recalls that are structurally distant from the task.
2. Mark stale or misleading memory samples.
3. Compare noise rate between variants.

## H4: No Blind Adoption

SAL may surface useful memory, but the Agent should still verify repository state before editing.

Validation path:

1. Look for edits made only from recalled memory without local evidence.
2. Check whether the Agent reads current files before modifications.
