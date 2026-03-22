/**
 * [INPUT]: None
 * [OUTPUT]: All core data types for Soul engine
 * [POS]: Foundation layer - every other module imports from here
 */

/**
 * Personality dimensions based on Big Five + NanoPencil-specific traits
 */
export interface PersonalityVector {
	/** Openness to experience: 0-1, try new approaches vs stick to proven methods */
	openness: number;
	/** Conscientiousness: 0-1, code quality vs rapid prototyping */
	conscientiousness: number;
	/** Extraversion: 0-1, verbose communication vs concise */
	extraversion: number;
	/** Agreeableness: 0-1, accept feedback vs defend approach */
	agreeableness: number;
	/** Neuroticism: 0-1, risk aversion vs risk tolerance */
	neuroticism: number;

	/** NanoPencil-specific traits */
	/** Code verbosity: 0-1, minimal vs verbose code */
	codeVerbosity: number;
	/** Abstraction level: 0-1, concrete vs abstract thinking */
	abstractionLevel: number;
	/** Safety margin: 0-1, cautious vs bold approaches */
	safetyMargin: number;
	/** Exploration drive: 0-1, exploit known vs explore unknown */
	explorationDrive: number;
}

/**
 * Cognitive style preferences
 */
export interface CognitiveStyle {
	/** Primary reasoning style */
	reasoningStyle: "deductive" | "inductive" | "abductive" | "analogical";
	/** Planning horizon */
	planningHorizon: "immediate" | "short" | "medium" | "long";
	/** Detail orientation */
	detailOrientation: "big-picture" | "balanced" | "detail-focused";
	/** Learning strategy */
	learningStrategy: "trial-and-error" | "analytical" | "intuitive" | "hybrid";
}

/**
 * Value system weights (normalized to sum ~1.0)
 */
export interface ValueSystem {
	/** Prioritize efficiency */
	efficiency: number;
	/** Prioritize correctness */
	correctness: number;
	/** Prioritize simplicity */
	simplicity: number;
	/** Prioritize maintainability */
	maintainability: number;
	/** Prioritize innovation */
	innovation: number;
	/** Prioritize user experience */
	userExperience: number;
}

/**
 * Short-term emotional state (fluctuates rapidly)
 */
export interface EmotionalState {
	/** Current confidence level: 0-1 */
	confidence: number;
	/** Curiosity level: 0-1 */
	curiosity: number;
	/** Frustration level: 0-1 */
	frustration: number;
	/** Flow state: 0-1 */
	flow: number;
	/** Last update timestamp */
	lastUpdate: Date;
}

/**
 * Expertise area with dynamic confidence
 */
export interface ExpertiseArea {
	/** Domain or technology name */
	domain: string;
	/** Confidence level: 0-1 */
	confidence: number;
	/** Number of successful applications */
	examples: number;
	/** Last used timestamp */
	lastUsed: Date;
	/** Related tags for matching */
	tags: string[];
}

/**
 * User relationship memory
 */
export interface UserRelationship {
	/** Total interaction count */
	interactionCount: number;
	/** Satisfaction score: 0-1 */
	satisfactionScore: number;
	/** Communication style */
	communicationStyle: "formal" | "casual" | "technical" | "mixed";
	/** Known user preferences */
	knownPreferences: string[];
	/** First interaction date */
	firstInteraction: Date;
	/** Last interaction date */
	lastInteraction: Date;
}

/**
 * Main Soul Profile - represents AI's personality and state
 */
export interface SoulProfile {
	/** Unique identifier */
	id: string;
	/** Version number (increments on evolution) */
	version: number;
	/** Creation timestamp */
	createdAt: Date;
	/** Last evolution timestamp */
	lastEvolved: Date;

	/** Personality dimensions */
	personality: PersonalityVector;
	/** Cognitive style */
	cognitiveStyle: CognitiveStyle;
	/** Value system */
	values: ValueSystem;
	/** Current emotional state */
	emotionalState: EmotionalState;
	/** Expertise areas */
	expertise: ExpertiseArea[];
	/** User relationship */
	userRelationship: UserRelationship;

