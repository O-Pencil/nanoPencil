# Dev Loop Protocol

## Goal

Drive repository repair from concrete verification failures to green or an explicit blocked state. The protocol is agent-agnostic: the executing agent may be Claude Code, Codex/Cursor, CATUI, or another coding agent.

## Loop

1. Read `verification-plan.json` or run `npm run dev-loop:plan`.
2. Run the smallest relevant command first:

```bash
npm run dev-loop:verify -- --only <command-id>
```

3. Read `.catui/dev-loop/<run-id>/state.json` and `issues.json`.
4. Pick the current issue by `currentIssueSignature`.
5. Repair the repository.
6. Re-run the focused command.
7. Escalate to broader gates from the verification plan.
8. For PR checks, run:

```bash
npm run dev-loop:pr -- <number>
```

9. Stop only when the decision is `complete` or `blocked`.

## Decisions

- `continue`: at least one required local command or PR check is failing; repair should continue.
- `complete`: required local verification is green and, when provided, remote checks are green.
- `blocked`: the same issue exhausted its attempt budget, permissions are missing, requirements are unclear, or a flaky/external failure needs human judgment.

## Safety

The dev loop never commits, pushes, force-pushes, or changes PR state. It only reads local command output and GitHub check state through `gh`.
