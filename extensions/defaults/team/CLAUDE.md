# extensions/defaults/team/

> P2 | Parent: ../CLAUDE.md

Member List
- index.ts: AgentTeam extension entry, /team:/team:spawn/:send/:status/:stop/:terminate/:approve/:mode commands, TEAM_MESSAGE_TYPE renderer
- team-types.ts: TeammateRole/TeammateMode/TeammateStatus/TeammateIdentity/TeammateMessage/PersistedTeammate/TeamSpawnSpec/TeamSendResult types
- team-state-store.ts: TeamStateStore class - durable teammate persistence via JSON files in <agentDir>/teams/
- team-parser.ts: Team command parser - parseTeamCommand/buildTeamHelp for /team:* subcommands
- team-runtime.ts: TeamRuntime class - teammate registry, lifecycle, mailbox + permission + transcript wiring; uses SubAgentRuntime for agent spawning
- team-permissions.ts: PermissionStore - pending permission request queue, approve/deny, path allowlists (B.4)
- team-mailbox.ts: TeamMailbox - typed in-memory append-only message log for leader↔teammate (B.3)
- team-transcript.ts: TeamTranscriptWriter - per-teammate JSONL transcripts under <storageDir>/transcripts/ (B.7)
- TESTING.md: Manual & smoke-test guide for the Phase B AgentTeam extension

Rule: Members complete, one item per line, parent links valid, precise terms first

[COVENANT]: Update this file header on changes and verify against parent CLAUDE.md

---

## Phase B: AgentTeam Architecture

This extension implements the Phase B "true AgentTeam" per the refactor plan:
- Persistent teammates with durable state (survive across main session restarts)
- Each teammate has identity, mode, status, worktree, and message history
- Teammates run in isolated worktrees (for implementers)
- Uses core/sub-agent/ infrastructure for actual agent spawning

## Commands

| Command | Description |
|---------|-------------|
| `/team` | List all teammates |
| `/team:spawn <role> [--name <id>]` | Create a persistent teammate |
| `/team:send <name> <message>` | Send message to a teammate |
| `/team:status [<name>]` | Show team or teammate status |
| `/team:stop <name>` | Stop teammate's current turn |
| `/team:terminate <name>` | Destroy a teammate |
| `/team:approve <request-id>` | Approve a permission request (TODO) |
| `/team:mode <name> <plan\|execute\|review>` | Switch teammate mode |

## Roles

- `researcher`: Read-only exploration
- `reviewer`: Read-only review/audit
- `implementer`: Sandboxed write in isolated worktree
- `planner`: Read-only plan production
- `generic`: Read-only by default

## Modes

- `research`: Read-only exploration
- `plan`: Read-only plan production; execute requires leader approval
- `execute`: Sandboxed write in worktree
- `review`: Read-only review

## State Persistence

Teammate state is stored in `~/.nanopencil/agent/teams/<uuid>.json`:
- Identity (id, name, role, createdAt)
- Mode and status
- Working directory and worktree info
- Message history
- Last activity timestamp

TeamStateStore is deliberately independent of core SessionManager per the refactor plan:
> "team-state-store 自己负责 teammate 历史 ... SessionManager 只负责主会话"

## Core Dependencies

- `core/sub-agent/`: SubAgentRuntime for spawning agents
- `core/workspace/`: WorktreeManager for isolated worktrees
- `core/tools/`: Tool creation with sandboxed bash

## Phase B status

Shipped in this iteration:
- Permission request/response (`team-permissions.ts`, wired into `/team:mode` execute escalation and `/team:approve`)
- Mailbox protocol (`team-mailbox.ts`, posts on send/result/mode_change/permission_request/permission_response)
- Per-teammate JSONL transcripts (`team-transcript.ts`)
- Subprocess SubAgent backend harness (`core/sub-agent/subprocess-backend.ts` + `subprocess-worker.ts`) — interface complete, worker LLM loop deferred (see backend doc).

Future work:
- Worker-side full LLM agent loop for the subprocess backend
- Path-scoped write permission requests (`PermissionStore.allowPath` is implemented but not yet consulted by the bash sandbox)
- Cross-restart mailbox replay
