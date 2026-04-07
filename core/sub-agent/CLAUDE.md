# core/sub-agent/

> P2 | Parent: ../CLAUDE.md

Member List
index.ts: Barrel exports for SubAgent runtime — SubAgentRuntime, subAgentRuntime, InProcessSubAgentBackend, SubAgentSpec/Result/Handle/Backend types
sub-agent-types.ts: Core SubAgent interfaces — SubAgentSpec (prompt/tools/cwd/signal/timeoutMs/model), SubAgentHandle (id/status/result/abort/terminate), SubAgentResult, SubAgentBackend; consumed by backend and runtime
sub-agent-backend.ts: InProcessSubAgentBackend — wraps createAgentSession() with AbortSignal forwarding and timeout; spawn returns SubAgentHandle; single backend for Phase A
sub-agent-runtime.ts: SubAgentRuntime class — active agent registry, spawn/abortAll/terminateAll; default global instance subAgentRuntime; consumed by extension orchestrators

Rule: Members complete, one item per line, parent links valid, precise terms first

[COVENANT]: Update this file on changes and verify against parent core/CLAUDE.md
