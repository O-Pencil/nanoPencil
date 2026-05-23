# extensions/defaults/recap/

> P2 | Parent: ../CLAUDE.md

Member List
index.ts: recapExtension entry — registers /recap command (Smart by default) and ※ recap message renderer; M1 scope is on-demand only, no auto trigger
recap-types.ts: RECAP_MESSAGE_TYPE constant, RecapEntry / RecapSource / RecapTriggerReason / RecapSettings types, RECAP_DEFAULTS conservative settings
recap-budget.ts: estimateInputTokens() char-count pre-flight estimate, checkPerCallBudget() pre-call hard-cap enforcement
recap-synthesizer.ts: buildRecapContext() compresses recent turns + tool names, synthesizeSmartRecap() runs completeSimpleWithUsage with three-clause system prompt and surfaces real provider usage
recap-renderer.ts: createRecapRenderer() — ※ recap header with `{in} in / {out} out · ~${cost}` accounting badge, body rendered via Text (no Markdown dependency to keep extension mode-agnostic)

Rule: Members complete, one item per line, parent links valid, precise terms first

[COVENANT]: Update this file header on changes and verify against parent CLAUDE.md
