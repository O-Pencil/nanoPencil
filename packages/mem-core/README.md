# @pencil-agent/nano-mem

> Persistent memory engine for AI coding agents with consolidation, scoring, and insights.

## Features

- **Dual-path extraction**: LLM-based or heuristic regex fallback
- **Seven memory types**: Knowledge, Lessons, Preferences, Decisions, Entities, Patterns, Struggles
- **Stanford-style scoring**: Recency, importance, and relevance weighting
- **Utility-based eviction**: Access frequency vs base impact
- **A-MEM style linking**: Automatic memory association
- **Mem0-style updates**: Add, update, delete, retract operations
- **Spaced repetition**: Ebbinghaus forgetting curve reinforcement
- **Privacy protection**: PII filtering and TTL expiration
- **Bilingual prompts**: Chinese and English support
- **Insights reports**: Pattern/struggle analysis with recommendations

## Installation

```bash
npm install @pencil-agent/nano-mem
```

## Quick Start

```typescript
import { NanoMemEngine, getConfig } from '@pencil-agent/nano-mem';

// Create engine with defaults
const engine = new NanoMemEngine();

// Extract memories from conversation
const items = await engine.extractAndStore(
  "User: The API endpoint is /api/v1/users\nAssistant: Got it, I'll remember.",
  "my-project"
);

// Get memory injection for system prompt
const injection = await engine.getMemoryInjection(
  "my-project",
  ["api", "rest", "typescript"]
);

console.log(injection);
// ## Memory Injection
//
// ### Knowledge
// - The API endpoint is /api/v1/users
//
// ---
// This memory injection is based on your conversation history...
```

## Memory Types

| Type | Purpose | Half-Life |
|------|---------|-----------|
| `knowledge` | Project facts, API info | 60 days |
| `lessons` | Errors, solutions, learnings | 90 days |
| `preferences` | User preferences, style habits | 120 days |
| `decisions` | Architectural choices | 45 days |
| `entities` | Named entities (people, projects) | 30 days |
| `patterns` | Behavioral patterns (trigger→behavior) | 180 days |
| `struggles` | Struggle experiences (problem→attempts→solution) | 120 days |
| `work` | Work summaries (goal + summary) | 45 days |

## Configuration

```typescript
import { NanoMemEngine, getConfig } from '@pencil-agent/nano-mem';

const config = getConfig({
  memoryDir: './my-memory',
  tokenBudget: 8000,
  budget: {
    lessons: 0.25,
    knowledge: 0.25,
    episodes: 0.15,
    preferences: 0.1,
    work: 0.15,
    facets: 0.1
  },
  halfLife: {
    lesson: 90,
    fact: 60,
    pattern: 180
  },
  locale: 'zh' // or 'en'
});

const engine = new NanoMemEngine(config);
```

## API Reference

### Constructor

```typescript
constructor(overrides?: Partial<NanomemConfig>, llmFn?: LlmFn)
```

### Methods

- `extractAndStore(conversation, project)` - Extract and store memories
- `getMemoryInjection(project, contextTags, scope?)` - Get memory for system prompt
- `saveEpisode(episode)` - Save a conversation episode
- `consolidate()` - Consolidate episodes into long-term memory
- `searchEntries(query, scope?)` - Search memories
- `forgetEntry(id)` - Delete a memory
- `getStats()` - Get memory statistics
- `generateInsights()` - Generate insights report

### Extension Integration

For NanoPencil integration:

```typescript
import nanomemExtension from '@pencil-agent/nano-mem/extension';

// In NanoPencil
pi.registerExtension(() => nanomemExtension);
```

## Storage Structure

```
~/.nanomem/memory/
├── knowledge.json
├── lessons.json
├── preferences.json
├── facets.json
├── work.json
├── meta.json
└── episodes/
    ├── *.jsonl
```

## Environment Variables

- `NANOMEM_MEMORY_DIR` - Override memory directory (default: `~/.nanomem/memory`)
- `NANOMEM_TOKEN_BUDGET` - Token budget for injections (default: 6000)
- `NANOMEM_LOCALE` - Locale for prompts (`en` or `zh`, default: `en`)

## License

MIT
