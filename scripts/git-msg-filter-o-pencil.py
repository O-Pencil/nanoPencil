#!/usr/bin/env python3
"""stdin: git commit message; stdout: normalized message (no Claude tooling attribution)."""
import re
import sys

data = sys.stdin.read()

# Co-authored trailer from legacy tooling
data = re.sub(
	r"Co-Authored-By: Claude Opus [\d.]+ <noreply@anthropic\.com>",
	"Co-Authored-By: o-pencil-agent <noreply@o-pencil.org>",
	data,
)

# Conventional commit scope
data = data.replace("docs(claude):", "docs(agent):")

# Buddy/docs commit body: line break may be \n with or without indent on "references"
data = re.sub(
	r"Replace claude-specific\s+references with agent-agnostic naming in docs and changelog\.",
	"Align docs and changelog\nreferences with the AGENT naming convention.",
	data,
	flags=re.DOTALL,
)

# Before bulk-renaming CLAUDE.md → AGENT.md, fix the migration sentence that already names both
data = data.replace(
	"Rename CLAUDE.md to AGENT.md for agent\n",
	"Use AGENT.md for agent\n",
)

# Historical path references in commit messages
data = data.replace("CLAUDE.md", "AGENT.md")

if __name__ == "__main__":
	sys.stdout.write(data)
