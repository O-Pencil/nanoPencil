# Tool Usage Metrics

> Type: Metrics
> Status: Draft
> Scope: Tool trace evaluation
> Purpose: Define stable measurements for tool usage without overclaiming causality

## Core Metrics

| Metric | Meaning | Review Caution |
|--------|---------|----------------|
| Tool usage rate | Share of turns with at least one tool call | Discussion-only turns should be separated |
| Average tool calls | Mean tool calls per turn or intent | Complex tasks may require more calls |
| Error rate | Turns or calls with tool errors | Needs error type before root cause claims |
| Recovery cost | Tool calls after first error | High cost may be valid during debugging |
| Empty-tool latency | Duration for turns with no tools | May be normal for pure discussion |
| Truncation rate | Tool calls with truncated output | Requires summary quality review |
| Repeated tool pattern | Consecutive or redundant tool usage | Needs sample replay |
| Edit verification rate | Edits followed by build/test/read verification | Not every doc edit needs tests |
| First useful tool position | When the Agent reaches useful evidence | Requires human labeling |

## Intent-Aware Review

Different intents need different expectations:

| Intent | Expected Tool Shape |
|--------|---------------------|
| `discussion_only` | Usually no tools |
| `explain` | Search/read-heavy, low edit rate |
| `fix` | Locate evidence, edit, verify |
| `feat` | Explore adjacent code, edit, verify |
| `refactor` | Broader impact review and regression validation |
| `config_debug` | Command output and configuration review |

If intent is `unknown`, treat tool-quality scoring as low confidence.
