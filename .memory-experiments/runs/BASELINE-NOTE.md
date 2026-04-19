# Baseline Runs (Pre-Fix)

Runs `run-001`, `run-002`, `run-003` were executed **before** the following fixes:

1. `pathsOverlap` — structural boost path matching fix (absolute vs relative)
2. SAL short-prompt filter — skip locateTask for prompts <12 chars
3. Tag-based structural fallback — infer module proximity from path-like tags
4. Duplicate recall record filter — skip memory_recalls emission for probe turns

## Known Data Quality Issues

- 4/6 runs stuck in `status=running` (session_shutdown fix not deployed)
- All `diff_*` metrics are 0 in InsForge (diff capture not working)
- Turn 1 is always `"print"` (startup word, not the real task)
- Duplicate memory recall records from internal probe before_agent_start events
- run-001-control R2 patch == R1 (R2 did no incremental work)
- run-003-sal R2 patch == R1 (R2 did no incremental work)
- run-003 control and sal R1 patches are byte-identical (no SAL differentiation)

## Conclusion

These runs serve as a **pre-fix baseline** only. They should not be used to
evaluate SAL effectiveness. Re-run with the fixes deployed and updated
experiment protocol (direct `-p` prompt, memory inheritance check).
