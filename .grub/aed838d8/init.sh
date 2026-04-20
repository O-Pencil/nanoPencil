#!/usr/bin/env bash
set -euo pipefail

# Grub harness startup (get-bearings protocol)
echo "=== grub bearings ==="
pwd
echo "--- recent commits ---"
git log --oneline -n 20 2>/dev/null || true
echo "--- working tree ---"
git status --short 2>/dev/null || true
echo "--- progress tail ---"
tail -n 40 "/Users/cunyu666/Dev/nanoPencil/.grub/aed838d8/progress-log.md" 2>/dev/null || true
echo "--- feature progress ---"
node -e "try{const l=require('/Users/cunyu666/Dev/nanoPencil/.grub/aed838d8/feature-list.json');const p=l.features.filter(f=>f.passes).length;console.log(p+'/'+l.features.length+' passing');}catch(e){console.log('feature-list.json unavailable');}" 2>/dev/null || true
echo "=== project smoke ==="

# Set project root
PROJECT_ROOT="/Users/cunyu666/Dev/nanoPencil"
cd "$PROJECT_ROOT"

# Project-specific smoke: TypeScript compile check
npx tsc --noEmit --project tsconfig.json 2>&1 | head -20 || true

# Smoke: mem-core dist exists
if [ -d "packages/mem-core/dist" ]; then
  echo "✓ mem-core dist exists"
else
  echo "✗ mem-core dist missing"
fi

# Smoke: presence extension exists
if [ -f "dist/extensions/defaults/presence/index.js" ]; then
  echo "✓ presence extension built"
else
  echo "✗ presence extension not built"
fi

# Smoke: run presence test (quick check)
echo "--- presence test quick run ---"
node --test --import tsx test/presence-opening.test.ts 2>&1 | tail -10 &
PID=$!
sleep 15 && kill $PID 2>/dev/null || wait $PID 2>/dev/null || true

echo "=== smoke complete ==="
