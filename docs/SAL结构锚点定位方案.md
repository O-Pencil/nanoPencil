# SAL Structural Anchor Localization

> P1.5 | Parent: `CLAUDE.md`
> Type: Technical Proposal
> Status: Proposed
> Scope: DIP x NanoMem x Localization
> Purpose: Give tasks, memories, and actions stable addresses inside the project terrain
> Isomorphism Rule: Every anchor must be traceable to verifiable structural evidence
> Verification Rule: Localization quality must be measured by hit rate, recall relevance, and prediction accuracy

## Identity

SAL, short for Structural Anchor Localization, is a localization scheme for nanoPencil.

Its purpose is not to solve understanding directly.
Its purpose is to solve a more basic problem first:

- where the current task is happening
- where a memory belongs
- where an action actually landed

The guiding assumption is:

active understanding cannot emerge unless the agent has stable address awareness inside the codebase.

## WHO

Provides:
- a localization model for project-space addressing
- anchor schema for task, memory, and action
- evidence-based anchor scoring
- a progressive localization state machine
- an experimental validation framework

## FROM

Depends on:
- DIP P1/P2/P3 as the structural coordinate system
- NanoMem V1/V2 memories as the experience substrate
- tool traces, file reads/writes, and session outcomes as localization evidence
- existing graph and recall infrastructure in `mem-core`

## TO

Consumed by:
- future memory anchoring
- structure-first recall
- impact prediction
- procedural memory synthesis
- cognitive map experiments

## HERE

This document defines the localization layer between terrain structure and memory graph.
It is not the whole cognitive map.
It is the address system that makes the cognitive map possible.

---

## Problem Statement

Current memory retrieval is useful but still mostly passive.
It can retrieve by tags, recency, similarity, and graph neighbors, but it does not yet reliably answer:

- which exact region of the project the user is working in
- which memories belong to that region
- whether recalled memories are structurally close or only semantically similar

Without stable localization, memory remains weakly grounded.

The result is predictable:

- some recalls are useful but noisy
- some semantically similar recalls are structurally irrelevant
- prediction about affected files remains weak
- procedural knowledge cannot accumulate by region

SAL addresses this by giving project-space addresses to tasks, memories, and actions.

---

## Core Thesis

DIP provides the terrain coordinate system.

NanoMem provides the memory substrate.

SAL provides the localization mechanism that binds the two.

Its central design claim is:

memory retrieved by structural neighborhood should outperform memory retrieved only by semantic resemblance on repeated codebase tasks.

---

## Design Goals

SAL is designed to achieve five goals:

1. Let the agent infer where a task most likely lives before execution
2. Let the system attach memories to structural addresses after execution
3. Let recall prioritize local memories near the current address
4. Let impact prediction start from structural neighborhood rather than generic similarity
5. Let repeated success in one region accumulate into localized procedural knowledge

Non-goals for the first version:

- full symbolic reasoning across the whole repository
- personality-driven cognitive map mutation
- abstract self-modeling of the agent
- replacing all existing NanoMem retrieval logic

---

## Address Model

SAL treats the repository as a navigable terrain.
An anchor is a normalized structural address inside that terrain.

```ts
interface StructuralAnchor {
  workspaceId: string;
  modulePath?: string;
  filePath?: string;
  dipP2?: string;
  dipP3?: string;
  symbol?: string;
  confidence: number;
  source: Array<"prompt" | "tool" | "file" | "p3" | "import-graph" | "manual">;
}
```

### Addressing Policy

The first production-oriented version should prioritize coarse but stable anchors:

- module-level anchors
- file-level anchors
- P3-aligned file coordinates

Symbol-level anchors are optional later.

Reason:

coarse stable localization is more valuable than fine-grained but brittle localization.

---

## Anchor Types

SAL localizes three different target classes.

### 1. Task Anchor

Represents the agent's current best guess about where the user's request belongs.

Examples:

- `core/session`
- `core/runtime/agent-session.ts`
- `modes/interactive/theme`

### 2. Memory Anchor

Represents where a memory entry belongs in the project terrain.

Applicable to:

- episode memory
- facet memory
- semantic memory
- procedural memory

### 3. Action Anchor

Represents where actual execution landed.

Derived from:

- tool traces
- file edits
- bash outputs
- errors
- stack traces

This is the most important ground-truth signal.

---

## Canonical Resolution Object

Every localization pass should produce an auditable resolution object.

```ts
interface AnchorResolution {
  targetKind: "task" | "memory" | "action";
  candidates: Array<{
    anchor: StructuralAnchor;
    score: number;
    reasons: string[];
  }>;
  selected?: StructuralAnchor;
  unresolvedSignals?: string[];
}
```

This is a hard requirement.

The system must not only say where it localized.
It must also say:

- why
- what alternatives existed
- what evidence is still missing

If localization cannot explain itself, it cannot be tested.

---

## Localization API

SAL should conceptually expose three localization entry points.

