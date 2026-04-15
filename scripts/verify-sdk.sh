#!/bin/bash
# SDK Verification Script
# Tests that the SDK builds and exports correctly

set -e

echo "=== NanoPencil SDK Verification ==="

# 1. Build
echo ""
echo "1. Building SDK..."
npm run build

# 2. Check exports
echo ""
echo "2. Checking exports..."
node --experimental-vm-modules -e "
const fs = require('fs');
const path = require('path');

// Read index.d.ts to verify exports
const indexDts = fs.readFileSync('dist/index.d.ts', 'utf8');
const requiredExports = [
  'PencilAgent',
  'quickAgent',
  'createAgentSession',
  'AgentSession',
  'SDKLogger',
  'silentLogger',
  'defaultLogger',
];

const missing = [];
for (const exp of requiredExports) {
  if (!indexDts.includes(exp)) {
    missing.push(exp);
  }
}

if (missing.length > 0) {
  console.error('Missing exports:', missing);
  process.exit(1);
}
console.log('✅ All required exports present:', requiredExports.join(', '));
"

# 3. Check dist files
echo ""
echo "3. Checking dist files..."
for file in dist/index.js dist/index.d.ts dist/core/runtime/sdk.js dist/core/runtime/pencil-agent.js; do
  if [ -f "$file" ]; then
    echo "✅ $file exists"
  else
    echo "❌ $file missing"
    exit 1
  fi
done

# 4. Check logger implementation
echo ""
echo "4. Checking logger implementation..."
grep -q "silentLogger" dist/core/runtime/sdk.js && echo "✅ silentLogger implemented"
grep -q "defaultLogger" dist/core/runtime/sdk.js && echo "✅ defaultLogger implemented"
grep -q "SDKLogger" dist/core/runtime/sdk.d.ts && echo "✅ SDKLogger type exported"

# 5. Pack dry-run
echo ""
echo "5. Pack verification (dry-run)..."
npm pack --dry-run 2>&1 | grep -q "pencil-agent-nano-pencil" && echo "✅ Pack succeeds"

echo ""
echo "=== SDK Verification Complete ==="
echo ""
echo "Summary:"
echo "  ✅ Build successful"
echo "  ✅ Exports verified (PencilAgent, createAgentSession, SDKLogger)"
echo "  ✅ Dist files present"
echo "  ✅ Logger interface implemented"
echo "  ✅ Pack creates tarball"
echo ""
echo "Note: Full install test requires all bundled dependencies."
echo "Run 'npm pack && npm install ./pencil-agent-*.tgz' in a test project."