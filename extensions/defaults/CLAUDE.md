# extensions/defaults/

> P2 | Parent: ../CLAUDE.md

Member List
link-world/index.ts: Internet access extension, provides internet-search Skill after setup
mcp/index.ts: MCP protocol integration extension, MCP guidance resources
presence/index.ts: AI-driven opening + idle presence lines, uses NanoMemEngine episodes/preferences/lessons + git/cwd snapshot, injects latest line into agent systemPrompt every turn for main-conversation perception, 30s debounce + idle in-flight lock, configurable via settings.presence.enabled, PRESENCE_MESSAGE_TYPE renderer
subagent/index.ts: SubAgent extension entry, /subagent:/subagent:run/:stop/:status/:report/:apply commands, SUBAGENT_MESSAGE_TYPE renderer
subagent/subagent-parser.ts: SubAgent command parsing, parseSubAgentCommand/buildSubAgentHelp
subagent/subagent-runner.ts: SubAgent orchestration — research (read-only) and implement (isolated worktree) roles, diff preview and apply flow
subagent/subagent-types.ts: SubAgent extension types — SubAgentPhase, SubAgentWorkerInfo, SubAgentRunState, SubAgentRunReport
interview/index.ts: Requirement clarification extension, /interview command, lightweight before_agent_start hook
security-audit/interface.ts: Security audit interface, SecurityCheckResult/AuditEvent/SecurityEngine
security-audit/index.ts: Security extension entry, audit logging and dangerous pattern detection
security-audit/engine/interceptor.ts: Request/response interception, InterceptorResult confirmation flow
security-audit/engine/logger.ts: Security event logging, JSON file audit trail
security-audit/engine/detector.ts: Vulnerability detection, pattern matching for dangerous commands
soul/index.ts: AI personality evolution extension, persistent personality across sessions
grub/index.ts: Grub extension entry - autonomous iterative task runner extracted from legacy loop, /grub command + GRUB_MESSAGE_TYPE renderer
grub/grub-controller.ts: GrubController - drives autonomous grub iterations, state machine for LoopTaskState
grub/grub-parser.ts: Grub command parsing, parseGrubCommand/buildGrubHelp
grub/grub-types.ts: Grub types, GrubStatus/GrubDecisionStatus/GrubDecision/GrubTaskState/GrubTaskSnapshot
grub/README.md: Grub extension documentation - autonomous "keep digging until done" runner
loop/index.ts: Loop extension entry - session-scoped recurring prompt/command scheduler with pause/resume/run-now/max-runs/quiet, /loop command + LOOP_MESSAGE_TYPE renderer
loop/scheduler-controller.ts: SchedulerController - in-memory recurring task store with pause/resume/run-now/max-runs, MAX_SCHEDULED_TASKS=50
loop/scheduler-parser.ts: Loop command parsing with flags/subcommands, parseSchedulerCommand/parseDurationSpec/buildSchedulerHelp, --name/--max/--quiet
loop/scheduler-types.ts: Scheduled loop types, LoopPayloadKind/ScheduledLoopTask/LoopStartSpec/ParsedSchedulerCommand
loop/README.md: Loop extension documentation - recurring scheduler usage and flags
team/index.ts: AgentTeam extension entry, /team:/team:spawn/:send/:status/:stop/:terminate/:approve/:mode commands, TEAM_MESSAGE_TYPE renderer
team/team-types.ts: TeammateRole/TeammateMode/TeammateStatus/TeammateIdentity/TeammateMessage/PersistedTeammate/TeamSpawnSpec/TeamSendResult types
team/team-state-store.ts: TeamStateStore class - durable teammate persistence via JSON files in <agentDir>/teams/
team/team-parser.ts: Team command parser - parseTeamCommand/buildTeamHelp for /team:* subcommands
team/team-runtime.ts: TeamRuntime class - teammate registry, lifecycle, mailbox + permission + transcript wiring
team/team-permissions.ts: PermissionStore - pending permission request queue, approve/deny, path allowlists
team/team-mailbox.ts: TeamMailbox - typed append-only message log for leader↔teammate
team/team-transcript.ts: TeamTranscriptWriter - per-teammate JSONL transcripts
team/TESTING.md: Manual & smoke-test guide for Phase B AgentTeam

Rule: Members complete, one item per line, parent links valid, precise terms first

[COVENANT]: Update this file header on changes and verify against parent CLAUDE.md