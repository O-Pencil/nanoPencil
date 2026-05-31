/**
 * [WHO]: Barrel for @pencil-agent/extension-sdk — the stable protocol surface for extensions
 * [FROM]: Re-exports the per-protocol modules (tools today; themes/hooks/commands/permissions/lifecycle land in P3 checkpoints)
 * [TO]: Consumed by third-party extensions, packages/mem-core, packages/soul-core, and the host (adopting these contracts)
 * [HERE]: packages/extension-sdk/src/index.ts - extension-sdk public entry
 *
 * Scope (this round / P3): tools (S1), themes, hooks, commands, permissions, lifecycle.
 * Explicitly NOT here (EVOLUTION-RESERVED): agent-profile, host-adapter, tool-runtime,
 * a2a-bridge, memory/soul providers — see ../../../.dev-docs/architecture-review/evolution/PARP.md.
 */

export * from "./tools.js";
