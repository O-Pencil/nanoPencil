# SAL — Structural Anchor Localization (Experimental)

A pluggable nanoPencil extension that gives the agent **address awareness** inside the codebase.

## Status

MVP — Layer 1 (task localization) and action grounding only. Memory anchoring is sidecar-only and does not modify NanoMem schema.

## Activation

SAL is **enabled by default** on every nanoPencil session.

```bash
# SAL active (default)
pencil -p "your prompt"

# SAL disabled — baseline memory mode
pencil --nosal -p "your prompt"
```

When `--nosal` is set, all hooks return early and zero work is performed.

## Slash commands

| Command | Purpose |
|---------|---------|
| `/sal:coverage [module1 module2 ...]` | Report DIP P3 coverage per module. PASS ≥ 90%, WARN ≥ 70%, otherwise FAIL. Layer 1 experiments require PASS in target modules. |
| `/sal:status` | Show flag state, snapshot timestamp, weights source |

## Sidecar output

When enabled, every turn writes a JSON record to:

```
<workspace>/.memory-experiments/sal/anchors/turn-<timestamp>.json
```

If `--experiment-id <run-id>` is provided, SAL exports anchors into a run-local directory instead:

```
<workspace>/.memory-experiments/runs/<run-id>/sal/anchors/turn-<timestamp>.json
```

Each record contains the task anchor, top candidates, evidence reasons, the action anchor inferred from tool touches, and the touched file list. These are the comparable artifacts for the SAL A/B experiment.

## Current evaluation workflow

The current experiment workflow is intentionally lightweight:

1. run control and SAL against isolated memory directories
2. provide `--experiment-id <run-id>` for the SAL run if you want run-local anchor export
3. collect artifacts under `.memory-experiments/runs/<run-id>/`
4. generate reports offline with:

```bash
npm run experiment:sal:report -- --run-dir .memory-experiments/runs/<run-id>
```

This workflow reads experiment artifacts and does not change normal product behavior.

## Tunable weights

Drop a `sal-config.json` next to the workspace root or under `.memory-experiments/sal/`:

```json
{
  "directFileEvidence": 0.45,
  "moduleResponsibilityMatch": 0.20,
  "dipContractMatch": 0.15,
  "importNeighborhoodMatch": 0.10,
  "memoryHistoryMatch": 0.10,
  "structuralSalience": 0.35
}
```

Missing fields fall back to defaults individually. See `weights.ts` for the full set.

## Pluggability contract

Deleting `extensions/defaults/sal/` and removing its registration in `builtin-extensions.ts` must leave the system fully functional. SAL must not be imported by any code in `core/`, `modes/`, `packages/`, or other extensions. Use `--nosal` to opt out at runtime without modifying code.

## See also

- `docs/SAL结构锚点定位方案.md` — full design document
- `docs/SAL对比试验设计.md` — A/B experiment protocol
- `docs/认知地图架构草案.md` — broader cognitive map context
