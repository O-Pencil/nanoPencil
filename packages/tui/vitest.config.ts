/**
 * [UPSTREAM]: 
 * [SURFACE]: 
 * [LOCUS]: ./packages/tui/vitest.config.ts - 
 * [COVENANT]: Change → update this header
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["test/wrap-ansi.test.ts"],
	},
});
