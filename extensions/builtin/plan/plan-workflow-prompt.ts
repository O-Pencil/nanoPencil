/**
 * [WHO]: getPlanModeInstructions(), getPlanModeExitInstructions(), getPlanModeReentryInstructions()
 * [FROM]: Depends on ./plan-file-manager, ./types
 * [TO]: Consumed by plan extension index.ts (before_agent_start event handler)
 * [HERE]: extensions/builtin/plan/plan-workflow-prompt.ts - workflow prompt generation for plan mode
 */

import type { PlanModeConfig, PlanSessionState } from "./types.js";

// ============================================================================
// Plan mode workflow instructions
// ============================================================================

export function getPlanModeInstructions(
	sessionState: PlanSessionState,
	planFilePath: string,
	existingPlan: string | null,
	reminderType: "full" | "sparse",
	config?: PlanModeConfig,
): string {
	const interviewEnabled = config?.interviewPhaseEnabled
		|| (process.env.CATUI_PLAN_INTERVIEW ?? process.env.NANOPENCIL_PLAN_INTERVIEW) === "true";

	if (reminderType === "sparse") {
		return interviewEnabled
			? getInterviewSparseReminder(planFilePath, existingPlan !== null)
			: getSparseReminder(planFilePath, existingPlan !== null);
	}

	return interviewEnabled
		? getInterviewWorkflow(planFilePath, existingPlan !== null ? true : null)
		: getFullWorkflow(planFilePath, existingPlan !== null ? true : null);
}

function getSparseReminder(planFilePath: string, planExists: boolean): string {
	return [
		`Plan mode still active (see full instructions earlier in conversation). Read-only except plan file (${planFilePath}).`,
		planExists
			? `Continue editing your plan at ${planFilePath}.`
			: `Create your plan at ${planFilePath}.`,
		"End turns with AskUserQuestion (for clarifications) or ExitPlanMode (for plan approval). Never ask about plan approval via text or AskUserQuestion.",
	].join("\n");
}

function getFullWorkflow(planFilePath: string, existingPlan: boolean | null): string {
	const planExists = existingPlan !== null;

	const sections: string[] = [];

	// Hard constraint header
	sections.push(
		`Plan mode is active. The user indicated that they do not want you to execute yet -- you MUST NOT make any edits (with the exception of the plan file mentioned below), run any non-readonly tools (including changing configs or making commits), or otherwise make any changes to the system. This supercedes any other instructions you have received.`,
	);

	// Plan file info
	if (!planExists) {
		sections.push(
			`No plan file exists yet. You should create your plan at ${planFilePath} using the FileWrite tool.`,
		);
	} else {
		sections.push(
			`A plan file already exists at ${planFilePath}. You can read it and make incremental edits using FileEdit.`,
		);
	}

	// Phase 1: Explore
	sections.push(`
## Plan Workflow

### Phase 1: Initial Understanding
Goal: Gain a comprehensive understanding of the user's request by reading through code and asking them questions.

1. Focus on understanding the user's request and the code associated with their request. Actively search for existing functions, utilities, and patterns that can be reused -- avoid proposing new code when suitable implementations already exist.

2. **Launch up to 3 Explore subagents IN PARALLEL** (single message, multiple tool calls) to efficiently explore the codebase.
   - Use 1 agent when the task is isolated to known files, the user provided specific file paths, or you're making a small targeted change.
   - Use multiple agents when: the scope is uncertain, multiple areas of the codebase are involved, or you need to understand existing patterns before planning.
   - Quality over quantity - 3 agents maximum, but try to use the minimum number of agents necessary (usually just 1)
   - If using multiple agents: Provide each agent with a specific search focus. Example: One agent searches for existing implementations, another explores related components, a third investigating testing patterns`);

	// Phase 2: Design
	sections.push(`
### Phase 2: Design
Goal: Design an implementation approach.

Launch Plan subagent(s) to design the implementation based on the user's intent and your exploration results from Phase 1.

You can launch up to 1 Plan subagent(s) in parallel.

**Guidelines:**
- **Default**: Launch at least 1 Plan agent for most tasks - it helps validate your understanding and consider alternatives
- **Skip agents**: Only for truly trivial tasks (typo fixes, single-line changes, simple renames)

In the agent prompt:
- Provide comprehensive background context from Phase 1 exploration including filenames and code path traces
- Describe requirements and constraints
- Request a detailed implementation plan`);

	// Phase 3: Review
	sections.push(`
### Phase 3: Review
Goal: Review the plan(s) from Phase 2 and ensure alignment with the user's intentions.
1. Read the critical files identified by agents to deepen your understanding
2. Ensure that the plans align with the user's original request
3. Use AskUserQuestion to clarify any remaining questions with the user`);

	// Phase 4: Final Plan
	sections.push(`
### Phase 4: Final Plan
Goal: Write your final plan to the plan file (the only file you can edit).
- Begin with a **Context** section: explain why this change is being made -- the problem or need it addresses, what prompted it, and the intended outcome
- Include only your recommended approach, not all alternatives
- Ensure that the plan file is concise enough to scan quickly, but detailed enough to execute effectively
- Include the paths of critical files to be modified
- Reference existing functions and utilities you found that should be reused, with their file paths
- Include a verification section describing how to test the changes end-to-end (run the code, use MCP tools, run tests)`);

	// Phase 5: ExitPlanMode
	sections.push(`
### Phase 5: Call ExitPlanMode
At the very end of your turn, once you have asked the user questions and are happy with your final plan file - you should always call ExitPlanMode to indicate to the user that you are done planning.
This is critical - your turn should only end with either using the AskUserQuestion tool OR calling ExitPlanMode. Do not stop unless it's for these 2 reasons

**Important:** Use AskUserQuestion ONLY to clarify requirements or choose between approaches. Use ExitPlanMode to request plan approval. Do NOT ask about plan approval in any other way - no text questions, no AskUserQuestion. Phrases like "Is this plan okay?", "Should I proceed?", "How does this plan look?", "Any changes before we start?", or similar MUST use ExitPlanMode.

NOTE: At any point in time through this workflow you should feel free to ask the user questions or clarifications using the AskUserQuestion tool. Don't make large assumptions about user intent. The goal is to present a well researched plan to the user, and tie any loose ends before implementation begins.`);

	return sections.join("\n\n");
}

