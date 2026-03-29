#!/usr/bin/env node
/**
 * [INPUT]: process.argv
 * [OUTPUT]: stats | search <query> | forget <id> | export | insights — terminal output or JSON or HTML
 * [POS]: Standalone CLI for NanoMem — no host dependency
 */

import { writeFileSync } from "node:fs";
import { NanoMemEngine } from "./engine.js";
import { renderFullInsightsHtml } from "./full-insights-html.js";
import { renderInsightsHtml } from "./insights-html.js";

const args = process.argv.slice(2);
const sub = args[0];
const engine = new NanoMemEngine();

async function main(): Promise<void> {
	if (!sub || sub === "help" || sub === "-h" || sub === "--help") {
		console.log(`nanomem — NanoMem memory CLI

Usage:
  nanomem stats              Show memory counts (sessions, knowledge, lessons, preferences, work, episodes, facets)
  nanomem search <query>     Search memories by query text
  nanomem forget <id>        Remove a memory entry by ID
  nanomem dedup              Deduplicate all memories (merge similar entries, keep best)
  nanomem export             Export all memories as JSON to stdout
  nanomem insights [--output <path>]   Generate full HTML insights report (default: ./nanomem-insights.html)
  nanomem insights --simple [--output <path>]   Generate simple insights report (rules-only, no LLM)
  nanomem help               Show this help
`);
		return;
	}

	if (sub === "stats") {
		const s = await engine.getStats();
		console.log(`Sessions: ${s.totalSessions}`);
		console.log(`Knowledge: ${s.knowledge}`);
		console.log(`Lessons: ${s.lessons}`);
		console.log(`Preferences: ${s.preferences}`);
		console.log(`Work: ${s.work}`);
		console.log(`Episodes: ${s.episodes}`);
		return;
	}

	if (sub === "search") {
		const query = args.slice(1).join(" ").trim() || " ";
		const results = await engine.searchEntries(query);
		if (!results.length) {
			console.log("No matching memories.");
			return;
		}
		for (const e of results) {
			console.log(`[${e.type}] ${e.id} — ${(e.summary || e.detail || e.content || "").slice(0, 100)}`);
		}
		return;
	}

	if (sub === "forget") {
		const id = args[1];
		if (!id) {
			console.error("Usage: nanomem forget <id>");
			process.exit(1);
		}
		const ok = await engine.forgetEntry(id);
		console.log(ok ? `Removed entry ${id}` : `Entry ${id} not found`);
		return;
	}

	if (sub === "dedup") {
		const result = await engine.deduplicateAll();
		if (result.total === 0) {
			console.log("No duplicates found. Memory is already deduplicated.");
		} else {
			console.log(`Deduplication complete. Removed ${result.total} duplicate(s):`);
			if (result.knowledge) console.log(`  knowledge: ${result.knowledge}`);
			if (result.lessons) console.log(`  lessons: ${result.lessons}`);
			if (result.preferences) console.log(`  preferences: ${result.preferences}`);
			if (result.facets) console.log(`  facets: ${result.facets}`);
			if (result.work) console.log(`  work: ${result.work}`);
		}
		return;
	}

	if (sub === "export") {
		const data = await engine.exportAll();
		console.log(JSON.stringify(data, null, 2));
		return;
	}

	if (sub === "insights") {
		const simple = args.includes("--simple");
		const outputIdx = args.indexOf("--output");
		const outputPath = outputIdx >= 0 && args[outputIdx + 1] ? args[outputIdx + 1] : "./nanomem-insights.html";

		if (simple) {
			const report = await engine.generateInsights();
			const html = renderInsightsHtml(report, engine.cfg.locale);
			writeFileSync(outputPath, html, "utf-8");
		} else {
			const enhanced = await engine.generateEnhancedInsights();
			const html = renderFullInsightsHtml(
				({
					...enhanced.report,
					persona: enhanced.persona,
					humanInsights: enhanced.humanInsights,
					rootCauses: enhanced.rootCauses,
				} as typeof enhanced.report & {
					persona?: typeof enhanced.persona;
					humanInsights: typeof enhanced.humanInsights;
					rootCauses: typeof enhanced.rootCauses;
				}),
				engine.cfg.locale,
			);
			writeFileSync(outputPath, html, "utf-8");
		}
		console.log(`Insights report written to: ${outputPath}`);
		return;
	}

	console.error(`Unknown command: ${sub}. Run 'nanomem help' for usage.`);
	process.exit(1);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
