/**
 * Get the path to the debug log file.
 * This is a simplified version for use within the ai package.
 */
import { homedir } from "os";
import { join } from "path";

export function getDebugLogPath(): string {
	// Check for environment variable override
	const envDir = process.env.NANOPENCIL_CODING_AGENT_DIR || process.env.PI_CODING_AGENT_DIR;
	if (envDir) {
		const dir = envDir === "~" ? homedir() : envDir.startsWith("~/") ? homedir() + envDir.slice(1) : envDir;
		return join(dir, "nanopencil-debug.log");
	}
	return join(homedir(), ".nanopencil", "agent", "nanopencil-debug.log");
}
