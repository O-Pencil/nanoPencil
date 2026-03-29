# Loop Extension

`/loop` runs one autonomous task until the agent reports it as complete, reports it is blocked, the user stops it, or a safety limit is reached.

Commands:

- `/loop <goal>` starts an autonomous loop for one goal
- `/loop status` shows the active loop or the last finished loop
- `/loop stop` stops the active loop

Implementation notes:

- Loop turns are tagged with a loop prompt prefix so the extension can inject loop-specific system instructions.
- At the end of each loop run, the assistant must emit a `<loop-state>{...}</loop-state>` JSON block.
- The extension parses that block and either starts the next autonomous iteration or stops with a terminal status.
- Loop state is session-scoped and is cleared on shutdown or reload.
