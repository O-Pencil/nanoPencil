/**
 * Statistics aggregation for the /insights command.
 *
 * 1:1 port of Claude Code src/commands/insights.ts aggregateData().
 * Removed: multi-clauding detection (CC-specific).
 */

import type { SessionMeta, SessionFacets, AggregatedData } from "./types.js";

function safeEntries<V>(obj: Record<string, V> | undefined | null): [string, V][] {
	return obj ? Object.entries(obj) : [];
}

export function aggregateData(
	sessions: SessionMeta[],
	facets: Map<string, SessionFacets>,
): AggregatedData {
	const result: AggregatedData = {
		total_sessions: sessions.length,
		sessions_with_facets: facets.size,
		date_range: { start: "", end: "" },
		total_messages: 0,
		total_duration_hours: 0,
		total_input_tokens: 0,
		total_output_tokens: 0,
		tool_counts: {},
		languages: {},
		git_commits: 0,
		git_pushes: 0,
		projects: {},
		goal_categories: {},
		outcomes: {},
		satisfaction: {},
		helpfulness: {},
		session_types: {},
		friction: {},
		success: {},
		session_summaries: [],
		total_interruptions: 0,
		total_tool_errors: 0,
		tool_error_categories: {},
		user_response_times: [],
		median_response_time: 0,
		avg_response_time: 0,
		sessions_using_task_agent: 0,
		sessions_using_mcp: 0,
		sessions_using_web_search: 0,
		sessions_using_web_fetch: 0,
		total_lines_added: 0,
		total_lines_removed: 0,
		total_files_modified: 0,
		days_active: 0,
		messages_per_day: 0,
		message_hours: [],
	};

	const dates: string[] = [];
	const allResponseTimes: number[] = [];
	const allMessageHours: number[] = [];

	for (const session of sessions) {
		dates.push(session.start_time);
		result.total_messages += session.user_message_count;
		result.total_duration_hours += session.duration_minutes / 60;
		result.total_input_tokens += session.input_tokens;
		result.total_output_tokens += session.output_tokens;
		result.git_commits += session.git_commits;
		result.git_pushes += session.git_pushes;

		result.total_interruptions += session.user_interruptions;
		result.total_tool_errors += session.tool_errors;
		for (const [cat, count] of Object.entries(session.tool_error_categories)) {
			result.tool_error_categories[cat] = (result.tool_error_categories[cat] || 0) + count;
		}
		allResponseTimes.push(...session.user_response_times);
		if (session.uses_task_agent) result.sessions_using_task_agent++;
		if (session.uses_mcp) result.sessions_using_mcp++;
		if (session.uses_web_search) result.sessions_using_web_search++;
		if (session.uses_web_fetch) result.sessions_using_web_fetch++;

		result.total_lines_added += session.lines_added;
		result.total_lines_removed += session.lines_removed;
		result.total_files_modified += session.files_modified;
		allMessageHours.push(...session.message_hours);

		for (const [tool, count] of Object.entries(session.tool_counts)) {
			result.tool_counts[tool] = (result.tool_counts[tool] || 0) + count;
		}

		for (const [lang, count] of Object.entries(session.languages)) {
			result.languages[lang] = (result.languages[lang] || 0) + count;
		}

		if (session.project_path) {
			result.projects[session.project_path] = (result.projects[session.project_path] || 0) + 1;
		}

		const sessionFacets = facets.get(session.session_id);
		if (sessionFacets) {
			for (const [cat, count] of safeEntries(sessionFacets.goal_categories)) {
				if (count > 0) {
					result.goal_categories[cat] = (result.goal_categories[cat] || 0) + count;
				}
			}

			result.outcomes[sessionFacets.outcome] = (result.outcomes[sessionFacets.outcome] || 0) + 1;

			for (const [level, count] of safeEntries(sessionFacets.user_satisfaction_counts)) {
				if (count > 0) {
					result.satisfaction[level] = (result.satisfaction[level] || 0) + count;
				}
			}

			result.helpfulness[sessionFacets.claude_helpfulness] =
				(result.helpfulness[sessionFacets.claude_helpfulness] || 0) + 1;

			result.session_types[sessionFacets.session_type] =
				(result.session_types[sessionFacets.session_type] || 0) + 1;

			for (const [type, count] of safeEntries(sessionFacets.friction_counts)) {
				if (count > 0) {
					result.friction[type] = (result.friction[type] || 0) + count;
				}
			}

			if (sessionFacets.primary_success !== "none") {
				result.success[sessionFacets.primary_success] =
					(result.success[sessionFacets.primary_success] || 0) + 1;
			}
		}

		if (result.session_summaries.length < 50) {
			result.session_summaries.push({
				id: session.session_id.slice(0, 8),
				date: session.start_time.split("T")[0] || "",
				summary: session.summary || session.first_prompt.slice(0, 100),
				goal: sessionFacets?.underlying_goal,
			});
		}
	}

	dates.sort();
	result.date_range.start = dates[0]?.split("T")[0] || "";
	result.date_range.end = dates[dates.length - 1]?.split("T")[0] || "";

	result.user_response_times = allResponseTimes;
	if (allResponseTimes.length > 0) {
		const sorted = [...allResponseTimes].sort((a, b) => a - b);
		result.median_response_time = sorted[Math.floor(sorted.length / 2)] || 0;
		result.avg_response_time = allResponseTimes.reduce((a, b) => a + b, 0) / allResponseTimes.length;
	}

	const uniqueDays = new Set(dates.map((d) => d.split("T")[0]));
	result.days_active = uniqueDays.size;
	result.messages_per_day =
		result.days_active > 0 ? Math.round((result.total_messages / result.days_active) * 10) / 10 : 0;

	result.message_hours = allMessageHours;

	return result;
}
