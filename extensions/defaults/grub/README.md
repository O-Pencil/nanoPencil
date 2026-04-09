# Grub Extension

`/grub` runs one autonomous task until the agent reports it complete, reports it
is blocked, the user stops it, or a safety limit is reached.

## Commands

- `/grub <goal>` — start one autonomous digging task
- `/grub status` — show the active or last finished grub task
- `/grub stop` — stop the active grub task

## How it works

- Each grub iteration is tagged with a `[GRUB:<id>:<n>]` prompt prefix so the
  extension can recognise its own injected turns.
- A grub-specific system prompt is appended via `before_agent_start` whenever
  the active prompt belongs to grub.
- At the end of each grub turn the assistant must emit a single
  `<loop-state>{"status":"continue|complete|blocked", "summary":"...", "nextStep":"..."}</loop-state>`
  block. The extension parses that block and either dispatches the next
  iteration or stops with a terminal status.
- Safety limits: 25 iterations and 3 consecutive failures by default.

For the recurring scheduler that runs prompts or slash commands on an interval
see the sibling [`loop` extension](../loop/README.md).
