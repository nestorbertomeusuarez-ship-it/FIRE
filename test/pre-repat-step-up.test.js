// Selling and rebuying while still a UAE resident (no capital-gains tax there, and Spain does not
// tax a non-resident's foreign gains) resets the cost basis, so Spain only taxes gains made after
// the return. The model applies it at the start of Spanish tax residency.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const core = require('../simulation-core.js');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const source = inline.slice(0, inline.indexOf('// Renderer shared by the inline chart')) + '\nglobalThis.__t={simulate,DEFAULTS};';
const context = { console, Math, Float64Array, Int32Array, Uint8Array, Date, Infinity, NavlogCore: core, document: { getElementById: () => null }, globalThis: null };
context.globalThis = context; vm.createContext(context); vm.runInContext(source, context, { timeout: 5000 });
const { simulate, DEFAULTS } = context.__t;

test('preRepatStepUp: checkbox inside the tax controls, on by default, with a hint', () => {
  assert.equal(DEFAULTS.preRepatStepUp, true);
  const fiscalStart = html.indexOf('<div class="fiscal-only">');
  const at = html.indexOf('<input type="checkbox" id="preRepatStepUp">');
  assert.ok(at > fiscalStart && fiscalStart > 0, 'inside the fiscal-only block');
  assert.match(html.slice(at, at + 1200), /class="hint"/);
});

// Retired from day one; gains build up during 8 non-resident years, then Spanish tax applies.
const retiree = { ...DEFAULTS, seed: 5, startEq: 3000000, startBtc: 0, horizonAge: 70, childCount: 0, healthcareAnnual: 0,
  fiscalOn: true, taxOn: true, taxRepatDelay: 8, profitShareWeeks: 0 };
const last = r => r.series[r.series.length - 1].p50;

test('resetting the basis before residency lowers the tax paid, so wealth ends higher', () => {
  const on = simulate({ ...retiree, preRepatStepUp: true }, 300), off = simulate({ ...retiree, preRepatStepUp: false }, 300);
  assert.ok(last(on) > last(off));
});

test('without Spanish taxes the option changes nothing', () => {
  const noTax = { ...retiree, fiscalOn: false };
  assert.equal(last(simulate({ ...noTax, preRepatStepUp: true }, 300)), last(simulate({ ...noTax, preRepatStepUp: false }, 300)));
});
