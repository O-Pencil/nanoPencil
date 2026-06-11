/**
 * Prompt templates for the /insights command.
 *
 * 1:1 port of Claude Code src/commands/insights.ts prompt templates.
 * "Claude Code" → "nanoPencil", feature references updated for nP.
 */

import type { InsightSection } from "./types.js";

// ============================================================================
// Facet extraction
// ============================================================================

export const FACET_EXTRACTION_PROMPT = `Analyze this nanoPencil session and extract structured facets.

CRITICAL GUIDELINES:

1. **goal_categories**: Count ONLY what the USER explicitly asked for.
   - DO NOT count the agent's autonomous codebase exploration
   - DO NOT count work the agent decided to do on its own
   - ONLY count when user says "can you...", "please...", "I need...", "let's..."

2. **user_satisfaction_counts**: Base ONLY on explicit user signals.
   - "Yay!", "great!", "perfect!" → happy
   - "thanks", "looks good", "that works" → satisfied
   - "ok, now let's..." (continuing without complaint) → likely_satisfied
   - "that's not right", "try again" → dissatisfied
   - "this is broken", "I give up" → frustrated

3. **friction_counts**: Be specific about what went wrong.
   - misunderstood_request: Agent interpreted incorrectly
   - wrong_approach: Right goal, wrong solution method
   - buggy_code: Code didn't work correctly
   - user_rejected_action: User said no/stop to a tool call
   - excessive_changes: Over-engineered or changed too much

4. If very short or just warmup, use warmup_minimal for goal_category

SESSION:
`;

export const FACET_EXTRACTION_SCHEMA = `RESPOND WITH ONLY A VALID JSON OBJECT matching this schema:
{
  "underlying_goal": "What the user fundamentally wanted to achieve",
  "goal_categories": {"category_name": count, ...},
  "outcome": "fully_achieved|mostly_achieved|partially_achieved|not_achieved|unclear_from_transcript",
  "user_satisfaction_counts": {"level": count, ...},
  "claude_helpfulness": "unhelpful|slightly_helpful|moderately_helpful|very_helpful|essential",
  "session_type": "single_task|multi_task|iterative_refinement|exploration|quick_question",
  "friction_counts": {"friction_type": count, ...},
  "friction_detail": "One sentence describing friction or empty",
  "primary_success": "none|fast_accurate_search|correct_code_edits|good_explanations|proactive_help|multi_file_changes|good_debugging",
  "brief_summary": "One sentence: what user wanted and whether they got it"
}`;

// ============================================================================
// Transcript chunk summarization
// ============================================================================

export const SUMMARIZE_CHUNK_PROMPT = `Summarize this portion of a nanoPencil session transcript. Focus on:
1. What the user asked for
2. What the agent did (tools used, files modified)
3. Any friction or issues
4. The outcome

Keep it concise - 3-5 sentences. Preserve specific details like file names, error messages, and user feedback.

TRANSCRIPT CHUNK:
`;

// ============================================================================
// Insight sections (run in parallel)
// ============================================================================

