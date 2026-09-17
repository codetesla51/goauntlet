// scripts/check-handlers.cjs — every onclick="fn(" in index.html must be
// exposed on window by src/boot.ts (modules aren't global scope).
// Run: node scripts/check-handlers.cjs (part of npm test)
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const used = new Set();
const re = /onclick="([A-Za-z_]\w*)\s*\(/g;
let m;
while ((m = re.exec(html)) !== null) used.add(m[1]);

const boot = fs.readFileSync(path.join(root, 'src', 'boot.ts'), 'utf8');
const block = boot.match(/Object\.assign\(window as any, \{([\s\S]*?)\}\);/);
if (!block) {
  console.error('FAIL window export block not found in src/boot.ts');
  process.exit(1);
}
const exposed = new Set(block[1].match(/[A-Za-z_]\w*/g));

const missing = [...used].filter((fn) => !exposed.has(fn));
if (missing.length) {
  console.error('FAIL inline handlers missing from window: ' + missing.join(', '));
  process.exit(1);
}
console.log('ok - all ' + used.size + ' inline handlers exposed on window');

// Zone/player ids referenced by the flow engine must exist in index.html.
const zoneIds = new Set();
const srcAll = fs.readdirSync(path.join(root, 'src')).filter((f) => f.endsWith('.ts'))
  .map((f) => fs.readFileSync(path.join(root, 'src', f), 'utf8')).join('\n');
const zm = srcAll.matchAll(/(?:zone|picker|player|list): '(\w+)'/g);
for (const z of zm) zoneIds.add(z[1]);
const missingIds = [...zoneIds].filter((id) => !html.includes('id="' + id + '"'));
if (missingIds.length) {
  console.error('FAIL zone ids missing from index.html: ' + missingIds.join(', '));
  process.exit(1);
}
console.log('ok - all ' + zoneIds.size + ' zone ids present in index.html');
