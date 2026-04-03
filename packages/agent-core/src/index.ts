/**
 * [UPSTREAM]: Depends on agent.js, agent-loop.js, proxy.js, types.js
 * [SURFACE]: agent-core barrel exports
 * [LOCUS]: packages/agent-core/src/index.ts - agent-core entry point
 * [COVENANT]: Change exports → update package.json exports
 */
// Core Agent
export * from "./agent.js";
// Loop functions
export * from "./agent-loop.js";
// Proxy utilities
export * from "./proxy.js";
// Types
export * from "./types.js";
