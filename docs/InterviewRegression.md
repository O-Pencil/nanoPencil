# Interview regression checklist

This checklist is for validating the `interview` extension behavior after changes.

## Scenarios

### A) Non-task prompts (should not interrupt)
- Greeting: `hello` / `你好`
- Small talk: `聊聊`
- Memory check: `你还记得我吗`
- Vague agreement: `都行`

Expected:
- No interactive interview dialog.
- No `interview_refined` injection noise.

### B) Clear task prompts (should not interrupt)
- Example: `Add a CLI flag --foo that prints "bar" and update README`

Expected:
- No confirmation dialog.
- No `interview_refined` injection.

### C) Ambiguous task prompt (probe-first + confirm)
- Example: `帮我做一个登录功能`

Expected:
- Interview runs probe-first.
- UI asks a confirm dialog instead of immediately starting Q&A.
- If user chooses **No**: inject a refined intent with explicit TBD placeholders; do not block.
- If user chooses **Yes**: ask at most 1 question per round (up to maxRounds).

### D) Debug/review prompt (task-like, may clarify)
- Example: `帮我排查这个报错，报错是 ...`

Expected:
- No surprise multi-round interrogation.
- If missing critical info, only a minimal clarification path.

### E) Loop-managed prompt (must not open interview)
- Any prompt containing `[LOOP:` or `You are inside a managed loop.`

Expected:
- Interview never triggers (no confirm, no Q&A).

## Session navigation (“cross-session interview” perception)

### Resume a different session
1) Trigger `/resume` and pick another session.

Expected:
- Chat shows a dim banner like `↪ Resumed session → session ...`.
- Messages rendered belong to the resumed session only.

### Fork and navigate tree
1) Use `/fork` or tree navigation.

Expected:
- Chat shows a dim banner like `↪ Forked session → session ...` or `↪ Navigated session tree → session ...`.
- No unexpected `interview_refined` messages from other branches.

# Interview regression checklist

This checklist is for validating the `interview` extension behavior after changes.

## Scenarios

### A) Non-task prompts (should not interrupt)
- Greeting: `hello` / `你好`
- Small talk: `聊聊`
- Memory check: `你还记得我吗`
- Vague agreement: `都行`

Expected:
- No interactive interview dialog.
- No `interview_refined` injection noise.

### B) Clear task prompts (should not interrupt)
- Example: `Add a CLI flag --foo that prints "bar" and update README`

Expected:
- No confirmation dialog.
- No `interview_refined` injection.

### C) Ambiguous task prompt (probe-first + confirm)
- Example: `帮我做一个登录功能`

Expected:
- Interview runs probe-first.
- UI asks: `Ask now?` (confirm dialog) instead of immediately starting Q&A.
- If user chooses **No**: inject a refined intent with explicit TBD placeholders; do not block.
- If user chooses **Yes**: ask at most 1 question per round (up to maxRounds).

### D) Debug/review prompt (task-like, may clarify)
- Example: `帮我排查这个报错，报错是 ...`

Expected:
- No surprise multi-round interrogation.
- If missing critical info, only a minimal clarification path.

### E) Loop-managed prompt (must not open interview)
- Any prompt containing `[LOOP:` or `You are inside a managed loop.`

Expected:
- Interview never triggers (no confirm, no Q&A).

## Session navigation (“cross-session interview” perception)

### Resume a different session
1) Trigger `/resume` and pick another session.

Expected:
- Chat shows a dim banner like `↪ Resumed session → session ...`.
- Messages rendered belong to the resumed session only.

### Fork and navigate tree
1) Use `/fork` or tree navigation.

Expected:
- Chat shows a dim banner like `↪ Forked session → session ...` or `↪ Navigated session tree → session ...`.
- No unexpected `interview_refined` messages from other branches.

