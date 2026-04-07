# extensions/defaults/

> P2 | Parent: ../CLAUDE.md

Member List
link-world/index.ts: Internet access extension, provides internet-search Skill after setup
mcp/index.ts: MCP protocol integration extension, MCP guidance resources
presence/index.ts: AI-driven opening greetings and idle cues, uses NanoMemEngine for memory context, generates personalized greetings via completeSimple, configurable via settings.presence.enabled, PRESENCE_MESSAGE_TYPE renderer
team/team-parser.ts: Team command parsing, parseTeamCommand/buildTeamHelp
team/team-controller.ts: Multi-agent coordination, TeamRunState management
team/team-types.ts: Team types, TeamCommandMode/TeamRunStatus/TeamWorkerMode
team/index.ts: Team extension entry, multi-agent orchestration with plan/research/execute
interview/index.ts: Requirement clarification extension, /interview command, lightweight before_agent_start hook
security-audit/interface.ts: Security audit interface, SecurityCheckResult/AuditEvent/SecurityEngine
security-audit/index.ts: Security extension entry, audit logging and dangerous pattern detection
security-audit/engine/interceptor.ts: Request/response interception, InterceptorResult confirmation flow
security-audit/engine/logger.ts: Security event logging, JSON file audit trail
security-audit/engine/detector.ts: Vulnerability detection, pattern matching for dangerous commands
soul/index.ts: AI personality evolution extension, persistent personality across sessions
loop/scheduler-controller.ts: Scheduled loop controller, MAX_SCHEDULED_TASKS=50 limit
loop/loop-types.ts: Loop types, LoopStatus/LoopDecisionStatus/LoopDecision
loop/loop-controller.ts: Loop controller, LoopTaskState management
loop/scheduler-types.ts: Scheduled loop types, ScheduledLoopTask/ParsedSchedulerCommand
loop/scheduler-parser.ts: Scheduled loop parser, DURATION_TOKEN regex parsing
loop/index.ts: Loop extension entry, timed prompt scheduler
loop/loop-parser.ts: Loop command parsing, parseLoopCommand/buildHelp

Rule: Members complete, one item per line, parent links valid, precise terms first

[COVENANT]: Update this file header on changes and verify against parent CLAUDE.md