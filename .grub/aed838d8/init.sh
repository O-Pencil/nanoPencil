#!/usr/bin/env bash
set -euo pipefail

# Grub harness startup (get-bearings protocol). Override the smoke block below
# with project-specific commands that prove the app still boots end-to-end.

echo "=== grub bearings ==="
pwd
echo "--- recent commits ---"
git log --oneline -n 20 2>/dev/null || true
echo "--- working tree ---"
git status --short 2>/dev/null || true
echo "--- progress tail ---"
tail -n 40 "/Users/cunyu666/Dev/nanoPencil/.grub/aed838d8/progress-log.md" 2>/dev/null || true
echo "--- feature progress ---"
node -e "try{const l=require("/Users/cunyu666/Dev/nanoPencil/.grub/aed838d8/feature-list.json");const p=l.features.filter(f=>f.passes).length;console.log(p+'/'+l.features.length+' passing');}catch(e){console.log('feature-list.json unavailable');}" 2>/dev/null || true
echo "--- project smoke (override below) ---"
# TODO: project-specific smoke command (tests, curl, tsc --noEmit, etc.)
