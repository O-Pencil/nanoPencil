# SAL Structural Anchor Localization

> P1.5 | Parent: `AGENT.md`
> Type: Technical Proposal
> Status: Proposed
> Scope: DIP x NanoMem x Localization
> Purpose: Give tasks, memories, and actions stable addresses inside the project terrain
> Pluggability: SAL is fully removable — core logic must not depend on it
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
- evidence-based anchor scoring with tunable weights
- a progressive localization state machine
- an extension-packaged implementation contract
- an experimental validation framework

## FROM

Depends on:
- DIP P1/P2/P3 as the structural coordinate system
- NanoMem V1/V2 memories as the experience substrate
- tool traces, file reads/writes, and session outcomes as localization evidence
- existing graph and recall infrastructure in `mem-core`
- `core/extensions/types.ts` for ExtensionAPI, `registerFlag`, lifecycle hooks

## TO

Consumed by:
- `extensions/defaults/sal/` (planned extension implementation)
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

## Pluggable Extension Architecture

SAL must be implemented as a self-contained extension in `extensions/defaults/sal/`.

### Core Non-Coupling Contract

This is a hard constraint:

- no code in `core/`, `modes/`, `packages/`, or other extensions may import from `extensions/defaults/sal/`
- all SAL behavior must be injected via extension hooks and the `registerFlag` API
- removing the entire `extensions/defaults/sal/` directory must leave the system fully functional
- SAL can be disabled at runtime without side effects

The test for compliance:

if `extensions/defaults/sal/` is deleted and the CLI is run with `--nosal`, behavior must be byte-for-byte identical to the pre-SAL baseline.

### Extension Entry Point

SAL registers itself as a standard nanoPencil extension:

```ts
// extensions/defaults/sal/index.ts
import type { ExtensionAPI } from "../../../core/extensions/types.js";

export default function salExtension(api: ExtensionAPI) {
  api.registerFlag("nosal", {
    type: "boolean",
    description: "Disable Structural Anchor Localization",
    default: false,
  });

  // All hooks check opt-out. SAL is on by default.
  // If --nosal is set, this extension is a no-op at runtime.
  const isEnabled = () => !api.getFlag("nosal");

  api.on("before_agent_start", async (event, ctx) => {
    if (!isEnabled()) return;
    // Task localization and context injection
  });

  api.on("tool_execution_end", async (event, ctx) => {
    if (!isEnabled()) return;
    // Evidence accumulation: update action anchor from touched files
  });

  api.on("agent_end", async (event, ctx) => {
    if (!isEnabled()) return;
    // Memory commit: write anchors against final resolved location
  });
}
```

### Activation

SAL is **enabled by default** on every nanoPencil session.

```bash
# SAL active (default)
pencil -p "your prompt"

# SAL disabled — baseline memory mode
pencil --nosal -p "your prompt"
```

### Hook Responsibilities

| Hook | SAL Responsibility |
|------|--------------------|
| `before_agent_start` | Produce task anchor, inject terrain summary + anchored memories into system prompt via `systemPrompt` return |
| `tool_execution_start` | Begin evidence collection for current turn |
| `tool_execution_end` | Accumulate action evidence from file reads/writes/bash |
| `agent_end` | Commit final anchors to memory store |
| `session_shutdown` | Persist terrain graph snapshot if changed |

### Context Budget Contract

SAL's `before_agent_start` handler must honor the context window budget.

The handler must not inject unbounded terrain context.
Its injection should not exceed a configurable `contextBudgetTokens` limit (default: 800 tokens).

Reason:

if SAL-injected context is too large, it competes with conversation history and may be silently discarded during compaction, defeating its own purpose.

Injection fields: `regionSummary` (1–3 lines), `anchoredMemories` (top N truncated), `impactNeighbors` (top M), `procedures` (applicable local). Each field has an individual token cap. The handler must select and truncate rather than overflow.

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

Scoring weights are explicit runtime parameters, not constants.

They are configurable via `SalWeights` and must be adjustable before each experiment run.

