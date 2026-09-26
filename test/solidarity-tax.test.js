const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const core = require('../simulation-core.js');

test('solidarity tax (ITSGF): 0 % on the first 3 M€ of base, then 1.7 / 2.1 / 3.5 %', () => {
  assert.equal(core.solidarityWealthTax(3700000), 0, '3.7 M€ net wealth = 3 M€ base after the 700 k€ exemption');
  assert.ok(Math.abs(core.solidarityWealthTax(4700000) - 17000) < 0.01, '1 M€ into the 1.7 % bracket');
  const atTop = core.solidarityWealthTax(700000 + 5347998.03);
  assert.ok(Math.abs(atTop - 2347998.03 * 0.017) < 0.01);
  assert.ok(Math.abs(core.solidarityWealthTax(700000 + 12695996.06) - (2347998.03 * 0.017 + 5347998.03 * 0.021 + 2000000 * 0.035)) < 0.05);
});

test('a 100 % regional bonus does not remove the solidarity tax', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
  const source = inline.slice(0, inline.indexOf('// The simulation runs off the main thread')) + '\nglobalThis.__t={simulate,DEFAULTS};';
  const c = { console, Math, Float64Array, Int32Array, Uint8Array, Date, Infinity, NavlogCore: core, document: { getElementById: () => null }, globalThis: null };
  c.globalThis = c; vm.createContext(c); vm.runInContext(source, c, { timeout: 1000 });
  const { simulate, DEFAULTS } = c.__t;
  const rich = { ...DEFAULTS, seed: 1, proMode: true, taxOn: true, taxRepatDelay: 0, startEq: 8000000, startBtc: 0, allocCash: 0, allocBonds: 0, allocEquities: 100,
    ret: 0, vol: 0, gasto: 1, burr: 0, brOn: false, childAnnual: 0, vida: 0, hip: 0, wealthTaxOn: true, wealthExempt: 700000, wealthRate: 0.5 };
  const p50 = p => simulate(p, 2).series.map(x => x.p50);
  const madrid = p50({ ...rich, wealthBonusPct: 100 });
  const noTax = p50({ ...rich, wealthTaxOn: false });
  assert.ok(madrid[madrid.length - 1] < noTax[noTax.length - 1] - 1000, 'wealth above 3.7 M€ still pays the solidarity tax with a 100 % bonus');
});
