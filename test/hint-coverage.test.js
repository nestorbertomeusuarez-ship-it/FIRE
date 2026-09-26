// Every parameter control inside #parametros should carry its own explanation, in the
// same structural spot the rest of the section already uses: a <p class="hint"> living
// inside the control's own .ctrl/.toggle block, or (for a checkbox) as the immediate next
// sibling element right after its .toggle block closes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/\r\n/g, '\n');

const secStart = html.indexOf('<section id="parametros">');
assert.notEqual(secStart, -1, '#parametros section exists');
const secEnd = html.indexOf('</section>', secStart);
const section = html.slice(secStart, secEnd);

// Parses every <div ...>...</div> in the section into a flat list of blocks, each carrying
// its class attribute and the [contentStart, contentEnd) span of its own inner HTML, plus
// the index right after its closing </div> tag (for the toggle-sibling check below).
function parseDivBlocks(markup) {
  const tagRe = /<div\b([^>]*)>|<\/div>/g;
  const stack = [];
  const blocks = [];
  let m;
  while ((m = tagRe.exec(markup))) {
    if (m[0].startsWith('<div')) {
      const classAttr = (m[1].match(/class="([^"]*)"/) || [, ''])[1];
      stack.push({ classAttr, contentStart: tagRe.lastIndex });
    } else {
      const top = stack.pop();
      if (top) blocks.push({ classAttr: top.classAttr, contentStart: top.contentStart, contentEnd: m.index, closeTagEnd: tagRe.lastIndex });
    }
  }
  assert.equal(stack.length, 0, 'every <div> in #parametros is closed');
  return blocks;
}

const blocks = parseDivBlocks(section);
const isCtrlOrToggle = (classAttr) => /\b(ctrl|toggle)\b/.test(classAttr);

// The smallest .ctrl/.toggle block that contains a given index (deepest match wins, since
// blocks can nest — e.g. the "calcSecondsWrap" .ctrl living inside .actions).
function enclosingCtrlOrToggle(idx) {
  let best = null;
  for (const b of blocks) {
    if (isCtrlOrToggle(b.classAttr) && b.contentStart <= idx && idx < b.contentEnd) {
      if (!best || b.contentStart > best.contentStart) best = b;
    }
  }
  return best;
}

function hasOwnHint(block) {
  return /<p class="hint"/.test(section.slice(block.contentStart, block.contentEnd));
}

function hasToggleSiblingHint(block) {
  if (!/\btoggle\b/.test(block.classAttr)) return false;
  return /^\s*<p class="hint"/.test(section.slice(block.closeTagEnd));
}

// Controls intentionally left out of this coverage rule, because they already carry an
// adequate explanation through a different, pre-existing pattern that predates this test:
// - proMode / seed / calcPrecision: meta/run controls (mode switch, RNG seed, precision
//   preset), not model parameters documented one-by-one like the rest of the section.
// - hipEnd: explained by the group-level <p class="hint"> that immediately follows its own
//   .ctrl block (a sibling of a .ctrl, not of a .toggle), paired with "hip" right above it.
// - reCountsFire: its effect is already spelled out inline by the neighboring "reAppr" hint
//   ("Solo cuenta para tu capital FIRE si marcas «Contar el inmueble como capital FIRE»").
const PRE_EXISTING_EXCEPTIONS = new Set(['proMode', 'seed', 'calcPrecision', 'hipEnd', 'reCountsFire']);

const controls = Array.from(section.matchAll(/<(input|select)\b[^>]*\bid="([^"]+)"/g), (m) => ({ id: m[2], idx: m.index }));

test('#parametros contains the expected number of parameter controls', () => {
  assert.equal(controls.length, 123, 'control count in #parametros (update this alongside PRE_EXISTING_EXCEPTIONS if it changes)');
});

test('every input/select in #parametros has its own hint, in its .ctrl/.toggle block or as a toggle\'s immediate sibling', () => {
  const failures = [];
  for (const { id, idx } of controls) {
    if (PRE_EXISTING_EXCEPTIONS.has(id)) continue;
    const block = enclosingCtrlOrToggle(idx);
    if (!block) { failures.push(id + ': not inside a .ctrl/.toggle block'); continue; }
    if (!hasOwnHint(block) && !hasToggleSiblingHint(block)) failures.push(id + ': no .hint in its block and no toggle-sibling .hint');
  }
  assert.deepEqual(failures, [], 'controls missing their own hint:\n' + failures.join('\n'));
});
