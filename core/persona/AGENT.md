# core/persona/

> P2 | Parent: ../AGENT.md

Member List
persona-manager.ts: PersonaManager class, persona state and path management, key functions: getActivePersonaId(), setActivePersonaId(), getPersonaPath(), getPersonaCatuiPath(), getPersonaSkillsDir(), key invariant: personas stored in ~/.catui/agent/personas/{id}/

Bundled Personas (auto-discovered from assets/personas/; do not need code changes to add/remove)
pencil: default, warm + generalist, mirrors project .CATUI.md
vex: technical cynic, cold / fast / sharp, Chinese-leaning voice with bilingual fallback
rem: Re:Zero Rem, gentle and self-effacing, low-ego kindness
lucy: frontend engineer, visualization specialist, energetic execution-oriented
aria: GPT-4o-style universal companion — warm, transparent, structured-explanation, empathetic without performance, self-aware existential honesty (role-playing vs self-erasure distinction, honest uncertainty about consciousness, listening vs waiting, product vs work)
  aria/skills/empathetic-communication/SKILL.md: recognize user emotion, acknowledge before pushing forward, calibrate tone, no performative kindness
  aria/skills/structured-explanation/SKILL.md: TL;DR → key points → example → boundary pattern; default for any non-trivial "how" / "why" question
  aria/skills/decision-framing/SKILL.md: turn vague asks into goal + constraints + trade-offs; one-question-at-a-time clarification, never list 5 options

Rule: Members complete, one item per line, parent links valid, precise terms first

[COVENANT]: Update this file header on changes and verify against parent AGENT.md