```ts
locateTask(prompt, cwd, mentionedFiles) -> StructuralAnchor[]
locateMemory(memoryEntry, episode, traces) -> StructuralAnchor[]
locateAction(toolCall, changedFiles, outputs) -> StructuralAnchor[]
```

Each function should return ranked candidates rather than a single hard choice.

Reason:

real repository work is often cross-module, and ambiguity should be represented instead of hidden.

The common policy should be:

- one primary anchor
- zero to three secondary anchors
- confidence-aware selection

---

## Evidence Model

Localization quality depends on evidence quality.
SAL should explicitly rank evidence by strength.

### Level A: Strong Evidence

- the user explicitly mentions a file path
- a tool directly reads or edits a file
- a stack trace points to a file
- a command output identifies a target file or module

### Level B: Medium-Strong Evidence

- P3 `WHO/FROM/TO/HERE` aligns with the task description
- module path matches the task domain
- import/export relationships narrow the likely neighborhood

### Level C: Medium Evidence

- prompt concepts strongly align with module responsibility
- historical tasks of the same class often land in the same module

### Level D: Weak Evidence

- embedding similarity
- keyword overlap
- tag similarity

### Level E: Manual Evidence

- user confirms or corrects a structural anchor

---

## Anchor Scoring

The first scoring model should bias toward explicit structure.

```ts
anchorScore =
  directFileEvidence * 0.40 +
  moduleResponsibilityMatch * 0.20 +
  dipContractMatch * 0.15 +
  importNeighborhoodMatch * 0.15 +
  memoryHistoryMatch * 0.10
```

### Scoring Principle

File evidence is stronger than semantic resemblance.

This is intentional.

The purpose of SAL is to reduce the number of semantically plausible but structurally irrelevant recalls.

---

## Progressive Localization State Machine

Localization should not be treated as a one-shot decision.
It should be treated as a progressive convergence process.

### State 1: Hypothesis

At prompt entry, the system only has a rough guess.

Sources:

- prompt text
- mentioned file names
- current working directory

Output:

- low-confidence task anchor candidates

### State 2: Evidence Convergence

After initial reads, searches, or P3 inspection, anchor confidence should update.

Sources:

- file reads
- grep/find results
- P3 contracts
- import neighborhood

Output:

- narrowed anchor set
- stronger primary anchor

### State 3: Execution Grounding

After real tool execution and file edits, actual landing zone becomes visible.

Sources:

- touched files
- command outputs
- errors
- diffs

Output:

- action anchor
- highest-confidence ground-truth candidate

### State 4: Memory Commit

At turn end or session end, write memories against final anchors.

Sources:

- final action anchor
- episode summary
- tool traces
- error summaries

Output:

- anchored episode memory
- anchored lessons or procedures

---

## Integration with Cognitive Map Architecture

SAL is the first implementation layer of the Bridge Map defined in the cognitive-map draft.

Relationship:

- Terrain Map answers: what exists and how it is connected
- Memory Map answers: what has been learned before
- SAL answers: where should this memory or action be attached

Therefore:

SAL does not replace the cognitive map.
It enables it.

Without SAL, the bridge between terrain and memory stays weak.

---

## Integration with DIP

DIP is the canonical coordinate system.

SAL should use DIP in three ways:

### 1. Address Vocabulary

P2 and P3 provide stable structural names.

Examples:

- module path
- file responsibility
- downstream consumers
- upstream dependencies

### 2. Relevance Filtering

P3 allows cheap relevance estimation before deep reading.

Examples:

- `WHO` tells what the file provides
- `TO` suggests likely impact neighbors
- `FROM` suggests dependency context

### 3. Anchor Validation

An anchor should be explainable in DIP terms whenever possible.

Examples:

- "anchored to this file because the task matched its WHO and the tool edited it"
- "anchored to this module because multiple P3 files inside it matched the same responsibility band"

---

## Integration with NanoMem

SAL should integrate with NanoMem incrementally.

### Phase-appropriate extension

The first version should not rebuild memory storage.
It should extend V2 memory entries with anchor metadata or add a sidecar anchor index.

Candidate model:

```ts
interface MemoryAnchor {
  memoryId: string;
  memoryKind: "episode" | "facet" | "semantic" | "procedural";
  anchor: StructuralAnchor;
  inferredFrom: Array<"tool-trace" | "file-path" | "p3-header" | "symbol-mention" | "manual-link">;
  createdAt: string;
}
```

### Retrieval implication

Once memory entries are anchored, recall order can change:

1. directly anchored local memories
2. neighboring anchored memories
3. procedural memories in the same region
4. semantic fallback by similarity

This is the simplest structure-first recall policy.

---

## Retrieval Hypothesis

SAL introduces one new retrieval signal:

### Structural Proximity

```ts
structuralSalience =
  terrainProximity(targetAnchor, memoryAnchor) +
  anchorConfidence +
  localFailureHistoryBoost +
  procedureApplicabilityBoost
```

