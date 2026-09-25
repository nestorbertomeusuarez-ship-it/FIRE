// Feature audit: retirement cash flows, cohort/ruin curve runway, historical backtest and
// user-facing (Spanish) validation messages.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../simulation-core.js');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const source = inline.slice(0, inline.indexOf('// The simulation runs off the main thread')) + '\nglobalThis.__t={simulate,DEFAULTS,buildRuinCurve,readParams,controls:el,MONTHS};';
const context = { console, Math, Float64Array, Int32Array, Uint8Array, Date, Infinity, NavlogCore: core, document: { getElementById: () => null }, globalThis: null };
context.globalThis = context; vm.createContext(context); vm.runInContext(source, context, { timeout: 5000 });
const { simulate, DEFAULTS, buildRuinCurve, readParams, controls, MONTHS } = context.__t;

// Deterministic retired profile: no returns, no volatility, retires in month 0 with far more than the target.
const flat = { ...DEFAULTS, seed: 3, proMode: false, startEq: 10000000, startBtc: 0, ret: 0, vol: 0, btcRet: 0, btcVol: 0, cashRet: 0, cashVol: 0, consRet: 0, consVol: 0,
  gasto: 100000, swr: 4, vida: 0, hip: 0, childAnnual: 0, brOn: false, burr: 0, provOn: false, startDelay: 0, captDelay: 0, horizonAge: 60,
  allocCash: 0, allocBonds: 0, allocEquities: 100 };
// The engine now snapshots every December PLUS its own final month (a partial
// year for an integer-age horizon, since the model starts in September), so
// the LAST series point is the run's final month, not necessarily a December.
const lastSnapshot = (params) => { const s = simulate(params, 3).series; return s[s.length - 1]; };
const model = ({ start, spend, pension = 0, pensionAge = 999, health = 0, healthAge = 999, lumps = [], childAnnual = 0, childStart = 0, childEnd = 0, barista = 0, baristaYears = 0 }, params) => {
  let balance = start; const months = Math.floor((params.horizonAge - params.ageNow) * 12) + 1;
  for (let i = 0; i < months; i++) {
    const d = new Date(2026, 8 + i, 1), year = d.getFullYear(), month = d.getMonth() + 1, age = params.ageNow + i / 12;
    if (i > 0) {
      const lump = lumps.reduce((sum, e) => sum + (e.year === year && e.month === month ? e.amount : 0), 0);
      const child = age >= childStart && age < childEnd ? -childAnnual / 12 : 0;
      let wd = spend / 12;
      if (i / 12 < baristaYears) wd -= barista / 12; // part-time income may exceed spending; the excess is surplus
      wd = wd - (age >= pensionAge ? pension / 12 : 0) + (age >= healthAge ? health / 12 : 0) - child - lump;
      balance -= wd; // a negative withdrawal is surplus income that is added to the portfolio
    }
  }
  return balance; // balance at the run's own final month, matching the engine's last snapshot
};

