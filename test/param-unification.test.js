// Regression tests for the parameter-unification cleanup:
//  1) bonds/"cartera conservadora" (consRet/consVol) are honoured regardless of proMode.
//  2) the mortgage balance amortizes to 0 exactly at hipEnd (derived, not a separate constant).
//  3) the `nur` nursery control is gone; its default cash flow is folded into the generic
//     childAnnual/childStartAge/childEndAge mechanism, with a legacy-scenario migration path.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const core = require('../simulation-core.js');
const html = fs.readFileSync('index.html', 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const source = inline.slice(0, inline.indexOf('// The simulation runs off the main thread')) + '\nglobalThis.__test={simulate,DEFAULTS};';
const context = { console, Math, Float64Array, Int32Array, Uint8Array, Date, Infinity, NavlogCore: core, document: { getElementById: () => null }, globalThis: null };
context.globalThis = context; vm.createContext(context); vm.runInContext(source, context, { timeout: 1000 });
const { simulate, DEFAULTS } = context.__test;

test('nur is gone from DEFAULTS; the generic child-cost mechanism carries its default value', () => {
  assert.equal('nur' in DEFAULTS, false, 'the nur key is removed from DEFAULTS');
  assert.equal(DEFAULTS.childAnnual, 10000, 'childAnnual default reproduces the old nur amount (€10,000/año)');
  assert.equal(DEFAULTS.childStartAge, 29, 'childStartAge approximates the old nur onset (Jun-2027)');
  assert.equal(DEFAULTS.childEndAge, 32, 'childEndAge approximates the old nur cutoff (Jan-2031)');
});

test('DEFAULTS still simulate without throwing once nur is removed', () => {
  assert.doesNotThrow(() => simulate({ ...DEFAULTS, seed: 1 }, 2));
});

test('consRet/consVol ("cartera conservadora") drive the bonds bucket even with PRO mode off', () => {
  const base = {
    ...DEFAULTS, seed: 11, proMode: false, ret: 0, vol: 0, btcRet: 0, btcVol: 0, cashRet: 0, cashVol: 0,
    startEq: 500000, startBtc: 0, allocCash: 0, allocBonds: 100, allocEquities: 0,
    vida: 0, hip: 0, childAnnual: 0, brOn: false, burr: 0, salFO: 0, salCA: 0, basicFO: 0, basicCA: 0,
    provOn: false, gasto: 1000000, swr: 4, consVol: 0,
  };
  const low = simulate({ ...base, consRet: 0 }, 4).series[0].p50;
  const high = simulate({ ...base, consRet: 4 }, 4).series[0].p50;
  assert.ok(high > low, 'a higher consRet grows the 100 %-bonds portfolio more, whether or not PRO mode is on');
});

test('the mortgage balance amortizes linearly to 0 by hipEnd, derived from hipEnd itself', () => {
  const base = {
    ...DEFAULTS, seed: 5, proMode: true, ret: 0, vol: 0, btcRet: 0, btcVol: 0, cashRet: 0, cashVol: 0, consRet: 0, consVol: 0,
    startEq: 2000000, startBtc: 0, allocCash: 0, allocBonds: 0, allocEquities: 100,
    vida: 0, hip: 0, childAnnual: 0, brOn: false, burr: 0, salFO: 0, salCA: 0, basicFO: 0, basicCA: 0, provOn: false,
    gasto: 1, swr: 4, wealthTaxOn: true, wealthExempt: 0, wealthRate: 1, wealthBonusPct: 0,
    hipEnd: 2036, mortgageBalance: 300000, ageNow: 28, horizonAge: 40,
  };
  const withDebt = simulate(base, 4).series;
  const withoutDebt = simulate({ ...base, mortgageBalance: 0 }, 4).series;
  const years = withDebt.map(x => x.year);
  const gapAt = year => withDebt[years.indexOf(year)].p50 - withoutDebt[years.indexOf(year)].p50;
  // While the mortgage is still outstanding, the wealth-tax saving it buys (lower taxable net
  // worth) keeps compounding year over year.
  assert.ok(gapAt(2034) > gapAt(2033), 'the wealth-tax saving from the outstanding mortgage keeps growing before hipEnd');
  // Once the balance is fully amortized (derived from hipEnd, not a separate constant), the
  // saving stops growing and decays back instead of continuing to widen.
  assert.ok(gapAt(2037) < gapAt(2035), 'once the mortgage amortizes at hipEnd, the wealth-tax saving stops growing and decays back');
});

test('migrateLegacyChildParams folds a legacy nur param into childAnnual, with the equivalent default ages', () => {
  const migrated = core.migrateLegacyChildParams({ nur: 8000, gasto: 60000 });
  assert.deepEqual(migrated, { gasto: 60000, childAnnual: 8000, childStartAge: 29, childEndAge: 32 });
});

test('migrateLegacyChildParams drops a stray nur key without overriding an already-present childAnnual', () => {
  const migrated = core.migrateLegacyChildParams({ nur: 8000, childAnnual: 3000, childStartAge: 30, childEndAge: 34 });
  assert.deepEqual(migrated, { childAnnual: 3000, childStartAge: 30, childEndAge: 34 });
});

test('migrateLegacyChildParams is a no-op when there is no legacy nur key', () => {
  const params = { childAnnual: 3000 };
  assert.deepEqual(core.migrateLegacyChildParams(params), params);
});

test('migrateLegacyChildParams passes through non-object input unchanged', () => {
  assert.equal(core.migrateLegacyChildParams(null), null);
  assert.equal(core.migrateLegacyChildParams(undefined), undefined);
  const arr = [1, 2];
  assert.equal(core.migrateLegacyChildParams(arr), arr);
});
