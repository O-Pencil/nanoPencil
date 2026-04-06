/**
 * [WHO]: ApiKeyInputOptions
 * [FROM]: Depends on readline
 * [TO]: Consumed by modes/interactive/components/index.ts
 * [HERE]: modes/interactive/components/apikey-input.ts -
 */

import { createInterface } from "readline";

export interface ApiKeyInputOptions {
	prompt?: string;
}

export async function promptForApiKey(
	options: ApiKeyInputOptions = {},
): Promise<string | null> {
	const { prompt = "Enter API key" } = options;

	return new Promise((resolve) => {
		const rl = createInterface({
			input: process.stdin,
			output: process.stdout,
		});

		process.stdout.write("\n");

		rl.question(`${prompt}: `, (answer) => {
			rl.close();
			process.stdout.write("\n");

			const trimmed = answer.trim();
			resolve(trimmed ? trimmed : null);
		});
	});
}
