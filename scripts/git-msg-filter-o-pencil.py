#!/usr/bin/env python3
"""stdin: git commit message; stdout: message with Claude co-author line replaced."""
import sys

OLD = "Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
NEW = "Co-Authored-By: o-pencil-agent <noreply@o-pencil.org>"

if __name__ == "__main__":
	data = sys.stdin.read()
	sys.stdout.write(data.replace(OLD, NEW))
