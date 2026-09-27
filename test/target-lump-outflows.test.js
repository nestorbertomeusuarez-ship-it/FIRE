// One-off payments the user enters (e.g. a mortgage prepayment, a car) are known future outflows,
// so the FIRE target must fund the ones still ahead, like children and the mortgage. One-off
// inflows (inheritance, a sale) are not counted, so the plan never relies on money that may not come.
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
const base = { ...DEFAULTS, seed: 1 };

test('a future one-off payment raises the reported target by its amount', () => {
  const withPayment = simulate({ ...base, lumpSums: JSON.stringify([{ year: 2040, month: 1, amount: -100000 }]) }, 5);
  assert.ok(Math.abs(withPayment.target - simulate(base, 5).target - 100000) < 1e-6);
});

test('a one-off inflow does not lower the target', () => {
  const withInflow = simulate({ ...base, lumpSums: JSON.stringify([{ year: 2040, month: 1, amount: 100000 }]) }, 5);
  assert.equal(withInflow.target, simulate(base, 5).target);
});

test('a payment scheduled after the horizon is ignored', () => {
  const late = simulate({ ...base, horizonAge: 60, lumpSums: JSON.stringify([{ year: 2080, month: 1, amount: -100000 }]) }, 5);
  assert.equal(late.target, simulate({ ...base, horizonAge: 60 }, 5).target);
});
