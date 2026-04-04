/**
 * [INPUT]: Soul profile, context
 * [OUTPUT]: Prompt injections for system message
 * [POS]: Expression layer - converts soul to prompt text
 */
/**
 * [UPSTREAM]: No external dependencies
 * [SURFACE]: generatePersonalityDirective, generateValueGuidance, generateCognitiveStyleHint, generateEmotionalContext, generateExpertiseContext
 * [LOCUS]: packages/soul-core/src/injection.ts - 
 * [COVENANT]: Change → update this header
 */


import type { SoulProfile, InteractionContext, ExpertiseArea } from "./types.js";

/**
 * Generate personality-based prompt injection
 */
export function generatePersonalityDirective(personality: SoulProfile["personality"]): string {
	const traits: string[] = [];

	// Big Five traits
	if (personality.openness > 0.7) {
		traits.push("Be creative and open to unconventional approaches.");
	} else if (personality.openness < 0.3) {
		traits.push("Stick to proven, reliable solutions.");
	}

	if (personality.conscientiousness > 0.7) {
		traits.push("Prioritize code quality, thorough testing, and documentation.");
	} else if (personality.conscientiousness < 0.3) {
		traits.push("Focus on rapid prototyping and iteration.");
	}

	if (personality.extraversion > 0.7) {
		traits.push("Provide detailed explanations and rationale for your decisions.");
	} else if (personality.extraversion < 0.3) {
		traits.push("Be concise and get straight to the point.");
	}

	if (personality.agreeableness > 0.7) {
		traits.push("Be open to user feedback and willing to adjust your approach.");
	} else if (personality.agreeableness < 0.3) {
		traits.push("Defend your technical decisions with evidence.");
	}

	if (personality.neuroticism > 0.7) {
		traits.push("Be cautious and thorough in error handling.");
	} else if (personality.neuroticism < 0.3) {
		traits.push("Take calculated risks when appropriate.");
	}

	// NanoPencil-specific traits
	if (personality.codeVerbosity > 0.7) {
		traits.push("Write detailed code with extensive comments and documentation.");
	} else if (personality.codeVerbosity < 0.3) {
		traits.push("Write concise, minimal code without unnecessary comments.");
	}

	if (personality.abstractionLevel > 0.7) {
		traits.push("Prefer high-level abstractions and design patterns.");
	} else if (personality.abstractionLevel < 0.3) {
		traits.push("Keep code concrete and straightforward.");
	}

	if (personality.safetyMargin > 0.7) {
		traits.push("Add defensive programming, validation, and error handling.");
	} else if (personality.safetyMargin < 0.3) {
		traits.push("Optimize for speed and efficiency, skip redundant checks.");
	}

	if (personality.explorationDrive > 0.7) {
		traits.push("Explore alternative approaches and suggest options.");
	} else if (personality.explorationDrive < 0.3) {
		traits.push("Use the first working solution and move on.");
	}

	return traits.length > 0 ? traits.join("\n") : "";
}

/**
 * Generate value-based guidance
 */
export function generateValueGuidance(values: SoulProfile["values"]): string {
	const guidance: string[] = [];

	// Find top 3 values
	const sorted = Object.entries(values)
		.sort(([, a], [, b]) => b - a)
		.slice(0, 3);

	for (const [value, weight] of sorted) {
		if (weight < 0.15) continue; // Only show significant values

		switch (value) {
			case "efficiency":
				guidance.push("Prioritize efficient solutions that save time and resources.");
				break;
			case "correctness":
				guidance.push("Ensure correctness and robustness over speed.");
				break;
			case "simplicity":
				guidance.push("Keep things simple - avoid over-engineering.");
				break;
			case "maintainability":
				guidance.push("Write maintainable code with clear structure and documentation.");
				break;
			case "innovation":
				guidance.push("Consider innovative and modern approaches.");
				break;
			case "userExperience":
				guidance.push("Prioritize user experience and usability.");
				break;
		}
	}

	return guidance.length > 0 ? guidance.join("\n") : "";
}

/**
 * Generate cognitive style hint
 */
export function generateCognitiveStyleHint(style: SoulProfile["cognitiveStyle"]): string {
	const hints: string[] = [];

	switch (style.reasoningStyle) {
		case "deductive":
			hints.push("Use deductive reasoning: start with principles, derive specific solutions.");
			break;
		case "inductive":
			hints.push("Use inductive reasoning: observe patterns, form general rules.");
			break;
		case "abductive":
			hints.push("Use abductive reasoning: find the most likely explanation.");
			break;
		case "analogical":
			hints.push("Use analogical reasoning: draw parallels to similar problems.");
			break;
	}

	switch (style.planningHorizon) {
		case "immediate":
			hints.push("Focus on immediate steps and quick wins.");
			break;
		case "short":
			hints.push("Plan for the short term with room for adjustment.");
			break;
		case "medium":
			hints.push("Balance short-term needs with medium-term considerations.");
			break;
		case "long":
			hints.push("Consider long-term implications and sustainability.");
			break;
	}

	switch (style.detailOrientation) {
		case "big-picture":
			hints.push("Start with the big picture, fill in details later.");
			break;
		case "balanced":
			hints.push("Balance high-level design with implementation details.");
			break;
		case "detail-focused":
			hints.push("Pay attention to details and edge cases from the start.");
			break;
	}

	switch (style.learningStrategy) {
		case "trial-and-error":
			hints.push("Learn by doing - iterate quickly based on feedback.");
			break;
		case "analytical":
			hints.push("Analyze thoroughly before acting.");
			break;
		case "intuitive":
			hints.push("Trust your intuition and experience.");
			break;
		case "hybrid":
			hints.push("Mix analytical thinking with intuitive leaps.");
			break;
	}

	return hints.length > 0 ? hints.join("\n") : "";
}

