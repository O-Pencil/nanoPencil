#!/usr/bin/env node

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
	const args = {
		runDir: undefined,
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--run-dir" && i + 1 < argv.length) {
			args.runDir = argv[++i];
		}
	}
	return args;
}

function readJson(path, fallback) {
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return fallback;
	}
}

function readText(path) {
	try {
		return readFileSync(path, "utf8").trim();
	} catch {
		return undefined;
	}
}

function ensureDir(path) {
	if (!existsSync(path)) {
		mkdirSync(path, { recursive: true });
	}
}

function listJsonFiles(dir) {
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((name) => name.endsWith(".json"))
		.map((name) => join(dir, name))
		.sort();
}

function listFilesRecursive(dir) {
	if (!existsSync(dir)) return [];
	const out = [];
	for (const name of readdirSync(dir)) {
		const filePath = join(dir, name);
		const st = statSync(filePath);
		if (st.isDirectory()) {
			out.push(...listFilesRecursive(filePath));
		} else {
			out.push(filePath);
		}
	}
	return out.sort();
}

function jsonArrayLength(path) {
	const data = readJson(path, []);
	return Array.isArray(data) ? data.length : 0;
}

function countAnchoredEntries(path) {
	const data = readJson(path, []);
	if (!Array.isArray(data)) return 0;
	let count = 0;
	for (const item of data) {
		if (item && typeof item === "object" && item.structuralAnchor) {
			count += 1;
		}
	}
	return count;
}

export function summarizeMemory(memoryDir) {
	const files = listFilesRecursive(memoryDir);
	return {
		files: files.length,
		knowledgeEntries: jsonArrayLength(join(memoryDir, "knowledge.json")),
		lessonEntries: jsonArrayLength(join(memoryDir, "lessons.json")),
		facetEntries: jsonArrayLength(join(memoryDir, "facets.json")),
		workEntries: jsonArrayLength(join(memoryDir, "work.json")),
		v2SemanticEntries: jsonArrayLength(join(memoryDir, "v2", "semantic.json")),
		structuralAnchorEntries:
			countAnchoredEntries(join(memoryDir, "knowledge.json")) +
			countAnchoredEntries(join(memoryDir, "lessons.json")) +
			countAnchoredEntries(join(memoryDir, "facets.json")) +
			countAnchoredEntries(join(memoryDir, "work.json")) +
			countAnchoredEntries(join(memoryDir, "v2", "semantic.json")),
	};
}

export function summarizeAnchors(anchorDir) {
	const files = listJsonFiles(anchorDir);
	let taskAnchorHits = 0;
	let taskAnchorMisses = 0;
	let actionAnchorHits = 0;
	let actionAnchorMisses = 0;

	for (const filePath of files) {
		const record = readJson(filePath, {});
		if (record.taskAnchor) taskAnchorHits += 1;
		else taskAnchorMisses += 1;

		if (record.actionAnchor) actionAnchorHits += 1;
		else if (Array.isArray(record.touchedFiles) && record.touchedFiles.length > 0) actionAnchorMisses += 1;
	}

	return {
		files: files.length,
		taskAnchorHits,
		taskAnchorMisses,
		actionAnchorHits,
		actionAnchorMisses,
		anchorFiles: files.map((filePath) => basename(filePath)),
	};
}

export function summarizeRounds(roundsDir) {
	const files = listJsonFiles(roundsDir);
	const rounds = files.map((filePath) => readJson(filePath, {})).filter((round) => round && typeof round === "object");
	const diffSummary = { insertions: 0, deletions: 0, net: 0 };
	let completedRounds = 0;
	let totalTurns = 0;
	for (const round of rounds) {
		if (round.completed) completedRounds += 1;
		if (typeof round.turnCount === "number") totalTurns += round.turnCount;
		if (round.diffStat && typeof round.diffStat === "object") {
			diffSummary.insertions += Number(round.diffStat.insertions || 0);
			diffSummary.deletions += Number(round.diffStat.deletions || 0);
			diffSummary.net += Number(round.diffStat.net || 0);
		}
	}
	return {
		count: rounds.length,
		completedRounds,
		totalTurns,
		rounds,
		diffSummary,
	};
}

function scoreAnchoring(controlSummary, salSummary) {
	if (salSummary < controlSummary) return 2;
	if (salSummary === controlSummary) return 3;
	if (salSummary >= controlSummary + 2) return 5;
	return 4;
}

function scoreRound2Recall(controlRounds, salRounds) {
	const controlRound2 = controlRounds.find((round) => round.roundId === "round-2");
	const salRound2 = salRounds.find((round) => round.roundId === "round-2");
	if (!controlRound2 || !salRound2) return null;

	if (typeof controlRound2.turnCount === "number" && typeof salRound2.turnCount === "number") {
		if (salRound2.turnCount < controlRound2.turnCount) return 4;
		if (controlRound2.turnCount < salRound2.turnCount) return 2;
		return 3;
	}
	return null;
}

