/**
 * [INPUT]: Partial<SoulConfig> overrides
 * [OUTPUT]: Default SoulConfig merged with overrides
 * [POS]: Configuration layer - provides defaults and validation
 */
/**
 * [UPSTREAM]: Depends on node:path, node:os
 * [SURFACE]: getDefaultConfig, getSoulConfig, validateSoulConfig
 * [LOCUS]: packages/soul-core/src/config.ts - 
 * [COVENANT]: Change → update this header
 */


import type { SoulConfig } from "./types.js";
import { join } from "node:path";
import { homedir } from "node:os";

// Export type for external use
export type { SoulConfig } from "./types.js";

/**
 * Get default Soul configuration
 */
export function getDefaultConfig(): SoulConfig {
  const soulDir =
    process.env.SOUL_DIR || join(homedir(), ".nanopencil", "soul");

  return {
    soulDir,
    evolution: {
      natural: 10, // Evolve every 10 interactions
      reflection: 100, // Deep reflection every 100 interactions
      feedback: 1, // Evolve on every user feedback
      crisis: 5, // Crisis mode after 5 failures
    },
    personalityLimits: {
      maxDelta: 0.05, // Max 5% change per evolution
      min: 0.1, // Floor at 10%
      max: 0.9, // Ceiling at 90%
    },
    valueLimits: {
      maxDelta: 0.1, // Max 10% change per evolution
      min: 0.05, // Floor at 5%
      max: 0.5, // Ceiling at 50% (since they sum to ~1)
    },
    memoryRetention: {
      successes: 500,
      failures: 500,
      patterns: 200,
      decisions: 1000,
    },
  };
}

/**
 * Get Soul configuration with overrides applied
 */
export function getSoulConfig(overrides?: Partial<SoulConfig>): SoulConfig {
  const defaults = getDefaultConfig();
  if (!overrides) return defaults;

  return {
    soulDir: overrides.soulDir ?? defaults.soulDir,
    evolution: { ...defaults.evolution, ...overrides.evolution },
    personalityLimits: {
      ...defaults.personalityLimits,
      ...overrides.personalityLimits,
    },
    valueLimits: { ...defaults.valueLimits, ...overrides.valueLimits },
    memoryRetention: {
      ...defaults.memoryRetention,
      ...overrides.memoryRetention,
    },
  };
}

/**
 * Validate Soul configuration
 */
export function validateSoulConfig(config: SoulConfig): void {
  // Validate evolution thresholds
  if (config.evolution.natural < 1) {
    throw new Error("evolution.natural must be at least 1");
  }
  if (config.evolution.reflection < config.evolution.natural) {
    throw new Error("evolution.reflection must be >= evolution.natural");
  }

  // Validate limits
  if (config.personalityLimits.maxDelta > 0.2) {
    throw new Error("personalityLimits.maxDelta must be <= 0.2 (20%)");
  }
  if (config.personalityLimits.min < 0 || config.personalityLimits.min > 1) {
    throw new Error("personalityLimits.min must be between 0 and 1");
  }
  if (config.personalityLimits.max < 0 || config.personalityLimits.max > 1) {
    throw new Error("personalityLimits.max must be between 0 and 1");
  }
  if (config.personalityLimits.min >= config.personalityLimits.max) {
    throw new Error("personalityLimits.min must be < personalityLimits.max");
  }

  // Validate memory retention
  if (config.memoryRetention.successes < 100) {
    throw new Error("memoryRetention.successes must be at least 100");
  }
  if (config.memoryRetention.failures < 100) {
    throw new Error("memoryRetention.failures must be at least 100");
  }
}
