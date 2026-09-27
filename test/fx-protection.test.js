// Emirates Exchange Rate Protection (Candidate Information - Pilots, 11.0): 50 % of basic salary
// is protected against the dirham weakening versus the employee's currency, relative to a
// threshold rate (the average of the last five years, reset every 1 January), up to 15 %.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const core = require('../simulation-core.js');

test('erpTopUpEUR: pays 50 % of basic times the shortfall below the threshold, capped at 15 %', () => {
  assert.equal(core.erpTopUpEUR(30000, 0.25, 0.25), 0, 'at the threshold: nothing');
  assert.equal(core.erpTopUpEUR(30000, 0.27, 0.25), 0, 'dirham stronger: nothing');
  assert.ok(Math.abs(core.erpTopUpEUR(30000, 0.24, 0.25) - 15000 * 0.01) < 1e-9, '4 % weaker: 50 % of basic x 0.01');
  assert.ok(Math.abs(core.erpTopUpEUR(30000, 0.15, 0.25) - 15000 * 0.0375) < 1e-9, '40 % weaker: capped at 15 % of the threshold');
  assert.equal(core.erpTopUpEUR(30000, NaN, 0.25), 0);
});

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const source = inline.slice(0, inline.indexOf('// Renderer shared by the inline chart')) + '\nglobalThis.__t={simulate,DEFAULTS};';
const context = { console, Math, Float64Array, Int32Array, Uint8Array, Date, Infinity, NavlogCore: core, document: { getElementById: () => null }, globalThis: null };
context.globalThis = context; vm.createContext(context); vm.runInContext(source, context, { timeout: 5000 });
const { simulate, DEFAULTS } = context.__t;

test('erpOn: checkbox, on by default, with a hint', () => {
  assert.equal(DEFAULTS.erpOn, true);
  assert.match(html, /<input type="checkbox" id="erpOn">/);
  const block = html.slice(html.indexOf('id="erpOn"'), html.indexOf('id="erpOn"') + 900);
  assert.match(block, /class="hint"/);
});

test('ERP only matters with a random exchange rate, and then it helps', () => {
  const base = { ...DEFAULTS, seed: 9, horizonAge: 60 };
  const med = r => { const s = Array.from(r.fireMonthAll).filter(m => m >= 0).sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const last = r => r.series[r.series.length - 1].p50;
  assert.equal(last(simulate({ ...base, erpOn: true }, 300)), last(simulate({ ...base, erpOn: false }, 300)), 'fixed FX: no effect');
  const vol = { ...base, fxVolOn: true, fxVol: 12 };
  const on = simulate({ ...vol, erpOn: true }, 300), off = simulate({ ...vol, erpOn: false }, 300);
  assert.ok(med(on) <= med(off), 'protection never delays the median FIRE month');
  assert.notEqual(last(on), last(off), 'and it changes outcomes when the dirham moves');
});
