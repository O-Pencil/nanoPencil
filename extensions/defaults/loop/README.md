# Loop Extension

This extension provides two separate commands:

- `/grub` runs one autonomous task until the agent reports it as complete, reports it is blocked, the user stops it, or a safety limit is reached.
- `/loop` schedules a recurring prompt or slash command while the current session stays open.

Commands:

- `/grub <goal>` starts one autonomous digging task
- `/grub status` shows the active or last finished grub task
- `/grub stop` stops the active grub task
- `/loop check the build` schedules that prompt every 10 minutes by default
- `/loop every 10m Review test failures` schedules a recurring prompt
- `/loop Run /grub status every 1h` schedules a recurring slash command
- `/loop list` shows active scheduled tasks
- `/loop cancel <id>` removes one scheduled task
- `/loop clear` removes all scheduled tasks

Implementation notes:

- Grub turns are tagged with a loop prompt prefix so the extension can inject loop-specific system instructions.
- At the end of each grub run, the assistant must emit a `<loop-state>{...}</loop-state>` JSON block.
- The extension parses that block and either starts the next autonomous iteration or stops with a terminal status.
- Scheduled loop tasks are session-scoped and are cleared on shutdown or reload.
- Scheduled slash commands run through the same slash-command dispatcher as interactive input.
