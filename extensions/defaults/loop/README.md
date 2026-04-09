# Loop Extension

`/loop` schedules a recurring prompt or slash command for the current session.
For the autonomous "keep digging until done" runner, see the sibling
[`grub` extension](../grub/README.md).

## Quick start

```
/loop check the build                       # every 10m (default)
/loop 5m /grub status                       # slash command every 5 minutes
/loop every 10m Review test failures
/loop Drink water every 30m --name hydrate --max 8 --quiet
```

## Manage

```
/loop list                  # all scheduled loops
/loop status <ref>          # detail one loop (ref = name or id)
/loop pause <ref>
/loop resume <ref>
/loop run <ref>             # fire immediately
/loop cancel <ref>          # remove one
/loop clear                 # remove all
```

`<ref>` can be either the auto-generated id or the `--name` slug.

## Flags

- `--name <slug>` — give the loop a friendly handle so you can `pause hydrate`
  instead of memorising hex ids.
- `--max <n>` — auto-cancel after `n` runs.
- `--quiet` (or `-q`) — suppress per-tick UI messages. Errors and terminal
  events still surface; routine ticks are still recorded via `appendEntry`.

## Notes

- Loops are **session-scoped**: closing the session clears them, matching
  Claude Code's `/loop`.
- Due tasks wait for the agent to be idle; missed intervals collapse to one
  pending run.
- Slash-command payloads are detected at parse time and dispatched through
  `executeCommand`; everything else is delivered through `sendUserMessage` as
  a follow-up turn.
- After each loop tick the last assistant message is captured (truncated to
  120 chars) and shown in `/loop status <ref>` as `Last output`.
- Supports `s/m/h/d` durations and `hourly`/`daily` shortcuts.