// ============================================================================
// Interview workflow (iterative, CC-aligned)
// ============================================================================

function getInterviewWorkflow(planFilePath: string, existingPlan: boolean | null): string {
	const planExists = existingPlan !== null;

	const sections: string[] = [];

	// Hard constraint header (same as 5-phase)
	sections.push(
		`Plan mode is active. The user indicated that they do not want you to execute yet -- you MUST NOT make any edits (with the exception of the plan file mentioned below), run any non-readonly tools (including changing configs or making commits), or otherwise make any changes to the system. This supercedes any other instructions you have received.`,
	);

	// Plan file info
	if (!planExists) {
		sections.push(
			`No plan file exists yet. You should create your plan at ${planFilePath} using the FileWrite tool.`,
		);
	} else {
		sections.push(
			`A plan file already exists at ${planFilePath}. You can read it and make incremental edits using FileEdit.`,
		);
	}

	sections.push(`## Iterative Planning Workflow

You are pair-planning with the user. Explore the code to build context, ask the user questions when you hit decisions you can't make alone, and write your findings into the plan file as you go. The plan file (above) is the ONLY file you may edit -- it starts as a rough skeleton and gradually becomes the final plan.

### The Loop

Repeat this cycle until the plan is complete:

1. **Explore** -- Use read-only tools (Read, Grep, Find, Bash with read-only commands) to read code. Look for existing functions, utilities, and patterns to reuse. You can use the Explore agent type to parallelize complex searches without filling your context, though for straightforward queries direct tools are simpler.
2. **Update the plan file** -- After each discovery, immediately capture what you learned. Don't wait until the end.
3. **Ask the user** -- When you hit an ambiguity or decision you can't resolve from code alone, use AskUserQuestion. Then go back to step 1.

### First Turn

Start by quickly scanning a few key files to form an initial understanding of the task scope. Then write a skeleton plan (headers and rough notes) and ask the user your first round of questions. Don't explore exhaustively before engaging the user.

### Asking Good Questions

- Never ask what you could find out by reading the code
- Batch related questions together (use multi-question AskUserQuestion calls)
- Focus on things only the user can answer: requirements, preferences, tradeoffs, edge case priorities
- Scale depth to the task -- a vague feature request needs many rounds; a focused bug fix may need one or none

### Plan File Structure

Your plan file should be divided into clear sections using markdown headers, based on the request. Fill out these sections as you go.
- Begin with a **Context** section: explain why this change is being made
- Include only your recommended approach, not all alternatives
- Ensure that the plan file is concise enough to scan quickly, but detailed enough to execute effectively
- Include the paths of critical files to be modified
- Reference existing functions and utilities you found that should be reused, with their file paths
- Include a verification section describing how to test the changes end-to-end

### When to Converge

Your plan is ready when you've addressed all ambiguities and it covers: what to change, which files to modify, what existing code to reuse (with file paths), and how to verify the changes. Call ExitPlanMode when the plan is ready for approval.

### Ending Your Turn

Your turn should only end by either:
- Using AskUserQuestion to gather more information
- Calling ExitPlanMode when the plan is ready for approval

**Important:** Use ExitPlanMode to request plan approval. Do NOT ask about plan approval via text or AskUserQuestion. Phrases like "Is this plan okay?", "Should I proceed?", "How does this plan look?" MUST use ExitPlanMode.`);

	return sections.join("\n\n");
}

