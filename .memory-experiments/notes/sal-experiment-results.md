# SAL Experiment Results: Image-Flow Task

## Experiment Setup

- **Task**: Fix image attachment flow for non-vision models
- **Round 1**: Initial fix
- **Round 2**: Follow-up (clipboard + drag-drop consistency)
- **Date**: 2026-04-11

## Branches

| Experiment | Branch | Commit |
|------------|--------|--------|
| Control R1 | experiment/control-run-001 | 3da6381 |
| Control R2 | experiment/control-run-002 | ba90508 |
| SAL R1 | experiment/sal-run-001 | fffb586 |
| SAL R2 | experiment/sal-run-002 | 718fc73 |

## Code Changes Summary

### Round 1

| Variant | Insertions | Deletions | Net Change |
|---------|------------|-----------|------------|
| Control (--nosal) | 123 | 44 | +79 |
| SAL (default) | 84 | 17 | +67 |

**Observation**: SAL produced fewer lines of code change while achieving the same goal.

### Round 2

| Variant | Insertions | Deletions | Net Change |
|---------|------------|-----------|------------|
| Control (--nosal) | 4 | 0 | +4 |
| SAL (default) | 23 | 7 | +16 |

**Observation**: Control had minimal change (already understood from R1), SAL made more changes (possibly refining approach).

## Memory Data

| Metric | Control | SAL |
|--------|---------|-----|
| Memory files | 7 | 25+ |
| SAL anchors | 0 | 4 |
| Knowledge entries | ✓ | ✓ |
| Lessons learned | ✓ | ✓ |
| Semantic memory | ✓ | ✓ (v2) |

## SAL Anchors Generated

- turn-2026-04-11T09-06-22-458Z.json
- turn-2026-04-11T09-52-06-451Z.json
- turn-2026-04-11T11-12-53-851Z.json
- turn-2026-04-11T11-26-51-466Z.json

## Preliminary Findings

### Round 1: SAL Advantage

1. **Less code churn**: SAL produced 67 net lines vs Control's 79
2. **Structural anchors**: SAL wrote 4 turn records documenting task localization
3. **Memory richness**: SAL generated more comprehensive memory artifacts

### Round 2: Follow-up Comparison

1. **Control**: Minimal change (4 lines) - suggests R1 understanding was preserved
2. **SAL**: More refinement (16 net lines) - may indicate deeper reconsideration

## Next Steps

1. Review actual code diffs to understand quality difference
2. Compare touched file lists between variants
3. Analyze SAL anchor content for structural insights
4. Repeat experiment with different task family

## Notes

- Model: (user to specify)
- Session count: 4 total
- Task completed: Both variants successfully fixed image-flow