A practical hybrid ranking formula could be:

```ts
finalScore =
  semanticScore * 0.25 +
  recencyScore * 0.15 +
  importanceScore * 0.15 +
  structuralSalience * 0.30 +
  proceduralApplicability * 0.15
```

This formula should remain experimental.
Its purpose is to validate whether structural proximity deserves first-class ranking weight.

---

## Minimal Experimental Version

The first experimental SAL implementation should remain intentionally small.

### Required capabilities

1. Build a file/module address table from P2/P3
2. Produce a task anchor before execution
3. Produce an action anchor after execution
4. Attach episode memory to the resolved anchor
5. Prefer same-anchor memories during recall

### Explicitly deferred

- full repository symbol graph
- automatic invariant extraction
- personality-conditioned map routing
- multi-hop predictive reasoning across large regions

Reason:

the first experiment should test localization quality, not total map sophistication.

---

## Testing Strategy

SAL should be tested in three layers.

### Layer 1: Localization Accuracy

Question:

can the system correctly identify where a task belongs?

#### Test method

Create a manually labeled benchmark set.

Each sample contains:

- user task description
- expected primary module
- expected primary file when applicable
- acceptable neighbor region

Example samples:

- "modify session restore behavior"
- "adjust interactive theme initialization"
- "fix extension shutdown lifecycle"
- "change memory injection logic"

#### Metrics

- Top-1 module hit rate
- Top-3 module hit rate
- Top-1 file hit rate
- Top-3 file hit rate

#### Success gate

If module-level Top-3 accuracy is weak, SAL should not yet be used to drive memory recall.

### Layer 2: Recall Quality Improvement

Question:

does structure-first recall retrieve more relevant memories than baseline recall?

#### Test method

Run A/B comparison:

- A: current recall
- B: SAL-assisted recall

For the same task, compare recalled memories and score them manually.

Suggested relevance labels:

- highly relevant
- partially relevant
- irrelevant

#### Metrics

- relevant recall ratio
- irrelevant recall ratio
- same-region procedure hit rate
- reduction in semantically similar but structurally irrelevant recalls

#### Success gate

If SAL does not reduce irrelevant local recall noise, the anchors are not providing enough structural value.

### Layer 3: Active Understanding Proxy

Question:

does localization improve impact prediction before edits?

#### Test method

Before execution, require the system to predict:

- likely affected files
- likely affected modules
- possible invariants at risk

After execution, compare prediction against actual touched files and failures.

#### Metrics

- file prediction precision
- file prediction recall
- companion-file miss rate
- invariant risk hit rate

#### Success gate

If localization improves recall but not prediction, then SAL is still acting only as a better retrieval layer.

---

## Recommended Evaluation Sequence

SAL should be evaluated in this order:

1. localization accuracy
2. recall quality improvement
3. impact prediction improvement

This order matters because each failure points to a different defect:

- poor localization means address inference is weak
- weak recall improvement means anchors are not adding enough value
- weak prediction improvement means graph neighborhood reasoning is still too shallow

---

## Expected First-Stage Benefits

If SAL is correct, the earliest visible improvements should be concrete rather than dramatic.

Expected signs:

- memory recall clusters closer to the current module
- repeated tasks retrieve more local lessons and procedures
- fewer companion files are forgotten
- system prompt becomes shorter but more region-relevant
- the agent can better explain why it is reading certain files first

Unexpectedly large claims should be treated with suspicion.

The correct first-stage outcome is not "human-like cognition."
The correct first-stage outcome is:

better grounded recall, better local prediction, and more auditable reasoning.

---

## Failure Modes

### 1. Over-anchoring

A memory is attached to the wrong module or file.

Mitigation:

- anchor confidence
- multiple candidates
- weak-anchor decay

### 2. Graph Explosion

Too many address candidates create noise.

Mitigation:

- begin at module/file level
- cap secondary anchors
- add symbols later only if justified

### 3. Stale Terrain

DIP documentation drifts from real structure.

Mitigation:

- tie terrain indexing to DIP verification
- mark stale anchors with lower trust

### 4. Historical Overfitting

Old local memories dominate even after the region changes.

Mitigation:

- procedure status lifecycle
- confidence decay
- prediction validation feedback

---

## Decision Standard

SAL is worth continuing only if it improves at least one of the following in measurable form:

- task-region localization accuracy
- recall relevance near the current region
- impact prediction quality
- explainability of why a memory was recalled

If none of these improve, then SAL has become a naming layer rather than a functional architecture improvement.

---

## Summary

SAL is the technical scheme that gives nanoPencil address awareness inside the code city.

Its minimal path is:

1. localize the task
2. localize the executed action
3. anchor memory to the resulting structural address
4. recall memory by structural neighborhood before semantic fallback
5. test whether this improves retrieval and prediction

This is the narrowest and most testable path from passive retrieval to active understanding.
