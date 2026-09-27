// Default withdrawal plan: Guyton-Klinger with Prime Harvesting. On the default household it cut
// post-FIRE ruin from ~19.5 % (fixed SWR) to ~1.6 %, at the cost of spending cuts in bad years.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const core = require('../simulation-core.js');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const source = inline.slice(0, inline.indexOf('// Renderer shared by the inline chart')) + '\nglobalThis.__t={DEFAULTS};';
const context = { console, Math, Float64Array, Int32Array, Uint8Array, Date, Infinity, NavlogCore: core, document: { getElementById: () => null }, globalThis: null };
context.globalThis = context; vm.createContext(context); vm.runInContext(source, context, { timeout: 5000 });
const { DEFAULTS } = context.__t;

test('the default withdrawal strategy is Guyton-Klinger with Prime Harvesting', () => {
  assert.equal(DEFAULTS.wdStrategy, 1);
  assert.equal(DEFAULTS.phOn, true);
});

test('the default retirement spend is 48,000 EUR a year', () => {
  assert.equal(DEFAULTS.gasto, 48000);
});

test('the default planning horizon is age 95', () => {
  assert.equal(DEFAULTS.horizonAge, 95);
});
