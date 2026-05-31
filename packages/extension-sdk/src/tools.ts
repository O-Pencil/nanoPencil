/**
 * [WHO]: Provides ToolRuntime, ToolPermissions, ToolRuntimeDescriptor (S1 seam vocabulary)
 * [FROM]: No dependencies — pure protocol vocabulary, source of truth for the tool runtime seam
 * [TO]: Consumed by the host ToolDefinition (adopts these optional fields) and third-party tools
 * [HERE]: packages/extension-sdk/src/tools.ts - S1 seam: declares where a tool runs + what it may access
 *
 * S1 seam (refactor-plan §接缝预留): a tool may optionally declare its execution runtime
 * and permission needs. Omitting both keeps today's behavior (local, host-policy). The host
 * ToolOrchestrator remains the single dispatch point; browser/remote/mcp runtimes are NOT
 * implemented this round — only the contract shape is reserved so adding them is additive.
 */

/** Where a tool's execute() runs. Omitted ⇒ "local" (in the host process). */
export type ToolRuntime = "local" | "mcp" | "remote" | "browser";

/** Declarative permission requirements a tool may request; the host decides enforcement. */
export interface ToolPermissions {
  /** Filesystem paths the tool intends to read / write, if constrained. */
  filesystem?: { read?: string[]; write?: string[] };
  /** Whether the tool may spawn shell/processes. */
  process?: boolean;
  /** Network hosts the tool may reach, if constrained. */
  network?: string[];
}

/** S1 seam: optional runtime/permission descriptors a tool definition may carry. */
export interface ToolRuntimeDescriptor {
  /** Execution runtime. Omitted ⇒ "local". */
  runtime?: ToolRuntime;
  /** Declared permissions. Omitted ⇒ unconstrained (host policy applies). */
  permissions?: ToolPermissions;
}
