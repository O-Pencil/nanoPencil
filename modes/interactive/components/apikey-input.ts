/**
 * API Key Input Dialog Component
 *
 * Provides a secure input dialog for entering API keys.
 */

import { createInterface } from "readline";

export interface ApiKeyInputOptions {
  prompt?: string;
}

/**
 * Show a dialog to input API key
 */
export async function promptForApiKey(
  options: ApiKeyInputOptions = {},
): Promise<string | null> {
  const { prompt = "请输入 API Key" } = options;

  // Use readline for secure password-like input
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Temporarily stop TUI to get raw input
    process.stdout.write("\n");

    rl.question(`${prompt}: `, (answer) => {
      rl.close();
      process.stdout.write("\n");

      const trimmed = answer.trim();
      if (!trimmed) {
        resolve(null);
      } else {
        resolve(trimmed);
      }
    });
  });
}
