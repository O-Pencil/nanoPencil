# SAL Comparative Experiment Design

> P1.5 | Parent: `AGENT.md`
> Type: Experiment Design
> Status: Proposed
> Scope: SAL on/off comparison inside the same repository
> Purpose: Validate whether structural anchoring improves memory quality and recall precision
> Isomorphism Rule: Each experiment run must preserve identical task inputs while isolating only the SAL switch and memory storage location
> Verification Rule: Results must be comparable through exported memory snapshots and scored evaluation sheets

## Identity

This document defines a controlled comparison experiment for SAL.

The experiment is designed around one principle:

the same codebase should be testable with two modes:

- baseline mode: normal memory behavior
- SAL mode: anchored memory behavior

The comparison must be runnable in the same repository, on the same tasks, with separate memory directories, and with exportable memory snapshots for later evaluation.

## WHO

Provides:
- experiment topology
- control and treatment definition
- CLI switch design
- memory isolation strategy
- export requirements
- evaluation workflow
- scoring dimensions

## FROM

Depends on:
- current CLI flag parsing
- current `NANOMEM_MEMORY_DIR` memory directory support
- current NanoMem storage layout
- future SAL switch implementation

## TO

Consumed by:
- SAL implementation planning
- experiment execution
- memory export tooling
- result comparison and validation

## HERE

This document defines how to test SAL, not how to implement SAL itself.
It assumes the same project and same task set will be run under two different memory modes.

---

## Core Experimental Question

Does SAL improve memory usefulness and localization quality compared with the current memory system when both are run on the same project tasks?

This is the primary question.

It can be decomposed into four smaller questions:

1. Does SAL store memories with more accurate structural grounding?
2. Does SAL recall more locally relevant memories for repeated tasks?
3. Does SAL reduce structurally irrelevant recall noise?
4. Does SAL improve pre-edit impact prediction quality?

---

## Experiment Topology

The experiment should use a same-code different-switch design.

### Treatment Group (default)

Run nanoPencil normally — SAL is enabled by default:

```powershell
pencil
```

or in print mode:

```powershell
pencil -p "your prompt"
```

### Control Group

Run nanoPencil with SAL disabled:

```powershell
pencil --nosal
```

or:

```powershell
pencil --nosal -p "your prompt"
```

### Experimental Constraint

Only one major behavior variable should change between groups:

- whether SAL localization and anchored-memory flow is enabled

Everything else should remain as consistent as possible:

- same repository
- same branch
- same task prompt
- same model
- same thinking level
- same tools
- same extension set

---

## Required Runtime Switches

The experiment assumes the following switch design.

### 1. `--nosal`

Boolean flag.

Semantics:

- absent (default): SAL task localization, action localization, anchored-memory persistence, and SAL-assisted recall are active
- present: SAL disabled, current baseline memory behavior

### 2. Optional `--sal-export`

String flag.

Semantics:

- when provided, writes the SAL-related localization records and experiment snapshot to a target path after run completion

### 3. Optional `--experiment-id`

String flag.

Semantics:

- tag all memory outputs and exports with the same experiment run identifier

This is optional but strongly recommended.

---

## Memory Isolation Strategy

Control and treatment groups must not write into the same memory directory.

This is a hard requirement.

The current NanoMem config already supports this pattern through:

```text
NANOMEM_MEMORY_DIR
```

### Recommended Directory Layout

```text
.memory-experiments/
  control/
    run-001/
    run-002/
  sal/
    run-001/
    run-002/
  exports/
    control/
    sal/
  scorecards/
```

### Example Usage

Control (SAL disabled):

```powershell
$env:NANOMEM_MEMORY_DIR="D:\Projects\nanoPencil\.memory-experiments\control\run-001"
pencil --nosal -p "Analyze session restoration behavior"
```

Treatment (SAL enabled, default):

```powershell
$env:NANOMEM_MEMORY_DIR="D:\Projects\nanoPencil\.memory-experiments\sal\run-001"
pencil -p "Analyze session restoration behavior"
```

This ensures:

- the same task can be run twice
- memories do not contaminate each other
- the final stored memory state is directly inspectable

---

## Task Design

The experiment should use repeated, architecture-sensitive tasks rather than generic one-shot prompts.

SAL is only worth testing in places where structural locality matters.

### Good Task Classes

