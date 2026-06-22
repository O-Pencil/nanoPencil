# TokenSave

TokenSave is a default-on extension that reduces noisy shell output before it enters the agent context.

## Behavior

- Commands execute with their original shell semantics.
- TokenSave plans commands before execution and filters output after execution.
- Small outputs, unsafe redirection, heredocs, and explicitly disabled commands pass through unchanged.
- Filtered outputs include estimated token savings and a raw recovery file path when available.
- Both agent-called `bash` tools and user `!` bash commands are covered. `!!` commands stay excluded from context and are not intercepted.

## Disable

Set either environment variable on a command to bypass filtering:

```bash
TOKEN_SAVE_DISABLED=1 git status
TOKENSAVE_DISABLED=1 npm test
```

## Stats

Use:

```text
/tokensave
/tokensave history
/tokensave plan <command>
```

## Config Filters

User filters load from:

```text
~/.catui/token-save/filters.json
```

Project filters load from:

```text
.catui/token-save/filters.json
```

Project filters are ignored unless the project explicitly opts in with:

```json
{ "trusted": true }
```

at:

```text
.catui/token-save/trust.json
```

## Runtime Data

History JSONL and raw output recovery files are stored under the user-level
config dir, keyed by a 12-char hash of the project path. They never live in
your project tree.

```text
~/.catui/token-save/projects/<projectKey>/
  ├── history.jsonl
  └── raw/<ts>-<rand>.log
```

On first run after upgrading, legacy data under
`<project>/.catui/token-save/{history.jsonl,raw/}` is migrated once to the
new location and marked with a `.migrated` sentinel.