// Baseline: pure spending.
assert.ok(Math.abs(lastSnapshot(flat).p50 - model({ start: 10000000, spend: 100000 }, flat)) < 1, 'baseline drawdown matches the model');
// Health costs and recurring retirement income (below spending) change the drawdown exactly.
const withRetirementFlows = { ...flat, healthcareAnnual: 6000, healthcareStartAge: 40, pensionAnnual: 30000, pensionStartAge: 50 };
assert.ok(Math.abs(lastSnapshot(withRetirementFlows).p50 - model({ start: 10000000, spend: 100000, health: 6000, healthAge: 40, pension: 30000, pensionAge: 50 }, flat)) < 1, 'pension + health costs are applied from their start ages');
// Income above spending is surplus, not lost money.
const richPension = { ...flat, gasto: 40000, swr: 4, pensionAnnual: 90000, pensionStartAge: 45 };
assert.ok(Math.abs(lastSnapshot(richPension).p50 - model({ start: 10000000, spend: 40000, pension: 90000, pensionAge: 45 }, richPension)) < 1, 'pension surplus above spending is added to the portfolio');
// A large one-off inflow while retired is kept, not silently capped at that month's spending.
const inflow = { ...flat, lumpSums: '[{"year":2032,"month":3,"amount":2000000}]' };
assert.ok(Math.abs(lastSnapshot(inflow).p50 - model({ start: 10000000, spend: 100000, lumps: [{ year: 2032, month: 3, amount: 2000000 }] }, flat)) < 1, 'a EUR 2M inflow while retired increases wealth by EUR 2M');
const outflow = { ...flat, lumpSums: '[{"year":2032,"month":3,"amount":-500000}]' };
assert.ok(Math.abs(lastSnapshot(outflow).p50 - model({ start: 10000000, spend: 100000, lumps: [{ year: 2032, month: 3, amount: -500000 }] }, flat)) < 1, 'a one-off expense while retired is deducted');
// Child costs: exact interval [start, end).
const kid = { ...flat, childAnnual: 12000, childStartAge: 30, childEndAge: 34 };
assert.ok(Math.abs(lastSnapshot(kid).p50 - model({ start: 10000000, spend: 100000, childAnnual: 12000, childStart: 30, childEnd: 34 }, flat)) < 1, 'child cost is charged for ages [30, 34) only');

// Barista income above spending is surplus too (it used to be clamped away).
const barista = { ...flat, proMode: true, baristaOn: true, baristaIncome: 90000, baristaYears: 5 };
assert.ok(Math.abs(lastSnapshot(barista).p50 - model({ start: 10000000, spend: 100000, barista: 90000, baristaYears: 5 }, barista)) < 1, 'barista income is applied for its years');
const baristaRich = { ...barista, gasto: 40000, baristaIncome: 120000 };
assert.ok(Math.abs(lastSnapshot(baristaRich).p50 - model({ start: 10000000, spend: 40000, barista: 120000, baristaYears: 5 }, baristaRich)) < 1, 'barista income above spending is invested, not discarded');
assert.ok(lastSnapshot(baristaRich).p50 - lastSnapshot({ ...baristaRich, baristaOn: false }).p50 > 589000, 'the EUR 600k of five years of barista income ends up in the portfolio');

// ---- ruin curve: a route only counts as "at risk" for year y when the SIMULATION reached it ----
const fireMonthAll = new Int32Array(200).fill(12), ruinMonth = new Int32Array(200).fill(-1), ruined = new Uint8Array(200);
const cohort = { fireMonthAll, ruinMonth, ruined, forcedOut: new Uint8Array(200), licenseLossOut: new Uint8Array(200) };
const shortRun = buildRuinCurve(cohort, 200, 100);   // simulation ended at month 99
assert.equal(shortRun.find(c => c.y === 7).atRisk, 200, 'fire at month 12 + 7 years = month 96 is inside a 100-month run');
assert.equal(shortRun.find(c => c.y === 8).atRisk, 0, 'fire at month 12 + 8 years = month 108 is beyond the simulated horizon, so nobody is at risk');
assert.equal(shortRun.find(c => c.y === 8).pct, null);
const defaultRun = buildRuinCurve(cohort, 200);
assert.equal(defaultRun.find(c => c.y === 30).atRisk, 200, 'without a horizon argument the full simulation range is assumed');
// Cumulative ruin over a FIXED cohort is monotone non-decreasing.
const monotoneFire = new Int32Array(400).fill(0); const monotoneRuin = new Int32Array(400).fill(-1);
for (let k = 0; k < 400; k++) if (k % 3 === 0) monotoneRuin[k] = 20 + (k % 97) * 7;
const cumulative = buildRuinCurve({ ...cohort, fireMonthAll: monotoneFire, ruinMonth: monotoneRuin, forcedOut: new Uint8Array(400), licenseLossOut: new Uint8Array(400), ruined: new Uint8Array(400) }, 400, MONTHS).filter(c => c.pct !== null);
assert.ok(cumulative.length > 20);
for (let i = 1; i < cumulative.length; i++) assert.ok(cumulative[i].pct >= cumulative[i - 1].pct, 'cumulative ruin never decreases (year ' + cumulative[i].y + ')');
// (That run() hands the real horizon to buildRuinCurve is asserted behaviourally in ui-behaviour.test.js: the ruin table.)