- modify session lifecycle behavior
- adjust interactive mode initialization
- change extension lifecycle or shutdown behavior
- revise memory injection logic
- extend model/runtime switching logic
- fix multi-file regressions in one subsystem

### Bad Task Classes

- general explanation requests
- broad repo summaries
- style-only text rewrites
- one-file trivial edits with no architectural neighborhood

Reason:

SAL should be evaluated where structure matters enough to produce a measurable difference.

---

## Two Valid Experiment Modes

There are two legitimate ways to run the experiment.

### Mode A: Cold Comparison

Purpose:

compare how control and SAL store and retrieve memory from scratch.

Process:

1. use empty control and SAL memory directories
2. run the same task sequence independently
3. export both memory states
4. compare stored memories and later recall quality

### Mode B: Accumulated Comparison

Purpose:

compare how the two systems diverge after repeated work in the same region.

Process:

1. maintain separate persistent control and SAL directories across many sessions
2. repeatedly execute tasks in related architecture zones
3. export snapshots after each run or checkpoint
4. compare procedural growth and local-memory quality

### Recommendation

Use both.

Reason:

- cold comparison validates initial localization behavior
- accumulated comparison validates whether SAL improves long-term structural learning

---

## Experimental Run Unit

Each run should be treated as a structured unit.

```ts
interface ExperimentRun {
  experimentId: string;
  variant: "control" | "sal";
  runId: string;
  repoCommit: string;
  prompt: string;
  model: string;
  thinking?: string;
  memoryDir: string;
  startedAt: string;
  endedAt?: string;
  exportedMemoryPath?: string;
  exportedReportPath?: string;
}
```

The experiment should preserve this metadata.

Otherwise, later comparisons become unreliable.

---

## What Must Be Exported

The experiment is only useful if results are inspectable after the run.

At minimum, each run must export:

### 1. Full memory snapshot

Required contents:

- V1 files if present
- V2 files if present
- anchors if SAL is enabled
- prediction logs if SAL is enabled

Recommended export target:

```text
.memory-experiments/exports/{variant}/{runId}/memory-snapshot/
```

### 2. Experiment report

Suggested contents:

- prompt
- selected anchors
- recall set
- predicted impact set
- touched files
- session summary

Recommended export target:

```text
.memory-experiments/exports/{variant}/{runId}/report.json
```

### 3. Diff-friendly summary

Suggested contents:

- number of stored memories by type
- number of procedures
- number of local same-region memories
- number of predictions
- localization confidence summary

Recommended export target:

```text
.memory-experiments/exports/{variant}/{runId}/summary.json
```

---

## Export Semantics

The export operation should capture the state of `.memory` after the run completes.

If your eventual implementation uses a project-local experiment directory rather than the default home directory, that is preferred for testing.

### Recommended Export Command Shapes

Control (SAL disabled):

```powershell
$env:NANOMEM_MEMORY_DIR="D:\Projects\nanoPencil\.memory-experiments\control\run-001"
pencil --nosal -p "Fix extension shutdown lifecycle"
```

Then export:

```powershell
pencil --nosal --export-memory "D:\Projects\nanoPencil\.memory-experiments\exports\control\run-001"
```

SAL (default):

```powershell
$env:NANOMEM_MEMORY_DIR="D:\Projects\nanoPencil\.memory-experiments\sal\run-001"
pencil -p "Fix extension shutdown lifecycle"
```

Then export:

```powershell
pencil --export-memory "D:\Projects\nanoPencil\.memory-experiments\exports\sal\run-001"
```

If you prefer a single-run export flow, this is also valid:

```powershell
pencil --export-memory "D:\Projects\nanoPencil\.memory-experiments\exports\sal\run-001" -p "Fix extension shutdown lifecycle"
```

### Export Requirement

The export should be copy-based, not move-based.

The original memory directory must remain intact.

---

## Evaluation Dimensions

The comparison should be scored at three levels.

### Level 1: Storage Accuracy

Question:

did the system store the right memory in the right structural region?

Evaluation dimensions:

- whether the stored memory belongs to the task's actual architecture zone
- whether SAL anchors point to the correct module/file
- whether semantically unrelated but local-looking memories were avoided

Score labels:

- correct
- partially correct
- incorrect

### Level 2: Recall Relevance

Question:

when a similar task is run later, did the system recall the memories that actually matter?

Evaluation dimensions:

- same-region memory hit rate
- same-procedure memory hit rate
- irrelevant recall ratio
- recall explanation quality

