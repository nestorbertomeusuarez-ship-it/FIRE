// takeFromBucket accumulates realised gains over the calendar year (progressive savings
// brackets) and the counter resets every January. simulate() is the only public path to
// that closure, so an independent month-by-month model of one deterministic bucket is
// compared with the engine's annual snapshots.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../simulation-core.js');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const source = inline.slice(0, inline.indexOf('// Renderer shared by the inline chart')) + '\nglobalThis.__t={simulate,DEFAULTS};';
const context = { console, Math, Float64Array, Int32Array, Uint8Array, Date, Infinity, NavlogCore: core, document: { getElementById: () => null }, globalThis: null };
context.globalThis = context; vm.createContext(context); vm.runInContext(source, context, { timeout: 5000 });
const { simulate, DEFAULTS } = context.__t;

const params = { ...DEFAULTS, seed: 1, proMode: true, startEq: 400e6, startBtc: 0, ret: 5, vol: 0, btcRet: 0, btcVol: 0, gasto: 12e6, swr: 4,
  vida: 0, hip: 0, childAnnual: 0, brOn: false, burr: 0, provOn: false, startDelay: 0, captDelay: 0, taxOn: true, useIrpfBrackets: true, taxRepatDelay: 0,
  allocCash: 0, allocBonds: 0, allocEquities: 100, horizonAge: 38 };

// Mirrors simulate()'s own year-end snapshot gate: every December, PLUS this
// run's own final month (a partial year for an integer-age horizon, since the
// model always starts in September).
function model(p, months, resetEveryJanuary = true) {
  const monthly = Math.pow(1 + p.ret / 100, 1 / 12) - 1;
  let balance = p.startEq, basis = p.startEq, ytd = 0, maxYtd = 0;
  const snapshotBalances = [];
  for (let i = 0; i < months; i++) {
    const month = ((8 + i) % 12) + 1;
    if (month === 1 && resetEveryJanuary) ytd = 0;
    balance *= 1 + monthly;
    if (i > 0) { // retired at month 0, drawdown from month 1
      const need = p.gasto / 12;
      const fraction = Math.max(0, Math.min(1, 1 - basis / balance));
      const gross = Math.min(balance, core.grossForNetSavings(need, fraction, ytd, balance));
      basis = Math.max(0, basis - basis * (gross / balance));
      balance -= gross; ytd += gross * fraction; maxYtd = Math.max(maxYtd, ytd);
    }
    if (month === 12 || i === months - 1) snapshotBalances.push(balance);
  }
  return { snapshotBalances, maxYtd };
}
const result = simulate(params, 3);
assert.equal(result.fireMonthAll[0], 0, 'retires in the first month');
const expected = model(params, Math.floor((params.horizonAge - params.ageNow) * 12) + 1);
assert.ok(expected.maxYtd > 300000, 'model realises more than 300k of gains in a year, so every bracket is exercised (got ' + Math.round(expected.maxYtd) + ')');
assert.equal(result.series.length, expected.snapshotBalances.length);
result.series.forEach((point, index) => {
  const want = expected.snapshotBalances[index];
  assert.ok(Math.abs(point.p50 - want) <= Math.max(1, want * 1e-9), 'year ' + point.year + ': engine ' + point.p50 + ' vs model ' + want);
});
// The January reset matters: a model that never resets is visibly different, so a missing reset would be caught.
const months = Math.floor((params.horizonAge - params.ageNow) * 12) + 1;
const neverReset = model(params, months, false).snapshotBalances;
assert.ok(Math.abs(neverReset[6] - expected.snapshotBalances[6]) > 10000, 'never resetting the year-to-date gains changes the outcome materially');
assert.ok(Math.abs(result.series[6].p50 - neverReset[6]) > 10000, 'the engine does not behave like a model without the January reset');
console.log('tax accumulation: OK');