// ---- historical sequential-withdrawal backtest ----
const flatBacktest = core.historicalWithdrawalBacktest([0, 0, 0, 0, 0], 1200, 100, 5);
assert.equal(flatBacktest.length, 1);
assert.ok(Math.abs(flatBacktest[0].finalBalance - 700) < 1e-9 && flatBacktest[0].ruined === false && flatBacktest[0].startIndex === 0);
assert.equal(core.historicalWithdrawalBacktest(new Array(10).fill(0), 1200, 100, 5).length, 6, 'one outcome per start year with enough history');
assert.equal(core.historicalWithdrawalBacktest([0, 0], 1200, 100, 5).length, 0, 'not enough history gives no outcomes');
assert.equal(core.historicalWithdrawalBacktest([0, 0], 1200, 100, 1.5).length, 0, 'fractional years are refused');
assert.equal(core.historicalWithdrawalBacktest([0, 0], NaN, 100, 1).length, 0, 'NaN capital is refused');
assert.equal(core.historicalWithdrawalBacktest('x', 100, 10, 1).length, 0);
assert.equal(core.historicalWithdrawalBacktest([-0.5, 0.2], 1000, 100, 2)[0].ruined, false, 'a drawdown that still leaves money is not ruin');
assert.equal(core.historicalWithdrawalBacktest([-0.9, 0.0], 1000, 400, 2)[0].ruined, true, 'a crash plus heavy withdrawals depletes the pot');
assert.equal(core.historicalWithdrawalBacktest([-1, 0], 1000, 10, 2)[0].ruined, true, 'a total loss year is ruin');
const grown = core.historicalWithdrawalBacktest([0.1], 1000, 0, 1)[0].finalBalance;
assert.ok(Math.abs(grown - 1100) < 1e-9, 'without withdrawals a 10 % year compounds to 1100');
assert.equal(core.historicalWithdrawalBacktest([0], 100, 120, 1)[0].ruined, true, 'withdrawing more than the capital in one year is ruin');

// ---- Spanish validation messages (the UI copy is Spanish) ----
controls.allocCash = { type: 'number', value: '50', min: '0', max: '100' };
assert.throws(() => readParams(), /100 %/, 'allocation error is Spanish and names the 100 % rule');
assert.throws(() => readParams(), error => !/Allocation/.test(error.message), 'no English core message leaks to the user');
controls.allocCash = null;
controls.lumpSums = { type: 'textarea', value: '[{"year":2030,"month":13,"amount":1}]' };
assert.throws(() => readParams(), error => /pago/i.test(error.message) && !/Each payment needs/.test(error.message), 'payment schedule errors are Spanish');
controls.lumpSums = { type: 'textarea', value: 'not json' };
assert.throws(() => readParams(), /pago|JSON/i, 'invalid JSON in the schedule is reported');
controls.lumpSums = null;
assert.throws(() => simulate({ ...DEFAULTS, ageNow: 60, horizonAge: 60 }, 2), /horizonte/, 'horizon errors are Spanish');
assert.throws(() => simulate({ ...DEFAULTS, ageNow: 17, horizonAge: 60 }, 2), error => /edad actual/i.test(error.message) && !/horizonte/i.test(error.message), 'an age below 18 is blamed on the age, not on the horizon');
assert.throws(() => simulate({ ...DEFAULTS, ageNow: 40, horizonAge: 120 }, 2), /horizonte/, 'horizon problems still name the horizon');
console.log('feature audit: OK');
