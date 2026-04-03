/**
 * [UPSTREAM]: Depends on interactive/, print/, rpc/, acp/ modes
 * [SURFACE]: Barrel exports for all run modes
 * [LOCUS]: Mode selection entry point; consumed by main.ts
 * [COVENANT]: Add new mode → update P2 modes/CLAUDE.md
 */

export { InteractiveMode, type InteractiveModeOptions } from "./interactive/interactive-mode.js";
export { type PrintModeOptions, runPrintMode } from "./print-mode.js";
export { type ModelInfo, RpcClient, type RpcClientOptions, type RpcEventListener } from "./rpc/rpc-client.js";
export { runRpcMode } from "./rpc/rpc-mode.js";
export { runAcpMode } from "./acp/acp-mode.js";
export type { RpcCommand, RpcResponse, RpcSessionState } from "./rpc/rpc-types.js";
