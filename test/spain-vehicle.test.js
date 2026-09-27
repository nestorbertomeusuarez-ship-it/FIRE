// In Spain, switching between investment funds (traspaso, art. 94 LIRPF) is tax-free, but selling
// ETFs, bitcoin ETPs or gold ETCs is a taxable disposal. The Prime Harvesting sweep and the glide
// path rebalance move money between buckets: with funds the equity/bond legs are traspasos; with
// ETFs they are taxable sales; BTC and gold legs are always taxable.
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
const last = r => r.series[r.series.length - 1].p50;

test('etfInSpain: checkbox inside the tax controls, off by default (funds), with a hint', () => {
  assert.equal(DEFAULTS.etfInSpain, false);
  const fiscalStart = html.indexOf('<div class="fiscal-only">');
  const at = html.indexOf('<input type="checkbox" id="etfInSpain">');
  assert.ok(fiscalStart > 0 && at > fiscalStart);
  assert.match(html.slice(at, at + 1400), /class="hint"/);
});

// Retired from day one, taxed at once, no basis reset, strong steady equity growth so the
// Prime Harvesting sweep fires every year on large gains.
const sweep = { ...DEFAULTS, seed: 5, startEq: 3000000, startBtc: 0, ret: 8, vol: 0, horizonAge: 60, childCount: 0, healthcareAnnual: 0,
  profitShareWeeks: 0, fiscalOn: true, taxOn: true, taxRepatDelay: 0, preRepatStepUp: false, wdStrategy: 0, phOn: true,
  allocCash: 0, allocBonds: 0, allocEquities: 100, feeEq: 0 };

test('with ETFs the Prime Harvesting sweep pays tax, with funds it does not', () => {
  assert.ok(last(simulate({ ...sweep, etfInSpain: true }, 3)) < last(simulate({ ...sweep, etfInSpain: false }, 3)));
});

test('without Spanish taxes the vehicle changes nothing', () => {
  const noTax = { ...sweep, fiscalOn: false };
  assert.equal(last(simulate({ ...noTax, etfInSpain: true }, 3)), last(simulate({ ...noTax, etfInSpain: false }, 3)));
});

test('glide-path sales of bitcoin are taxed even with funds', () => {
  // Near-zero spend, no mortgage and no Burriana sale: nothing else realises a taxable gain, so
  // any tax difference comes from the rebalance.
  const glide = { ...sweep, gasto: 1, hip: 0, burr: 0, brOn: false, phOn: false, startBtc: 1000000, btcRet: 10, btcVol: 0, glideOn: true, glideTargetYear: 2030, glideStartYears: 3, glideEqFloor: 50 };
  const withBtcGain = last(simulate({ ...glide, fiscalOn: true }, 3)), untaxed = last(simulate({ ...glide, fiscalOn: false }, 3));
  assert.ok(withBtcGain < untaxed - 1000, 'selling BTC to rebalance realises a taxable gain');
});