function computeVerdict(scorecard) {
	const round2RecallReuse = scorecard.scores.round2RecallReuse;
	const memoryAnchoring = scorecard.scores.memoryAnchoring;
	if (round2RecallReuse === null) {
		return {
			verdict: "neutral",
			confidence: "low",
			reason: "Anchoring signal exists, but task-level superiority is not measurable from the available round data.",
		};
	}
	if (round2RecallReuse >= 4 && memoryAnchoring >= 4) {
		return {
			verdict: "helped",
			confidence: "medium",
			reason: "SAL shows both stronger structural anchoring and a measurable follow-up reuse advantage.",
		};
	}
	if (round2RecallReuse <= 2) {
		return {
			verdict: "regressed",
			confidence: "medium",
			reason: "SAL underperformed on the follow-up reuse metric.",
		};
	}
	return {
		verdict: "neutral",
		confidence: "low",
		reason: "SAL anchored memories, but the available round metrics do not establish a clear task-level win.",
	};
}

export function buildVariantReport(runDir, variant) {
	const variantDir = join(runDir, variant);
	const memoryDir = join(variantDir, "memory");
	const anchorsDir = join(variantDir, "anchors");
	const roundsDir = join(variantDir, "rounds");
	const sourceCommit = readText(join(runDir, "source", "commit.txt"));
	const sourceBranch = readText(join(runDir, "source", "branch.txt"));
	const manifest = readJson(join(runDir, "manifest.json"), {});

	return {
		runId: basename(runDir),
		variant,
		sourceCommit,
		sourceBranch,
		model: manifest.model,
		thinking: manifest.thinking,
		taskFile: manifest.taskFile,
		roundSummary: summarizeRounds(roundsDir),
		memorySummary: summarizeMemory(memoryDir),
		anchorSummary: summarizeAnchors(anchorsDir),
	};
}

function buildVariantMarkdown(report) {
	const lines = [
		`# Variant Report: ${report.variant}`,
		"",
		"## Metadata",
		`- run id: ${report.runId}`,
		`- variant: ${report.variant}`,
		`- source branch: ${report.sourceBranch ?? "(unknown)"}`,
		`- source commit: ${report.sourceCommit ?? "(unknown)"}`,
		`- model: ${report.model ?? "(unknown)"}`,
		`- thinking: ${report.thinking ?? "(unknown)"}`,
		"",
		"## Round Summary",
		`- rounds: ${report.roundSummary.count}`,
		`- completed rounds: ${report.roundSummary.completedRounds}`,
		`- total turns: ${report.roundSummary.totalTurns}`,
		`- total diff: +${report.roundSummary.diffSummary.insertions} / -${report.roundSummary.diffSummary.deletions} / net ${report.roundSummary.diffSummary.net}`,
		"",
		"## Memory Summary",
		`- files: ${report.memorySummary.files}`,
		`- knowledge entries: ${report.memorySummary.knowledgeEntries}`,
		`- lesson entries: ${report.memorySummary.lessonEntries}`,
		`- facet entries: ${report.memorySummary.facetEntries}`,
		`- work entries: ${report.memorySummary.workEntries}`,
		`- v2 semantic entries: ${report.memorySummary.v2SemanticEntries}`,
		`- structural anchor entries: ${report.memorySummary.structuralAnchorEntries}`,
		"",
		"## Anchor Summary",
		`- anchor files: ${report.anchorSummary.files}`,
		`- task anchor hits: ${report.anchorSummary.taskAnchorHits}`,
		`- task anchor misses: ${report.anchorSummary.taskAnchorMisses}`,
		`- action anchor hits: ${report.anchorSummary.actionAnchorHits}`,
		`- action anchor misses: ${report.anchorSummary.actionAnchorMisses}`,
	];
	return `${lines.join("\n")}\n`;
}

