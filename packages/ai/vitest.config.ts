/**
 * [UPSTREAM]: 
 * [SURFACE]: 
 * [LOCUS]: ./packages/ai/vitest.config.ts - 
 * [COVENANT]: Change → update this header
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000, // 30 seconds for API calls
  }
});