Score labels:

- highly relevant
- partially relevant
- irrelevant

### Level 3: Predictive Value

Question:

did the stored and recalled memories help predict the right companion files or impact region?

Evaluation dimensions:

- predicted files vs touched files
- predicted modules vs actual action region
- missed companion files
- false positive neighbors

Score labels:

- strong
- moderate
- weak

---

## Recommended Scoring Artifacts

Each run should produce a scorecard entry.

```ts
interface ExperimentScorecard {
  experimentId: string;
  variant: "control" | "sal";
  runId: string;
  storageAccuracy: "correct" | "partial" | "incorrect";
  recallRelevance: "high" | "partial" | "irrelevant";
  predictionValue: "strong" | "moderate" | "weak";
  notes: string[];
}
```

These scorecards should be stored in:

```text
.memory-experiments/scorecards/
```

The key point is not scoring sophistication.
The key point is comparability across runs.

---

## Suggested Task Workflow

For each benchmark task, the recommended workflow is:

1. prepare clean control memory directory
2. run control variant
3. export control memory snapshot
4. prepare clean SAL memory directory
5. run SAL variant
6. export SAL memory snapshot
7. compare stored memory contents
8. run a follow-up related task on both variants
9. compare recall quality and prediction quality
10. record scorecards

This workflow should be repeated across a benchmark task set rather than a single task.

---

## Example Benchmark Pattern

A single benchmark should ideally use at least two linked tasks.

### Task A: Seed Task

Example:

```text
Fix session restoration behavior so resumed sessions recover the previous runtime state correctly.
```

Purpose:

create memory in a specific architecture region.

### Task B: Follow-up Task

Example:

```text
Now review the same session restore area and identify what companion files or side effects might need to be updated.
```

Purpose:

test whether the stored memory is recalled correctly and whether it improves local prediction.

This pair is much more informative than a single isolated task.

---

## Comparison Questions to Ask After Export

When comparing exported memory folders, ask:

### About storage

- Did SAL produce anchors that point to the actual touched module or file?
- Did control store similar memories but without structure?
- Did SAL produce fewer vague or floating summaries?

### About recall

- On the follow-up task, did SAL recall more same-region memories?
- Did SAL recall fewer semantically related but structurally irrelevant memories?
- Did SAL recall procedures that actually match the current region?

### About prediction

- Did SAL predict companion files more accurately?
- Did SAL narrow the impact region better?
- Did SAL surface architecture-local constraints earlier?

---

## Primary Success Criteria

SAL is worth keeping only if one or more of the following is measurably true:

1. stored memories are more accurately attached to the task's actual architecture region
2. follow-up tasks recall more same-region relevant memory
3. structurally irrelevant recall noise decreases
4. companion-file or impact prediction improves

If none of these happen, then SAL is not improving cognition.
It is only adding metadata.

---

## Risk Controls

### 1. Memory Contamination

Risk:

control and SAL runs influence each other.

Mitigation:

- separate memory directories
- separate exports
- explicit experiment IDs

### 2. Prompt Drift

Risk:

slightly different prompts invalidate comparison.

Mitigation:

- use fixed prompt files
- store prompts in versioned benchmark definitions

### 3. Model Variance

Risk:

model randomness overwhelms SAL effect.

Mitigation:

- fix model and thinking level
- if possible, repeat runs across multiple seeds or repetitions

### 4. Human Scoring Drift

Risk:

manual evaluation becomes inconsistent.

Mitigation:

- fixed score labels
- fixed benchmark sheet
- compare paired runs immediately

---

## Implementation Notes

This document does not require immediate implementation, but it does imply a practical feature set:

- `--nosal` (opt out — SAL is on by default)
- `--export-memory <dir>`
- optional `--experiment-id <id>`
- exported report files for localization and recall

The most important implementation constraint is:

the experiment must remain runnable inside the same project without branching the codebase into separate versions.

That means:

one codebase, one binary, one switch, separate memory directories.

---

## Summary

The correct SAL comparison experiment is:

1. run the same benchmark tasks in the same repository
2. switch only SAL on or off
3. isolate memory with separate `NANOMEM_MEMORY_DIR` values
4. export the full memory state after each run
5. compare storage quality, recall relevance, and prediction value

This produces a testable answer to the question:

does structural anchoring make nanoPencil's memory more accurate and more useful than the current baseline?