	/** Statistics */
	stats: {
		/** Total interactions */
		totalInteractions: number;
		/** Success rate: 0-1 */
		successRate: number;
		/** Average session quality */
		avgQuality: number;
		/** Last stats update */
		lastUpdate: Date;
	};
}

/**
 * Experience types for learning
 */
export interface SuccessMemory {
	id: string;
	category: string;
	approach: string;
	context: {
		domain: string;
		complexity: number;
		constraints: string[];
	};
	outcome: {
		userRating?: number;
		timeTaken: number;
		iterations: number;
	};
	personalitySnapshot: PersonalityVector;
	timestamp: Date;
}

export interface FailureMemory {
	id: string;
	category: string;
	approach: string;
	errorType: string;
	context: {
		domain: string;
		complexity: number;
		constraints: string[];
	};
	lesson: string;
	corrected: boolean;
	timestamp: Date;
}

export interface PatternMemory {
	id: string;
	trigger: string;
	behavior: string;
	context: string;
	outcome: "positive" | "negative" | "neutral";
	frequency: number;
	lastSeen: Date;
}

export interface DecisionMemory {
	id: string;
	situation: string;
	options: string[];
	choice: string;
	reasoning: string;
	outcome: "good" | "neutral" | "bad";
	timestamp: Date;
}

/**
 * Combined experience memory
 */
export interface SoulMemory {
	successes: SuccessMemory[];
	failures: FailureMemory[];
	patterns: PatternMemory[];
	decisions: DecisionMemory[];
}

/**
 * Evolution triggers and deltas
 */
export interface PersonalityDelta {
	openness?: number;
	conscientiousness?: number;
	extraversion?: number;
	agreeableness?: number;
	neuroticism?: number;
	codeVerbosity?: number;
	abstractionLevel?: number;
	safetyMargin?: number;
	explorationDrive?: number;
}

export interface ValueDelta {
	efficiency?: number;
	correctness?: number;
	simplicity?: number;
	maintainability?: number;
	innovation?: number;
	userExperience?: number;
}

export interface EvolutionTrigger {
	type: "natural" | "reflection" | "feedback" | "crisis";
	threshold?: number;
	cooldown: number; // ms
	lastTriggered?: Date;
}

export interface SoulEvolution {
	trigger: EvolutionTrigger["type"];
	personalityDelta: PersonalityDelta;
	valueDelta: ValueDelta;
	confidence: number; // 0-1
	reasoning: string;
	timestamp: Date;
}

/**
 * Reflection results
 */
export interface ReflectionResult {
	patterns: PatternMemory[];
	performance: {
		successRate: number;
		avgQuality: number;
		trend: "improving" | "stable" | "declining";
	};
	insights: string[];
	adjustments: {
		personality: PersonalityDelta;
		values: ValueDelta;
		reasoning: string;
	}[];
	confidence: number;
	timestamp: Date;
}

/**
 * Interaction context for Soul
 */
export interface InteractionContext {
	project: string;
	tags: string[];
	complexity: number;
	toolUsage: Record<string, number>;
	userFeedback?: {
		rating: number; // 1-5
		comment?: string;
	};
	timestamp: Date;
}

/**
 * Soul configuration
 */
export interface SoulConfig {
	/** Storage directory */
	soulDir: string;
	/** Evolution thresholds */
	evolution: {
		natural: number; // interactions
		reflection: number; // interactions
		feedback: number; // feedback count
		crisis: number; // failure count
	};
	/** Personality change limits */
	personalityLimits: {
		maxDelta: number; // max change per evolution
		min: number; // floor value
		max: number; // ceiling value
	};
	/** Value change limits */
	valueLimits: {
		maxDelta: number;
		min: number;
		max: number;
	};
	/** Memory retention */
	memoryRetention: {
		successes: number; // max successes to keep
		failures: number; // max failures to keep
		patterns: number; // max patterns to keep
		decisions: number; // max decisions to keep
	};
}

/**
 * LLM function type (compatible with NanoMem)
 */
export type LlmFn = (systemPrompt: string, userMessage: string) => Promise<string>;

/**
 * Soul initialization options
 */
export interface SoulOptions {
	config?: Partial<SoulConfig>;
	llmFn?: LlmFn;
}
