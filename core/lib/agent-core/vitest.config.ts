/**
 * [WHO]: Provides Vitest defaults and workspace aliases for agent-core tests
 * [FROM]: Depends on node:url and vitest/config for package-local test resolution
 * [TO]: Not imported - vitest configuration file, consumed by vitest CLI 
 * [HERE]: ./core/lib/agent-core/vitest.config.ts - keeps private workspace imports source-resolved in tests
 */

import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: [
			{ find: /^@catui\/ai\/(.+)$/, replacement: fileURLToPath(new URL("../ai/src/$1.ts", import.meta.url)) },
			{ find: "@catui/ai", replacement: fileURLToPath(new URL("../ai/src/index.ts", import.meta.url)) },
		],
	},
	test: {
		globals: true,
		environment: "node",
		testTimeout: 30000, // 30 seconds for API calls
	},
});
