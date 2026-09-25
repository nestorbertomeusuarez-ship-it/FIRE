// Print CSS bug: the print stylesheet hides `.controls`, a class that doesn't
// exist anywhere in the markup, so the real interactive parameters section
// (#parametros, 106 sliders) prints in full instead of being suppressed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const printBlocks = [...html.matchAll(/@media print\{([\s\S]*?)\}\s*(?=@media|<\/style>)/g)].map(m => m[0]);
const printCss = printBlocks.join('\n');

assert.ok(!/\.controls\b/.test(printCss), 'the print stylesheet must not reference the non-existent .controls class');
assert.ok(/#parametros\s*\{[^}]*display:\s*none\s*!important/.test(printCss) || /#parametros[^{]*,[^{]*\{[^}]*display:\s*none\s*!important/.test(printCss),
  '#parametros (106 interactive sliders) must be hidden when printing');

// #printAssumptions must stay visible in print (it is the printed summary
// that replaces the raw sliders).
assert.ok(!new RegExp('#printAssumptions[^{,]*\\{[^}]*display:\\s*none').test(printCss),
  '#printAssumptions must remain visible in print');
assert.ok(/\.printOnly\{display:block!important\}/.test(html), '.printOnly is force-shown in print');

console.log('print css: OK');