```ts
interface SalWeights {
  // Anchor scoring weights (must sum to 1.0)
  directFileEvidence: number;        // default: 0.40
  moduleResponsibilityMatch: number; // default: 0.20
  dipContractMatch: number;          // default: 0.15
  importNeighborhoodMatch: number;   // default: 0.15
  memoryHistoryMatch: number;        // default: 0.10
  // Retrieval scoring weights (must sum to 1.0)
  semanticScore: number;             // default: 0.25
  recencyScore: number;              // default: 0.15
  importanceScore: number;           // default: 0.15
  structuralSalience: number;        // default: 0.30
  proceduralApplicability: number;   // default: 0.15
}
```

Weights are loadable from `sal-config.json` adjacent to the memory directory, allowing per-experiment overrides without code changes.

The anchor score is a weighted sum of the first five fields; the retrieval score is a weighted sum of the last five. Both formulas apply their respective weight groups linearly.

### Scoring Principle

File evidence is stronger than semantic resemblance.

This is intentional.

The purpose of SAL is to reduce the number of semantically plausible but structurally irrelevant recalls.

Default weights are initial hypotheses.
They must be treated as experimental parameters until validated by the A/B experiment.

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

## Terrain Graph and DIP Coverage

### DIP Coverage Prerequisite

SAL's terrain graph is built from DIP P2/P3 headers.

Localization quality degrades proportionally to DIP coverage gaps:

- missing P3 headers produce address space holes
- outdated `WHO/FROM/TO` fields produce wrong neighbor inferences
- missing P2 member entries make entire modules invisible to anchoring

**Before running SAL experiments on any target region**, verify that the region meets minimum coverage:

| Coverage Level | Requirement |
|----------------|-------------|
| Module (P2) | P2 AGENT.md exists, member list complete |
| Files in target module | ≥ 90% of `.ts` files have P3 headers |
| P3 fields | `WHO`, `FROM`, `TO`, `HERE` all non-empty |

If coverage is below threshold, the experiment will measure a handicapped baseline rather than SAL's actual capability.

The coverage check should run before the first experiment task:

```bash
pencil
> /sal:coverage core/runtime core/session
```

This command should report per-module coverage and block execution if below threshold.

### Terrain Graph Invalidation

The terrain graph is a snapshot derived from DIP documents and file structure.
It becomes stale when either changes.

Invalidation triggers:

| Event | Required Action |
|-------|----------------|
| New file added to a module | Regenerate module-level nodes |
| P3 header edited | Regenerate affected file node and neighbor edges |
| P2 AGENT.md updated | Regenerate module node and all child edges |
| File deleted | Remove node; mark anchors pointing to it as stale |
| Module moved or renamed | Regenerate full terrain graph |

Invalidation strategy for the first version:

- regenerate the terrain graph at session start if any DIP file has changed since last snapshot
- use file mtimes against `generatedAt` timestamp in `TerrainSnapshot`
- stale anchors (pointing to missing/moved files) must be flagged with `confidence: 0` rather than silently removed
- the extension can force full regeneration via `pencil --sal-rebuild-terrain`

Stale anchors must not silently improve recall scores.
If an anchor points to a path that no longer exists, it must be treated as unresolved, not matched.

---

## Integration with Cognitive Map Architecture

SAL is the first implementation layer of the Bridge Map (see `认知地图架构草案.md`):

- Terrain Map answers: what exists and how it is connected
- Memory Map answers: what has been learned before
- SAL answers: where should this memory or action be attached

SAL does not replace the cognitive map. It enables it.

---

## Integration with DIP

DIP is the canonical coordinate system. SAL uses it in three ways:

**Address Vocabulary**: P2/P3 provide stable structural names — module path, file responsibility, upstream/downstream.

**Relevance Filtering**: P3 fields allow cheap relevance estimation. `WHO` tells what the file provides; `TO` suggests impact neighbors; `FROM` suggests dependency context.

**Anchor Validation**: Every anchor should be explainable in DIP terms — e.g. "anchored to this file because the task matched its WHO and the tool edited it."

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

SAL introduces structural proximity as a new retrieval signal:

```ts
structuralSalience =
  terrainProximity(targetAnchor, memoryAnchor) +
  anchorConfidence +
  localFailureHistoryBoost +
  procedureApplicabilityBoost
```

