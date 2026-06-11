/**
 * [WHO]: scaffoldFeatureDocs - generator for docs/<feature>.md usage-skill skeletons
 * [FROM]: Depends on node:fs, node:path; reads FEATURE_DOCS manifest below
 * [TO]: Run via `npm run scaffold:docs`; output consumed by core/prompt/system-prompt.ts (agent reads docs/ at runtime)
 * [HERE]: scripts/scaffold-feature-docs.ts - scaffolds AI-readable feature usage manuals
 *
 * Generates the docs/ usage manuals that system-prompt.ts points the agent at.
 * Each doc is a "feature skill": a structured, AI-readable manual that teaches
 * pencil how one of its own features works. Code paths are NOT duplicated here —
 * the `Code map` section only points at the owning module's DIP doc (P2 AGENT.md
 * member list) and P3 file headers, so docs never go stale against code.
 *
 * The generator only writes the skeleton + TODO placeholders (frontmatter, owner
 * DIP anchor, section headers). Prose is filled by a human/owner, never invented.
 * Existing docs are never overwritten (idempotent — safe to re-run).
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS_DIR = join(ROOT, "docs");

interface FeatureDoc {
	/** filename stem → docs/<name>.md (must match the path system-prompt.ts references) */
	name: string;
	title: string;
	/** AI trigger: when should the agent pull this doc. Frontmatter `description`. */
	description: string;
	/** DIP P2 anchor — the owning module dir/file. The agent reads its AGENT.md to find code. */
	owner: string;
	related?: string[];
}

// Topics referenced by core/prompt/system-prompt.ts (+ providers.md from error
// messages). Owners are DIP P2 anchors; edit freely — pointer style keeps the
// doc decoupled from exact file paths.
const FEATURE_DOCS: FeatureDoc[] = [
	{ name: "extensions", title: "Extensions", description: "Use when the user asks how to write, load, or configure a NanoPencil extension.", owner: "core/extensions-host/", related: ["sdk", "packages", "skills"] },
	{ name: "themes", title: "Themes", description: "Use when the user asks how to change, create, or configure a NanoPencil theme.", owner: "modes/interactive/theme/", related: ["tui", "keybindings"] },
	{ name: "skills", title: "Skills", description: "Use when the user asks how skills work or how to add a skill.", owner: "core/skills.ts", related: ["extensions", "prompt-templates"] },
	{ name: "prompt-templates", title: "Prompt Templates", description: "Use when the user asks how to customize system prompts or prompt templates.", owner: "core/prompt/", related: ["skills"] },
	{ name: "tui", title: "TUI Components", description: "Use when the user asks about the terminal UI components or how rendering works.", owner: "core/lib/tui/", related: ["themes", "keybindings"] },
	{ name: "keybindings", title: "Keybindings", description: "Use when the user asks how to view or remap keybindings.", owner: "core/platform/keybindings.ts", related: ["tui"] },
	{ name: "sdk", title: "SDK Integration", description: "Use when the user asks how to embed NanoPencil programmatically (createAgentSession).", owner: "core/runtime/sdk.ts", related: ["extensions", "packages"] },
	{ name: "custom-provider", title: "Custom Providers", description: "Use when the user asks how to add or configure a custom model provider.", owner: "core/lib/ai/", related: ["models", "providers"] },
	{ name: "models", title: "Models", description: "Use when the user asks how to add, select, or configure models.", owner: "core/model-registry.ts", related: ["custom-provider", "providers"] },
	{ name: "packages", title: "Packages", description: "Use when the user asks about the published @pencil-agent/* packages.", owner: "packages/", related: ["sdk", "extensions"] },
	{ name: "providers", title: "Providers", description: "Use when the user hits 'no models available' or asks how to configure providers and API keys.", owner: "core/model-registry.ts", related: ["custom-provider", "models"] },
];

function render(doc: FeatureDoc): string {
	const related = (doc.related ?? []).map((r) => `[[${r}]]`).join(" ") || "TODO";
	return `---
name: ${doc.name}
description: ${doc.description}
surface: TODO  # user entry points: /command, --flag, config key, file location
owner: ${doc.owner}  # DIP P2 anchor — read its AGENT.md member list to find code
status: draft
---

# ${doc.title}

> TODO: one line — what this feature does for the user.

## When to use
TODO: the user intents that should pull this doc (mirrors the frontmatter \`description\`).

## Usage
TODO: commands / flags / config keys / file locations, with one minimal example.

## Behavior & defaults
TODO: default on/off, side effects, opt-in/opt-out.

## Code map → DIP
- Owner: \`${doc.owner}\` — read its DIP **P2 member list** (the nearest \`AGENT.md\`) to locate files.
- Then follow **P3** file headers (WHO / FROM / TO / HERE) to navigate. Do **not** duplicate code paths here.

## Related
${related}
`;
}

function main(): void {
	if (!existsSync(DOCS_DIR)) mkdirSync(DOCS_DIR, { recursive: true });
	let created = 0;
	let skipped = 0;
	for (const doc of FEATURE_DOCS) {
		const target = join(DOCS_DIR, `${doc.name}.md`);
		if (existsSync(target)) {
			skipped++;
			continue;
		}
		writeFileSync(target, render(doc), "utf8");
		created++;
		console.log(`  + docs/${doc.name}.md`);
	}
	console.log(`scaffold-feature-docs: ${created} created, ${skipped} existing (kept).`);
}

main();
