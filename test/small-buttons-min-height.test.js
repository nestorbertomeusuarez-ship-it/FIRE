// The chart's "⤢ Ampliar" button (and its siblings zoomReset/closeBtn, plus the
// per-scenario Cargar/Eliminar buttons) are only ~24px tall on mobile: padding
// 4px + an 11px font gives far less than a comfortable touch target. Give every
// such small button a min-height of 32px.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
assert.ok(styleMatch);
const css = styleMatch[1];

function ruleFor(selectorRegex) {
  const m = css.match(new RegExp(selectorRegex.source + '\\s*\\{([^}]*)\\}'));
  assert.ok(m, 'rule for ' + selectorRegex + ' exists');
  return m[1];
}

const expandRule = ruleFor(/\.zoomReset,\s*\.expandBtn,\s*\.closeBtn/);
assert.match(expandRule, /min-height:\s*32px/, 'the chart tool buttons (Ampliar/zoom/close) must have min-height:32px');

const scenarioBtnRule = ruleFor(/\.scenarioItem button/);
assert.match(scenarioBtnRule, /min-height:\s*32px/, 'the per-scenario Cargar/Eliminar buttons must have min-height:32px');

console.log('small buttons min-height: OK');
