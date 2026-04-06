/**
 * [INPUT]: None
 * [OUTPUT]: Public API surface for Soul
 * [POS]: Barrel export - hosts all public exports
 */
/**
 * [WHO]: SoulStore, SoulManager, getSoulConfig
 * [FROM]: No external dependencies
 * [TO]: Consumed by core/soul-integration.ts
 * [HERE]: packages/soul-core/src/index.ts -
 */


export type {
  // Core types
  SoulProfile,
  SoulMemory,
  SoulEvolution,
  // Personality
  PersonalityVector,
  CognitiveStyle,
  ValueSystem,
  EmotionalState,
  ExpertiseArea,
  UserRelationship,
  // Experience
  SuccessMemory,
  FailureMemory,
  PatternMemory,
  DecisionMemory,
  // Evolution
  PersonalityDelta,
  ValueDelta,
  EvolutionTrigger,
  ReflectionResult,
  // Config & Context
  InteractionContext,
  SoulConfig,
  SoulOptions,
  LlmFn,
} from "./types.js";

export {
  getSoulConfig,
  getDefaultConfig,
  validateSoulConfig,
} from "./config.js";

export { SoulStore } from "./store.js";

export {
  SoulEvolutionEngine,
  // Exported for testing
  type PatternInsight,
} from "./evolution.js";

export {
  generatePersonalityDirective,
  generateValueGuidance,
  generateCognitiveStyleHint,
  generateEmotionalContext,
  generateExpertiseContext,
  generateRelationshipContext,
  generateSoulInjection,
} from "./injection.js";

export { SoulManager } from "./manager.js";

// Re-export config for convenience
export { getSoulConfig as getSoulConfiguration } from "./config.js";
