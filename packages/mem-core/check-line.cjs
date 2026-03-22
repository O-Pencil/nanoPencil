const fs = require('fs');
const path = require('path');

const filePath = 'src/full-insights-html.ts';
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

console.log('Line 66:');
console.log('Length:', lines[65].length);
console.log('Content:', JSON.stringify(lines[65]));
console.log('Last 10 chars:');
for (let i = Math.max(0, lines[65].length - 10); i < lines[65].length; i++) {
  const c = lines[65][i];
  console.log(`  ${i}: '${c}' (${c.charCodeAt(0)})`);
}
