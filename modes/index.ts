/**
 * [WHO]: Barrel exports for all run modes
 * [FROM]: Depends on interactive/, print/, rpc/, acp/ modes
 * [TO]: Consumed by main.ts
 * [HERE]: Mode selection entry point; consumed by main.ts
 */

export { InteractiveMode, type InteractiveModeOptions } from "./interactive/interactive-mode.js";
export { type PrintModeOptions, runPrintMode } from "./print-mode.js";
export { type ModelInfo, RpcClient, type RpcClientOptions, type RpcEventListener } from "./rpc/rpc-client.js";
export { runRpcMode } from "./rpc/rpc-mode.js";
export { runAcpMode } from "./acp/acp-mode.js";
export type { RpcCommand, RpcResponse, RpcSessionState } from "./rpc/rpc-types.js";