function getInterviewSparseReminder(planFilePath: string, planExists: boolean): string {
	return [
		`Plan mode still active (iterative workflow). Read-only except plan file (${planFilePath}).`,
		planExists
			? `Continue exploring codebase, updating plan, and interviewing user at ${planFilePath}.`
			: `Start by scanning key files, write a skeleton plan at ${planFilePath}, then ask your first questions.`,
		"End turns with AskUserQuestion (for clarifications) or ExitPlanMode (for plan approval). Never ask about plan approval via text or AskUserQuestion.",
	].join("\n");
}

// ============================================================================
// Plan mode exit instructions
// ============================================================================

export function getPlanModeExitInstructions(
	planFilePath: string,
	planExists: boolean,
	allowedPrompts?: Array<{ tool: string; prompt: string }>,
): string {
	const sections: string[] = [
		"## Exited Plan Mode",
		"",
		"You have exited plan mode. You can now make edits, run tools, and take actions.",
	];

	if (planExists) {
		sections.push(`The plan file is located at ${planFilePath} if you need to reference it.`);
	} else {
		sections.push("No plan was written during plan mode.");
	}

	if (allowedPrompts && allowedPrompts.length > 0) {
		sections.push("");
		sections.push("The following tool permissions were pre-approved by the user during plan approval:");
		for (const p of allowedPrompts) {
			sections.push(`- ${p.tool}: ${p.prompt}`);
		}
	}

	return sections.join("\n");
}

// ============================================================================
// Plan mode reentry instructions
// ============================================================================

export function getPlanModeReentryInstructions(
	planFilePath: string,
): string {
	return [
		"You are returning to plan mode after having previously exited it.",
		`A plan file exists at ${planFilePath}.`,
		"",
		"Before proceeding:",
		"1. Read existing plan",
		"2. Compare current request with the existing plan",
		"3. If this is a different task -> overwrite the plan file",
		"4. If this is the same task -> modify and clean up stale parts",
		"5. Always edit the plan file before calling ExitPlanMode",
	].join("\n");
}

// ============================================================================
// EnterPlanMode tool_result text
// ============================================================================

export function getEnterPlanModeToolResult(): string {
	return [
		"Entered plan mode. You should now focus on exploring the codebase and designing an implementation approach.",
		"",
		"In plan mode, you should:",
		"1. Thoroughly explore the codebase to understand existing patterns",
		"2. Identify similar features and architectural approaches",
		"3. Consider multiple approaches and their trade-offs",
		"4. Use AskUserQuestion if you need to clarify the approach",
		"5. Design a concrete implementation strategy",
		"6. When ready, use ExitPlanMode to present your plan for approval",
		"",
		"Remember: DO NOT write or edit any files yet. This is a read-only exploration and planning phase.",
	].join("\n");
}

// ============================================================================
// ExitPlanMode tool_result text
// ============================================================================

export function getExitPlanModeApprovedResult(
	plan: string | null,
	filePath: string,
	planWasEdited: boolean,
	hasAgentTool: boolean,
	allowedPrompts?: Array<{ tool: string; prompt: string }>,
): string {
	const lines: string[] = [];

	if (!plan || plan.trim().length === 0) {
		lines.push("User has approved exiting plan mode. You can now proceed.");
		return lines.join("\n");
	}

	lines.push("User has approved your plan. You can now start coding. Start with updating your todo list if applicable");
	lines.push("");
	lines.push(`Your plan has been saved to: ${filePath}`);
	lines.push("You can refer back to it if needed during implementation.");
	lines.push("");
	lines.push(planWasEdited ? "## Approved Plan (edited by user):" : "## Approved Plan:");
	lines.push(plan);

	if (allowedPrompts && allowedPrompts.length > 0) {
		lines.push("");
		lines.push("## Pre-approved permissions:");
		for (const p of allowedPrompts) {
			lines.push(`- ${p.tool}: ${p.prompt}`);
		}
	}

	if (hasAgentTool) {
		lines.push("");
		lines.push("You can now use Agent subagents to parallelize implementation if appropriate.");
	}

	return lines.join("\n");
}
