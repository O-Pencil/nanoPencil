import assert from "node:assert/strict";
import test from "node:test";
import { normalizeExperimentId, resolveSalSidecarDir } from "../extensions/defaults/sal/index.js";

test("sal experiment: normalizes experiment ids into safe path segments", () => {
	assert.equal(normalizeExperimentId(undefined), undefined);
	assert.equal(normalizeExperimentId(""), undefined);
	assert.equal(normalizeExperimentId("  image-flow-001  "), "image-flow-001");
	assert.equal(normalizeExperimentId("image flow/001"), "image-flow-001");
	assert.equal(normalizeExperimentId("***"), "run");
});

test("sal experiment: uses legacy anchor directory when no experiment id is provided", () => {
	assert.equal(resolveSalSidecarDir("/repo/project"), "/repo/project/.memory-experiments/sal/anchors");
});

test("sal experiment: exports anchors into a run-local directory when experiment id is set", () => {
	assert.equal(
		resolveSalSidecarDir("/repo/project", "image-flow-001"),
		"/repo/project/.memory-experiments/runs/image-flow-001/sal/anchors",
	);
	assert.equal(
		resolveSalSidecarDir("/repo/project", "image flow/001"),
		"/repo/project/.memory-experiments/runs/image-flow-001/sal/anchors",
	);
});