The final retrieval score uses `SalWeights`. Default weights are initial hypotheses; adjust them after Layer 1 and Layer 2 evaluations produce evidence.

---

## Minimal Experimental Version

The first experimental SAL implementation should remain intentionally small.

### Required capabilities

1. Build a file/module address table from P2/P3
2. Produce a task anchor before execution
3. Produce an action anchor after execution
4. Attach episode memory to the resolved anchor
5. Prefer same-anchor memories during recall
6. Load `SalWeights` from `sal-config.json` if present

### Explicitly deferred

- full repository symbol graph
- automatic invariant extraction
- personality-conditioned map routing
- multi-hop predictive reasoning across large regions

Reason:

the first experiment should test localization quality, not total map sophistication.

---

## Testing Strategy

SAL should be tested in three sequential layers.

**Layer N must pass its success gate before Layer N+1 is run.**

Reason:

each failure points to a different defect.
Testing recall quality before localization accuracy is confirmed produces uninterpretable results.

### Layer 1: Localization Accuracy

**Prerequisite**: DIP coverage check passes for target modules.

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

**Module-level Top-3 hit rate ≥ 70%.**

If this gate fails, do not proceed to Layer 2.
Diagnose whether the failure is caused by weak evidence inference, stale terrain, or insufficient DIP coverage.

### Layer 2: Recall Quality Improvement

**Prerequisite**: Layer 1 success gate passed.

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

**SAL relevant recall ratio must exceed baseline by at least 15 percentage points.**

If this gate fails, SAL is not converting localization accuracy into retrieval value.
Inspect whether anchors are being used in the retrieval scoring or only stored.

### Layer 3: Active Understanding Proxy

**Prerequisite**: Layer 2 success gate passed.

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
This is not a failure — it means SAL is useful for recall but the prediction loop needs additional work.

---

## Recommended Evaluation Sequence

```
DIP Coverage Check
      ↓ (pass threshold)
Layer 1: Localization Accuracy
      ↓ (≥ 70% Top-3 module hit rate)
Layer 2: Recall Quality Improvement
      ↓ (SAL recall relevance ≥ baseline + 15pp)
Layer 3: Active Understanding Proxy
```

This order matters because each failure points to a different defect:

- DIP coverage failure → fix documentation before experimenting
- poor localization → address inference is weak
- weak recall improvement → anchors are not adding retrieval value
- weak prediction improvement → graph neighborhood reasoning is too shallow

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

| Failure | Mitigation |
|---------|-----------|
| **Over-anchoring** — memory attached to wrong location | Anchor confidence; multiple candidates; weak-anchor decay |
| **Graph Explosion** — too many candidates create noise | Module/file level first; cap secondary anchors; symbol-level deferred |
| **Stale Terrain** — DIP drifts from code | Mtime-based regeneration at session start; stale anchors get `confidence: 0`; `--sal-rebuild-terrain` for forced refresh |
| **Historical Overfitting** — old local memories dominate | Procedure status lifecycle; confidence decay; prediction validation feedback |
| **Context Budget Overflow** — SAL injection crowds conversation history | `contextBudgetTokens` cap (default: 800); per-field truncation; re-evaluate injection post-compaction, never use pre-compaction cache |

---

## Decision Standard

SAL is worth continuing only if it improves at least one of the following in measurable form:

- task-region localization accuracy
- recall relevance near the current region
- impact prediction quality
- explainability of why a memory was recalled

If none of these improve, then SAL has become a naming layer rather than a functional architecture improvement.

If the experiment confirms SAL is not valuable:
- delete `extensions/defaults/sal/`
- remove anchor metadata from memory store
- no other module requires changes

This is the pluggability guarantee.

---

## Summary

SAL is the technical scheme that gives nanoPencil address awareness inside the code city.

Its minimal path is:

1. verify DIP coverage in target modules
2. localize the task via extension hook before execution
3. localize the executed action via tool trace observation
4. anchor memory to the resulting structural address
5. recall memory by structural neighborhood before semantic fallback
6. test localization accuracy before testing recall quality
7. tune `SalWeights` based on evidence, not intuition

This is the narrowest and most testable path from passive retrieval to active understanding.

SAL's value proposition is falsifiable by design.
Its exit is clean by contract.