export const INSIGHT_SECTIONS: InsightSection[] = [
	{
		name: "project_areas",
		prompt: `Analyze this nanoPencil usage data and identify project areas.

RESPOND WITH ONLY A VALID JSON OBJECT:
{
  "areas": [
    {"name": "Area name", "session_count": N, "description": "2-3 sentences about what was worked on and how nanoPencil was used."}
  ]
}

Include 4-5 areas. Skip internal operations.`,
		maxTokens: 8192,
	},
	{
		name: "interaction_style",
		prompt: `Analyze this nanoPencil usage data and describe the user's interaction style.

RESPOND WITH ONLY A VALID JSON OBJECT:
{
  "narrative": "2-3 paragraphs analyzing HOW the user interacts with nanoPencil. Use second person 'you'. Describe patterns: iterate quickly vs detailed upfront specs? Interrupt often or let the agent run? Include specific examples. Use **bold** for key insights.",
  "key_pattern": "One sentence summary of most distinctive interaction style"
}`,
		maxTokens: 8192,
	},
	{
		name: "what_works",
		prompt: `Analyze this nanoPencil usage data and identify what's working well for this user. Use second person ("you").

RESPOND WITH ONLY A VALID JSON OBJECT:
{
  "intro": "1 sentence of context",
  "impressive_workflows": [
    {"title": "Short title (3-6 words)", "description": "2-3 sentences describing the impressive workflow or approach. Use 'you' not 'the user'."}
  ]
}

Include 3 impressive workflows.`,
		maxTokens: 8192,
	},
	{
		name: "friction_analysis",
		prompt: `Analyze this nanoPencil usage data and identify friction points for this user. Use second person ("you").

RESPOND WITH ONLY A VALID JSON OBJECT:
{
  "intro": "1 sentence summarizing friction patterns",
  "categories": [
    {"category": "Concrete category name", "description": "1-2 sentences explaining this category and what could be done differently. Use 'you' not 'the user'.", "examples": ["Specific example with consequence", "Another example"]}
  ]
}

Include 3 friction categories with 2 examples each.`,
		maxTokens: 8192,
	},
	{
		name: "suggestions",
		prompt: `Analyze this nanoPencil usage data and suggest improvements.

## NANOFEATURES REFERENCE (pick from these for features_to_try):
1. **GRUB**: Autonomous long-running task engine. Runs iterative loops with disk-persistent state.
   - How to use: Type \`/grub <goal>\` to start an autonomous task
   - Good for: large multi-file refactors, feature implementation with test validation, iterative debugging

2. **Custom Skills**: Reusable prompts you define as markdown files that run with a single /command.
   - How to use: Create \`.nanopencil/skills/commit/SKILL.md\` with instructions. Then type \`/commit\` to run it.
   - Good for: repetitive workflows - /commit, /review, /test, /deploy, /pr, or complex multi-step workflows

3. **teach**: Guided knowledge teaching with analogy + source verification.
   - How to use: Type \`/teach <topic>\` for a guided explanation
   - Good for: learning new concepts, understanding codebase architecture, onboarding

4. **Browser Harness**: Control your real Chrome/Edge browser via CDP.
   - How to use: The agent can use the \`browser\` tool to automate web tasks
   - Good for: testing web UIs, scraping data, automating browser workflows

5. **Task Agents**: Spawn focused sub-agents for complex exploration or parallel work.
   - How to use: The agent auto-invokes when helpful, or ask "use an agent to explore X"
   - Good for: codebase exploration, understanding complex systems, parallel investigation

RESPOND WITH ONLY A VALID JSON OBJECT:
{
  "claude_md_additions": [
    {"addition": "A specific line or block to add to CLAUDE.md based on workflow patterns. E.g., 'Always run tests after modifying auth-related files'", "why": "1 sentence explaining why this would help based on actual sessions", "prompt_scaffold": "Instructions for where to add this in CLAUDE.md. E.g., 'Add under ## Testing section'"}
  ],
  "features_to_try": [
    {"feature": "Feature name from NANOFEATURES REFERENCE above", "one_liner": "What it does", "why_for_you": "Why this would help YOU based on your sessions", "example_code": "Actual command or config to copy"}
  ],
  "usage_patterns": [
    {"title": "Short title", "suggestion": "1-2 sentence summary", "detail": "3-4 sentences explaining how this applies to YOUR work", "copyable_prompt": "A specific prompt to copy and try"}
  ]
}

IMPORTANT for claude_md_additions: PRIORITIZE instructions that appear MULTIPLE TIMES in the user data. If user told the agent the same thing in 2+ sessions (e.g., 'always run tests', 'use TypeScript'), that's a PRIME candidate - they shouldn't have to repeat themselves.

IMPORTANT for features_to_try: Pick 2-3 from the NANOFEATURES REFERENCE above. Include 2-3 items for each category.`,
		maxTokens: 8192,
	},
	{
		name: "on_the_horizon",
		prompt: `Analyze this nanoPencil usage data and identify future opportunities.

RESPOND WITH ONLY A VALID JSON OBJECT:
{
  "intro": "1 sentence about evolving AI-assisted development",
  "opportunities": [
    {"title": "Short title (4-8 words)", "whats_possible": "2-3 ambitious sentences about autonomous workflows", "how_to_try": "1-2 sentences mentioning relevant tooling", "copyable_prompt": "Detailed prompt to try"}
  ]
}

Include 3 opportunities. Think BIG - autonomous workflows, parallel agents, iterating against tests.`,
		maxTokens: 8192,
	},
	{
		name: "fun_ending",
		prompt: `Analyze this nanoPencil usage data and find a memorable moment.

RESPOND WITH ONLY A VALID JSON OBJECT:
{
  "headline": "A memorable QUALITATIVE moment from the transcripts - not a statistic. Something human, funny, or surprising.",
  "detail": "Brief context about when/where this happened"
}

Find something genuinely interesting or amusing from the session summaries.`,
		maxTokens: 8192,
	},
];

// ============================================================================
// At-a-glance summary (generated after other sections)
// ============================================================================

export function buildAtAGlancePrompt(
	fullContext: string,
	projectAreasText: string,
	bigWinsText: string,
	frictionText: string,
	featuresText: string,
	patternsText: string,
	horizonText: string,
): string {
	return `You're writing an "At a Glance" summary for a nanoPencil usage insights report. The goal is to help the user understand their usage and improve how they can use nanoPencil better, especially as models improve.

Use this 4-part structure:

1. **What's working** - What is the user's unique style of interacting with nanoPencil and what are some impactful things they've done? You can include one or two details, but keep it high level since things might not be fresh in the user's memory. Don't be fluffy or overly complimentary. Also, don't focus on the tool calls they use.

2. **What's hindering you** - Split into (a) agent's fault (misunderstandings, wrong approaches, bugs) and (b) user-side friction (not providing enough context, environment issues -- ideally more general than just one project). Be honest but constructive.

3. **Quick wins to try** - Specific nanoPencil features they could try from the examples below, or a workflow technique if you think it's really compelling. (Avoid stuff like "Ask the agent to confirm before taking actions" or "Type out more context up front" which are less compelling.)

4. **Ambitious workflows for better models** - As we move to much more capable models over the next 3-6 months, what should they prepare for? What workflows that seem impossible now will become possible? Draw from the appropriate section below.

Keep each section to 2-3 not-too-long sentences. Don't overwhelm the user. Don't mention specific numerical stats or underlined_categories from the session data below. Use a coaching tone.

RESPOND WITH ONLY A VALID JSON OBJECT:
{
  "whats_working": "(refer to instructions above)",
  "whats_hindering": "(refer to instructions above)",
  "quick_wins": "(refer to instructions above)",
  "ambitious_workflows": "(refer to instructions above)"
}

SESSION DATA:
${fullContext}

## Project Areas (what user works on)
${projectAreasText}

## Big Wins (impressive accomplishments)
${bigWinsText}

## Friction Categories (where things go wrong)
${frictionText}

## Features to Try
${featuresText}

## Usage Patterns to Adopt
${patternsText}

## On the Horizon (ambitious workflows for better models)
${horizonText}`;
}
