const fs = require('fs');
const f = 'scripts/.buildnum';
let n = 1;
try { n = (parseInt(fs.readFileSync(f, 'utf8'), 10) || 0) + 1; } catch (e) { n = 1; }
fs.writeFileSync(f, String(n));
let html = fs.readFileSync('index.html', 'utf8');
const next = `<script type="module" src="boot.js?v=${n}"><\/script>`;
if (/<script type="module" src="boot\.js\?v=\d+"><\/script>/.test(html)) {
  html = html.replace(/<script type="module" src="boot\.js\?v=\d+"><\/script>/, next);
} else {
  throw new Error('script tag not found');
}
// Keep the footer build stamp in sync so a reload visibly proves the new build.
if (/build \d+/.test(html)) {
  html = html.replace(/build \d+/, 'build ' + n);
}
fs.writeFileSync('index.html', html);
console.log('stamped build', n);
