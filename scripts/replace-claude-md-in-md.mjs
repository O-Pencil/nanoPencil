import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SKIP = new Set(["node_modules", "dist", ".git"]);

function walk(dir, out) {
	let names;
	try {
		names = readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const ent of names) {
		if (SKIP.has(ent.name)) continue;
		const p = join(dir, ent.name);
		if (ent.isDirectory()) walk(p, out);
		else if (ent.isFile() && ent.name.endsWith(".md")) out.push(p);
	}
}

const root = process.cwd();
const files = [];
walk(root, files);
let n = 0;
for (const f of files) {
	let s;
	try {
		s = readFileSync(f, "utf8");
	} catch {
		continue;
	}
	if (!s.includes("CLAUDE.md")) continue;
	writeFileSync(f, s.replaceAll("CLAUDE.md", "AGENT.md"), "utf8");
	n++;
}
console.error(`Updated ${n} markdown files.`);