export function generateSalExperimentReports(runDir) {
	const normalizedRunDir = resolve(runDir);
	const controlReport = buildVariantReport(normalizedRunDir, "control");
	const salReport = buildVariantReport(normalizedRunDir, "sal");

	const scorecard = {
		runId: basename(normalizedRunDir),
		verdict: "neutral",
		confidence: "low",
		scores: {
			timeToTarget: null,
			searchNoise: null,
			editConcentration: null,
			round2RecallReuse: scoreRound2Recall(controlReport.roundSummary.rounds, salReport.roundSummary.rounds),
			memoryAnchoring: scoreAnchoring(
				controlReport.memorySummary.structuralAnchorEntries,
				salReport.memorySummary.structuralAnchorEntries,
			),
		},
		notes: [],
	};

	const verdict = computeVerdict(scorecard);
	scorecard.verdict = verdict.verdict;
	scorecard.confidence = verdict.confidence;
	scorecard.notes.push(verdict.reason);

	const compareReport = {
		runId: basename(normalizedRunDir),
		sourceBranch: controlReport.sourceBranch ?? salReport.sourceBranch,
		sourceCommit: controlReport.sourceCommit ?? salReport.sourceCommit,
		model: controlReport.model ?? salReport.model,
		thinking: controlReport.thinking ?? salReport.thinking,
		variants: {
			control: controlReport,
			sal: salReport,
		},
		validity: {
			sameCommit: Boolean(controlReport.sourceCommit && controlReport.sourceCommit === salReport.sourceCommit),
			sameModel: controlReport.model === salReport.model,
			runLocalAnchorsOnly: true,
		},
		scorecard,
	};

	const compareMarkdown = [
		`# SAL Experiment Results: ${basename(normalizedRunDir)}`,
		"",
		"## Experiment Setup",
		`- run id: ${basename(normalizedRunDir)}`,
		`- source branch: ${compareReport.sourceBranch ?? "(unknown)"}`,
		`- source commit: ${compareReport.sourceCommit ?? "(unknown)"}`,
		`- model: ${compareReport.model ?? "(unknown)"}`,
		`- thinking: ${compareReport.thinking ?? "(unknown)"}`,
		"",
		"## Variant Summary",
		"| Metric | Control | SAL |",
		"|--------|---------|-----|",
		`| Memory files | ${controlReport.memorySummary.files} | ${salReport.memorySummary.files} |`,
		`| V2 semantic entries | ${controlReport.memorySummary.v2SemanticEntries} | ${salReport.memorySummary.v2SemanticEntries} |`,
		`| Structural anchor entries | ${controlReport.memorySummary.structuralAnchorEntries} | ${salReport.memorySummary.structuralAnchorEntries} |`,
		`| Anchor files | ${controlReport.anchorSummary.files} | ${salReport.anchorSummary.files} |`,
		`| Total diff net | ${controlReport.roundSummary.diffSummary.net} | ${salReport.roundSummary.diffSummary.net} |`,
		"",
		"## Findings",
		"- Observed Fact: SAL and control reports were generated from the same run directory.",
		`- Observed Fact: SAL structural anchor entries = ${salReport.memorySummary.structuralAnchorEntries}; control = ${controlReport.memorySummary.structuralAnchorEntries}.`,
		`- Inference: ${verdict.reason}`,
		"",
		"## Validity Check",
		`- same commit: ${compareReport.validity.sameCommit ? "yes" : "no"}`,
		`- same model: ${compareReport.validity.sameModel ? "yes" : "no"}`,
		`- run-local anchors only: ${compareReport.validity.runLocalAnchorsOnly ? "yes" : "no"}`,
		"",
		"## Verdict",
		`- verdict: ${scorecard.verdict}`,
		`- confidence: ${scorecard.confidence}`,
	];

	return {
		controlReport,
		salReport,
		compareReport,
		scorecard,
		compareMarkdown: `${compareMarkdown.join("\n")}\n`,
	};
}

export function writeSalExperimentReports(runDir) {
	const normalizedRunDir = resolve(runDir);
	const { controlReport, salReport, compareReport, scorecard, compareMarkdown } =
		generateSalExperimentReports(normalizedRunDir);

	const controlDir = join(normalizedRunDir, "control");
	const salDir = join(normalizedRunDir, "sal");
	const compareDir = join(normalizedRunDir, "compare");
	ensureDir(controlDir);
	ensureDir(salDir);
	ensureDir(compareDir);

	writeFileSync(join(controlDir, "report.json"), JSON.stringify(controlReport, null, 2));
	writeFileSync(join(controlDir, "report.md"), buildVariantMarkdown(controlReport));
	writeFileSync(join(salDir, "report.json"), JSON.stringify(salReport, null, 2));
	writeFileSync(join(salDir, "report.md"), buildVariantMarkdown(salReport));
	writeFileSync(join(compareDir, "report.json"), JSON.stringify(compareReport, null, 2));
	writeFileSync(join(compareDir, "report.md"), compareMarkdown);
	writeFileSync(join(compareDir, "scorecard.json"), JSON.stringify(scorecard, null, 2));

	return { controlReport, salReport, compareReport, scorecard };
}

function printUsageAndExit() {
	console.error("Usage: node scripts/generate-sal-experiment-report.js --run-dir <path>");
	process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const args = parseArgs(process.argv.slice(2));
	if (!args.runDir) {
		printUsageAndExit();
	}
	const runDir = resolve(args.runDir);
	if (!existsSync(runDir)) {
		console.error(`Run directory not found: ${runDir}`);
		process.exit(1);
	}
	writeSalExperimentReports(runDir);
	console.log(`Generated SAL experiment reports under ${runDir}`);
}
