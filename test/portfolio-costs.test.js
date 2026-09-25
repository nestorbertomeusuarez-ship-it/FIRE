const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const core = require('../simulation-core.js');
const html = fs.readFileSync('index.html', 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const source = inline.slice(0, inline.indexOf('// The simulation runs off the main thread')) + '\nglobalThis.__test={simulate,DEFAULTS};';
const context = { console, Math, Float64Array, Int32Array, Uint8Array, Date, Infinity, NavlogCore: core, document:{getElementById:()=>null}, globalThis:null };
context.globalThis = context; vm.createContext(context); vm.runInContext(source, context, { timeout: 1000 });
const { simulate, DEFAULTS } = context.__test;
const p50 = p => simulate(p, 6).series.map(x => x.p50);
const costs = { feeCash: 1, feeCons: 1, feeEq: 1.5, feeBtc: 2, feeGold: 1, feeProv: 1 };

test('portfolio costs are PRO controls: hidden values never change a non-PRO run', () => {
  const base = { ...DEFAULTS, seed: 3, proMode: false };
  assert.deepEqual(p50({ ...base, ...costs }), p50(base));
});

test('portfolio costs reduce wealth in PRO mode', () => {
  const base = { ...DEFAULTS, seed: 3, proMode: true };
  const withCosts = p50({ ...base, ...costs }), without = p50(base);
  assert.ok(withCosts[withCosts.length - 1] < without[without.length - 1]);
});

test('every portfolio-cost slider has its own explanation', () => {
  for (const id of ['feeCash', 'feeCons', 'feeEq', 'feeBtc', 'feeGold', 'feeProv']) {
    const block = html.slice(html.indexOf(`<label for="${id}">`), html.indexOf(`id="${id}" min=`));
    assert.match(block, /class="hint"/, `${id} needs a hint`);
  }
});

test('the backtest fee note is part of the backtest render, not a one-off append', () => {
  assert.equal(/function appendHistoricalFeeNote/.test(html), false);
  const render = html.slice(html.indexOf('function renderHistoricalBacktest'), html.indexOf('function renderHistoricalBacktest') + 2500);
  assert.match(render, /Coste de renta variable aplicado/);
});
