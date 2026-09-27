// Emirates contract (Candidate Information - Pilots, 6.0): "Members receive a cash lump sum
// upon leaving service." The Provident Scheme is paid out in cash the month the household
// actually leaves Emirates (voluntary FIRE, mandatory retirement, or Loss of Licence), while
// still a UAE resident, so Spain never taxes it as income. From that month on it is invested
// like any other surplus cash (alloc.cash/bonds/equities), received untaxed (basis = amount).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const core = require('../simulation-core.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const workerFunction = inline.slice(inline.indexOf('function buildWorkerSource(){'), inline.indexOf('\n// Job manager for the simulation worker'));
const source = inline.slice(0, inline.indexOf('// Renderer shared by the inline chart')) + '\n' + workerFunction
  + '\nglobalThis.__test={simulate,DEFAULTS,buildWorkerSource};';
const context = { console, Math, Float64Array, Int32Array, Uint8Array, Date, Infinity, NavlogCore: core, document: { getElementById: () => null }, globalThis: null };
context.globalThis = context; vm.createContext(context); vm.runInContext(source, context, { timeout: 5000 });
const { simulate, DEFAULTS, buildWorkerSource } = context.__test;

// Deterministic, zero-market-return household whose accumulation is dominated by Provident
// contributions (huge basic salary relative to a thin cash salary, captain promotion never
// reached), so there is a real Provident balance to pay out when it fires.
const base = {
  ...DEFAULTS, seed: 1, fiscalOn: true,
  ret: 0, vol: 0, btcRet: 0, btcVol: 0, consRet: 0, consVol: 0, cashRet: 0, cashVol: 0, goldRet: 0, goldVol: 0,
  startEq: 0, startBtc: 0, startGold: 0,
  allocCash: 0, allocBonds: 0, allocEquities: 100,
  vida: 0, hip: 0, burr: 0, brOn: false,
  childCount: 0, healthcareAnnual: 0, pensionAnnual: 0,
  fx: 1, salG: 0,
  salFO: 120000, salCA: 120000, basicFO: 120000, basicCA: 120000, provCo: 12, provOn: true,
  captY: 2200, // never promoted to captain within the horizon
  gasto: 400000, swr: 4,
  horizonAge: 90,
  feeCash: 0, feeCons: 0, feeEq: 0, feeBtc: 0, feeGold: 0, feeProv: 0, profitShareWeeks: 0,
  debugTrackBuckets: true
};

test('after leaving Emirates the Provident balance is 0 and the invested buckets grew by exactly the paid-out amount', () => {
  const result = simulate({ ...base, taxOn: false }, 2);
  let checked = 0;
  for (let k = 0; k < 2; k++) {
    // Only voluntary-FIRE/mandatory/LOL exits actually run payoutProvident; a path that
    // never retires within the horizon has nothing to check.
    if (result.fireMonthAll[k] < 0) continue;
    checked++;
    assert.ok(result.debug.provPayoutAmt[k] > 0, 'this Provident-accumulating household has a real balance to pay out (path ' + k + ')');
    assert.ok(Math.abs((result.debug.investedAfterExit[k] - result.debug.investedBeforeExit[k]) - result.debug.provPayoutAmt[k]) < 1e-6,
      'the invested buckets (vCash+vCons+vEq) grew by exactly the paid-out Provident amount (path ' + k + ')');
  }
  assert.ok(checked > 0, 'sanity: at least one path actually leaves Emirates in this scenario');
  assert.equal(result.debug.maxVProvAfterExit, 0, 'the Provident balance is 0 from the moment of exit onward, for every path');
});

test('with Spanish taxes on, the Provident payout never triggers a general-income tax (the control was removed)', () => {
  const on = simulate({ ...base, taxOn: true, useIrpfBrackets: true }, 2);
  // No general-income tax exists any more: the worker source (which is assembled from the
  // exact same functions the main thread runs) never references it, so it can never be
  // computed for the Provident payout or anything else.
  const workerSource = buildWorkerSource();
  assert.ok(!workerSource.includes('generalIncomeTax'), 'the worker source never references generalIncomeTax any more');
  // The run itself must simply complete without throwing (no leftover reference to the
  // removed taxRateProv/useRegionalGeneralIrpf/taxRegion controls anywhere in simulate()).
  assert.ok(Number.isFinite(on.series[on.series.length - 1].p50));
});

test('the three removed Provident tax controls are absent from index.html, DEFAULTS and the worker source', () => {
  for (const id of ['taxRateProv', 'useRegionalGeneralIrpf', 'taxRegion']) {
    assert.ok(!html.includes('id="' + id + '"'), '<input id="' + id + '"> no longer exists in index.html');
    assert.ok(!(id in DEFAULTS), id + ' is no longer a DEFAULTS key');
  }
  const workerSource = buildWorkerSource();
  for (const name of ['generalIncomeTax', 'netAfterGeneralIncomeTax', 'grossForNetGeneralIncome', 'providentFireTaxRate', 'providentFirst']) {
    assert.ok(!workerSource.includes(name), 'the worker source no longer references ' + name);
  }
});

test('a legacy scenario with taxRateProv/useRegionalGeneralIrpf/taxRegion still normalizes, dropping those keys', () => {
  const legacyParams = { ageNow: 28, horizonAge: 90, taxRateProv: 19, useRegionalGeneralIrpf: true, taxRegion: 1 };
  const migrated = core.migrateLegacyParams(legacyParams);
  assert.ok(!('taxRateProv' in migrated), 'taxRateProv is dropped by the legacy migration');
  assert.ok(!('useRegionalGeneralIrpf' in migrated), 'useRegionalGeneralIrpf is dropped by the legacy migration');
  assert.ok(!('taxRegion' in migrated), 'taxRegion is dropped by the legacy migration');
  assert.equal(migrated.ageNow, 28, 'unrelated keys survive the migration untouched');

  const legacyScenario = { id: 'sc1', name: 'Legacy', color: '#1F7A4D', visible: true, series: [{ year: 2030, p10: 1, p50: 2, p90: 3 }], target: 100, ageMed: '40', successRate: .8, params: legacyParams };
  const normalized = core.normalizeScenarios([legacyScenario], ['ageNow', 'horizonAge'], ['#1F7A4D']);
  assert.equal(normalized.length, 1, 'the legacy scenario still imports successfully');
  assert.ok(!('taxRateProv' in normalized[0].params), 'normalizeScenarios also drops taxRateProv via the legacy migration');
});

test('the FIRE target counts the Provident at full value: taxOn and taxOff reach FIRE the same month', () => {
  const off = simulate({ ...base, taxOn: false }, 2);
  const on = simulate({ ...base, taxOn: true }, 2);
  assert.deepEqual(Array.from(on.fireMonthAll), Array.from(off.fireMonthAll), 'no FIRE-target haircut is applied to the Provident any more, regardless of taxOn');
});
