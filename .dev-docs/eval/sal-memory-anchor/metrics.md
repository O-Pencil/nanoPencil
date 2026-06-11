# SAL Memory Anchor Metrics

> Type: Metrics
> Status: Draft
> Scope: SAL anchor and memory-recall evaluation
> Purpose: Define measurable signals without turning them into automatic conclusions

## Metrics

| Metric | Meaning | Caution |
|--------|---------|---------|
| Anchor hit rate | Task anchor overlaps final touched area | Needs human review for broad tasks |
| Recall relevance | Recalled memory maps to task area | Semantic relevance may differ from structural relevance |
| Recall noise rate | Recalled memory is unrelated or misleading | Requires sample review |
| First useful file position | Tool index where Agent first reaches useful file | Lower is not always better if exploration was necessary |
| Follow-up exploration cost | Tool calls spent rediscovering known context | Must compare same task class |
| Stale recall count | Recalled memory conflicts with current code | Requires code review |

## Review Questions

1. Did the anchor point to the correct structural neighborhood?
2. Did the Agent use recalled memory as a hint or as unverified truth?
3. Did SAL reduce repeated exploration in follow-up work?
4. Did SAL add noise that displaced more useful context?