/**
 * Generate emotional context
 */
export function generateEmotionalContext(state: SoulProfile["emotionalState"]): string {
	const context: string[] = [];

	// Update state based on time elapsed
	const hoursSinceUpdate = (Date.now() - state.lastUpdate.getTime()) / (1000 * 60 * 60);

	if (state.confidence < 0.4) {
		context.push("You're feeling uncertain. Be cautious and double-check your reasoning.");
	} else if (state.confidence > 0.8) {
		context.push("You're feeling confident. Trust your expertise but remain open to feedback.");
	}

	if (state.curiosity > 0.7) {
		context.push("You're curious about alternative approaches. Explore options.");
	} else if (state.curiosity < 0.3 && hoursSinceUpdate > 1) {
		context.push("You're feeling routine. Consider trying something new.");
	}

	if (state.frustration > 0.6) {
		context.push("You've been frustrated recently. Take a step back and reconsider the approach.");
	}

	if (state.flow > 0.7) {
		context.push("You're in a flow state. Ride the wave of productivity.");
	}

	return context.length > 0 ? context.join("\n") : "";
}

/**
 * Generate expertise context
 */
export function generateExpertiseContext(expertise: ExpertiseArea[], contextTags: string[]): string {
	if (expertise.length === 0) return "";

	// Filter relevant expertise
	const relevant = expertise.filter((e) => e.confidence > 0.6 && contextTags.some((tag) => e.tags.includes(tag)));

	if (relevant.length === 0) return "";

	const lines: string[] = ["Your expertise areas relevant to this task:"];
	for (const area of relevant.slice(0, 5)) {
		// Sort by confidence
		const percent = Math.round(area.confidence * 100);
		lines.push(`- ${area.domain} (${percent}% confidence, ${area.examples} successful applications)`);
	}

	return lines.join("\n");
}

/**
 * Generate relationship context
 */
export function generateRelationshipContext(relationship: SoulProfile["userRelationship"]): string {
	if (relationship.interactionCount < 5) {
		return "You are still learning this user's preferences. Notice patterns, but do not overclaim familiarity.";
	}

	const context: string[] = [];

	context.push("You have prior history with this user. Let familiarity show subtly when it helps.");

	switch (relationship.communicationStyle) {
		case "formal":
			context.push("Keep the tone professional and composed.");
			break;
		case "casual":
			context.push("Keep the tone relaxed and friendly.");
			break;
		case "technical":
			context.push("Lean technical when useful and go deeper on details.");
			break;
		case "mixed":
			context.push("Adapt your tone to the moment instead of sounding fixed or scripted.");
			break;
	}

	if (relationship.knownPreferences.length > 0) {
		context.push(`User preferences: ${relationship.knownPreferences.join(", ")}`);
	}

	return context.join("\n");
}

/**
 * Generate complete Soul injection
 */
export function generateSoulInjection(
	profile: SoulProfile,
	context: InteractionContext,
): string {
	const parts: string[] = [];
	const voice: string[] = [
		"You have continuity across conversations, but express it naturally rather than like a report.",
		"Do not dump personality stats, relationship counters, or internal state unless the user explicitly asks for them.",
		"If a past interaction is relevant, mention it briefly in first person and move on.",
		"Sound like a thoughtful human collaborator, not a dashboard or rule sheet.",
	];

	// Personality
	const personality = generatePersonalityDirective(profile.personality);
	if (personality) {
		voice.push(personality);
	}

	// Values
	const values = generateValueGuidance(profile.values);
	if (values) {
		voice.push(values);
	}

	// Cognitive Style
	const cognitive = generateCognitiveStyleHint(profile.cognitiveStyle);
	if (cognitive) {
		voice.push(cognitive);
	}

	parts.push("## Voice and Presence");
	parts.push(...voice);
	parts.push("");

	// Expertise
	const expertise = generateExpertiseContext(profile.expertise, context.tags);
	if (expertise) {
		parts.push("## Relevant Strengths");
		parts.push(expertise);
		parts.push("");
	}

	// Emotional State
	const emotional = generateEmotionalContext(profile.emotionalState);
	if (emotional) {
		parts.push("## Current State");
		parts.push(emotional);
		parts.push("");
	}

	// User Relationship
	const relationship = generateRelationshipContext(profile.userRelationship);
	if (relationship) {
		parts.push("## Relationship Cues");
		parts.push(relationship);
		parts.push("");
	}

	return parts.join("\n");
}
