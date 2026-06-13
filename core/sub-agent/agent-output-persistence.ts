/**
 * [WHO]: getOutputFilePath, writeAgentOutputFile, getTasksDir — file-based output persistence per CC §XI.3
 * [FROM]: Depends on node:fs/promises, node:path for file I/O
 * [TO]: Consumed by ./agent-tool (async execution path)
 * [HERE]: core/sub-agent/agent-output-persistence.ts - Output file persistence per CC §XI.3 (lY/qR6)
 * [COVENANT]: Change output path → update agent-input-output.ts outputFile field
 */

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Get the tasks directory path.
 * Matches CC's qR6() function: <project>/.claude/tasks/ → <project>/.catui/tasks/
 *
 * Per CC §19: Catui uses .catui/ instead of .claude/
 */
export function getTasksDir(cwd: string): string {
  return join(cwd, ".catui", "tasks");
}

/**
 * Get the output file path for an agent.
 * Matches CC's lY() function: qR6() + `<agentId>.output`
 *
 * Per CC §6.2 step 16: outputFile = lY(agentId)
 */
export function getOutputFilePath(agentId: string, cwd: string): string {
  return join(getTasksDir(cwd), `${agentId}.output`);
}

/**
 * Write the agent's output to a file.
 * Per CC §11.3: async agent results are passed via filesystem.
 * The output file contains the last assistant message's text.
 *
 * Matches CC's async output writing in LS8.
 */
export async function writeAgentOutputFile(
  agentId: string,
  cwd: string,
  output: string,
): Promise<string> {
  const filePath = getOutputFilePath(agentId, cwd);
  const dirPath = getTasksDir(cwd);

  // Ensure directory exists
  await mkdir(dirPath, { recursive: true });

  // Write the output file
  await writeFile(filePath, output, "utf-8");

  return filePath;
}

/**
 * Write a structured AgentOutputCompleted to the output file.
 * Used when an async agent completes and writes its final result.
 */
export async function writeAgentOutputCompleted(
  agentId: string,
  cwd: string,
  output: import("./agent-input-output.js").AgentOutputCompleted,
): Promise<string> {
  // Format as readable text (last assistant message's text content)
  const textContent = output.content
    .map((c) => c.text)
    .join("\n\n");

  return writeAgentOutputFile(agentId, cwd, textContent);
}

/**
 * Read an agent's output file (for checking progress of background agents).
 * Per CC §11.3: parent agent can use Read tool to check the outputFile.
 */
export async function readAgentOutputFile(
  agentId: string,
  cwd: string,
): Promise<string | undefined> {
  const filePath = getOutputFilePath(agentId, cwd);
  try {
    return await readFile(filePath, "utf-8");
  } catch {
    return undefined;
  }
}

/**
 * Check if an agent's output file exists.
 */
export async function agentOutputFileExists(
  agentId: string,
  cwd: string,
): Promise<boolean> {
  const filePath = getOutputFilePath(agentId, cwd);
  try {
    const { access } = await import("node:fs/promises");
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
