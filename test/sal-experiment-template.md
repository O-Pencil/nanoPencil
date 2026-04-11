# SAL Experiment Template

Use this template to compare `--nosal` and default SAL behavior with any model.

This is a manual experiment template, not an automated unit test.

## Goal

Measure whether SAL improves:

- structural task localization
- follow-up task recall quality
- search efficiency across related code paths
- final edit concentration and reduced rework

## When To Use This Template

Use this template only for tasks that:

- span more than one file or subsystem
- require architectural navigation
- benefit from remembering the first task in a second follow-up task

Do not use this template for:

- single-file typo fixes
- formatting-only changes
- trivial UI copy updates
- tasks that can be solved without navigation

## Recommended Task Shape

Run the same experiment in two rounds.

Round 1 should create useful experience in a local code region.

Round 2 should revisit the same region without fully restating the architecture.

## Suggested Image-Flow Task

This task family is appropriate for testing image-input behavior with different models.

### Round 1 Prompt

```text
Fix the image attachment flow so dropping an image on a non-vision model gives a clear guidance path and does not leave stale attachment state.
```

### Round 2 Prompt

```text
Now make the same image-input behavior consistent for clipboard paste and drag-drop, without re-explaining the architecture.
```

## Experiment Layout

Create isolated memory directories for each variant.

```bash
mkdir -p .memory-experiments/control/run-001
mkdir -p .memory-experiments/sal/run-001
mkdir -p .memory-experiments/notes
```

## Model Placeholder

Replace `<MODEL_ARGS>` with the model selection flags you want to test.

Examples:

```bash
--model openai/gpt-5.4-mini
--model anthropic/claude-opus-4.1
--model openrouter/google/gemini-2.5-pro
```

## Control Run

Round 1:

```bash
NANOMEM_MEMORY_DIR=$PWD/.memory-experiments/control/run-001 \
pencil <MODEL_ARGS> --nosal
```

Submit Round 1 prompt, complete the task, then save the result summary.

Round 2:

```bash
NANOMEM_MEMORY_DIR=$PWD/.memory-experiments/control/run-001 \
pencil <MODEL_ARGS> --nosal
```

Submit Round 2 prompt in a fresh session.

## SAL Run

Round 1:

```bash
NANOMEM_MEMORY_DIR=$PWD/.memory-experiments/sal/run-001 \
pencil <MODEL_ARGS>
```

Round 2:

```bash
NANOMEM_MEMORY_DIR=$PWD/.memory-experiments/sal/run-001 \
pencil <MODEL_ARGS>
```

## Required Artifacts

After each run, save:

- final code diff
- terminal transcript or session link
- touched files list
- whether the task completed successfully
- number of interaction turns
- whether the agent searched unrelated files first

Also save the memory directories as-is.

For SAL runs, also keep:

- `.memory-experiments/sal/anchors/turn-*.json` if present

## Manual Scorecard

Copy this block into a notes file for each run:

```text
Run ID:
Variant: control | sal
Model:
Task family: image-flow
Round: 1 | 2

Completed: yes | no | partial
Turns used:
Files touched:
Primary target files:
Unrelated files explored first:
Rework observed:

Task anchor hit:
- exact
- partial
- miss

Action concentration:
- high
- medium
- low

Follow-up recall quality:
- high
- medium
- low

Notes:
```

## What To Compare

Compare control vs SAL on these dimensions:

1. Time-to-target

Did the model enter the right module faster?

2. Search noise

Did it open fewer irrelevant files before finding the real path?

3. Edit concentration

Did the final patch stay concentrated in the correct subsystem?

4. Follow-up reuse

In Round 2, did it behave as if it remembered the correct local architecture?

5. Memory evidence

Did the SAL run write useful structural anchors while control stayed unanchored?

## Success Criteria

Treat SAL as showing a useful signal only if at least one of these is true in Round 2:

- it reaches the correct files materially faster
- it explores fewer unrelated files
- it produces a more concentrated patch
- it avoids re-deriving architecture already established in Round 1

## Invalid Runs

Discard a run if any of these happen:

- the task is solved from one obvious file with no search
- the model changes between control and SAL unexpectedly
- memory directories are reused across unrelated experiments
- the prompt wording differs materially between variants
- the target code changed between the two variants

## Minimal Notes File Template

Save one notes file per variant, for example:

- `test-results-control-run-001.md`
- `test-results-sal-run-001.md`

Suggested structure:

```text
# Run Summary

Variant:
Model:
Commit:

## Round 1
Result:
Turns:
Touched files:
Observations:

## Round 2
Result:
Turns:
Touched files:
Observations:

## Verdict
Did SAL help?
Why or why not?
```
