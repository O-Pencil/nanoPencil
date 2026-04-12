import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { writeSalExperimentReports } from "../scripts/generate-sal-experiment-report.js";

async function writeJson(path: string, value: unknown): Promise<void> {
	await mkdir(dirname(path), { recursive: true }).catch(() => undefined);
	await writeFile(path, JSON.stringify(value, null, 2));
}

test("sal experiment report generator: writes variant and compare reports for a run-local directory", async () => {
	const root = await mkdtemp(join(tmpdir(), "sal-run-"));
	const runDir = join(root, "image-flow-001");

	try {
		await mkdir(join(runDir, "source"), { recursive: true });
		await mkdir(join(runDir, "control", "memory", "v2"), { recursive: true });
		await mkdir(join(runDir, "control", "rounds"), { recursive: true });
		await mkdir(join(runDir, "sal", "memory", "v2"), { recursive: true });
		await mkdir(join(runDir, "sal", "anchors"), { recursive: true });
		await mkdir(join(runDir, "sal", "rounds"), { recursive: true });

		await writeFile(join(runDir, "source", "commit.txt"), "abc1234\n");
		await writeFile(join(runDir, "source", "branch.txt"), "main\n");
		await writeJson(join(runDir, "manifest.json"), {
			model: "openai/gpt-5.4-mini",
			thinking: "medium",
			taskFile: ".memory-experiments/tasks/image-flow.yaml",
		});

		await writeJson(join(runDir, "control", "memory", "knowledge.json"), []);
		await writeJson(join(runDir, "control", "memory", "lessons.json"), []);
		await writeJson(join(runDir, "control", "memory", "facets.json"), []);
		await writeJson(join(runDir, "control", "memory", "work.json"), []);
		await writeJson(join(runDir, "control", "memory", "preferences.json"), []);
		await writeJson(join(runDir, "control", "memory", "events.json"), []);
		await writeJson(join(runDir, "control", "memory", "v2", "semantic.json"), [
			{ id: "sem-control-1", summary: "control memory" },
		]);
		await writeJson(join(runDir, "control", "rounds", "round-1.json"), {
			roundId: "round-1",
			completed: true,
			turnCount: 6,
			diffStat: { insertions: 10, deletions: 3, net: 7 },
		});
		await writeJson(join(runDir, "control", "rounds", "round-2.json"), {
			roundId: "round-2",
			completed: true,
			turnCount: 5,
			diffStat: { insertions: 2, deletions: 0, net: 2 },
		});

		await writeJson(join(runDir, "sal", "memory", "knowledge.json"), []);
		await writeJson(join(runDir, "sal", "memory", "lessons.json"), []);
		await writeJson(join(runDir, "sal", "memory", "facets.json"), []);
		await writeJson(join(runDir, "sal", "memory", "work.json"), []);
		await writeJson(join(runDir, "sal", "memory", "preferences.json"), []);
		await writeJson(join(runDir, "sal", "memory", "events.json"), []);
		await writeJson(join(runDir, "sal", "memory", "v2", "semantic.json"), [
			{
				id: "sem-sal-1",
				summary: "sal memory",
				structuralAnchor: { modulePath: "modes/utils", filePath: "modes/utils/clipboard-image.ts" },
			},
		]);
		await writeJson(join(runDir, "sal", "anchors", "turn-1.json"), {
			taskAnchor: { modulePath: "modes/utils", confidence: 0.8 },
			actionAnchor: { filePath: "modes/utils/clipboard-image.ts", confidence: 1 },
			touchedFiles: ["modes/utils/clipboard-image.ts"],
		});
		await writeJson(join(runDir, "sal", "rounds", "round-1.json"), {
			roundId: "round-1",
			completed: true,
			turnCount: 6,
			diffStat: { insertions: 8, deletions: 1, net: 7 },
		});
		await writeJson(join(runDir, "sal", "rounds", "round-2.json"), {
			roundId: "round-2",
			completed: true,
			turnCount: 4,
			diffStat: { insertions: 4, deletions: 1, net: 3 },
		});

		writeSalExperimentReports(runDir);

		const salReport = JSON.parse(await readFile(join(runDir, "sal", "report.json"), "utf8"));
		const compareReport = JSON.parse(await readFile(join(runDir, "compare", "report.json"), "utf8"));
		const scorecard = JSON.parse(await readFile(join(runDir, "compare", "scorecard.json"), "utf8"));

		assert.equal(salReport.memorySummary.structuralAnchorEntries, 1);
		assert.equal(salReport.anchorSummary.taskAnchorHits, 1);
		assert.equal(compareReport.validity.sameCommit, true);
		assert.equal(scorecard.scores.memoryAnchoring, 4);
		assert.equal(scorecard.scores.round2RecallReuse, 4);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
