// node:vm harness for the six confirmed audit findings in simulate() (index.html).
// Pattern mirrors test/engine-audit-fixes.test.js: run the REAL inline script in a
// sandbox and exercise simulate() directly with deterministic (mostly zero-return)
// parameter sets, so each assertion isolates one fix instead of depending on the
// interaction of many stochastic features.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const core = require('../simulation-core.js');
const html = fs.readFileSync('index.html', 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const source = inline.slice(0, inline.indexOf('// The simulation runs off the main thread')) + '\nglobalThis.__test={simulate,DEFAULTS};';
const context = { console, Math, Float64Array, Int32Array, Uint8Array, Date, Infinity, NavlogCore: core, document:{getElementById:()=>null}, globalThis:null };
context.globalThis = context; vm.createContext(context); vm.runInContext(source, context, { timeout: 5000 });
const { simulate, DEFAULTS } = context.__test;

// ---- Fix #1: FIRE target counts the Provident net of expected tax when taxes are on ----
test('the Provident balance is haircut for the FIRE-target comparison when taxes are on (flat mode)', () => {
  // A deterministic, zero-market-return household whose accumulation is dominated by
  // Provident contributions (huge basic salary relative to a thin cash salary): the
  // target-crossing month should move later once taxOn applies the haircut, purely
  // from the FIRE-target comparison (not from any change to the actual balances).
  const base = {
    ...DEFAULTS, seed: 1, proMode: true,
    ret: 0, vol: 0, btcRet: 0, btcVol: 0, consRet: 0, consVol: 0, cashRet: 0, cashVol: 0, goldRet: 0, goldVol: 0,
    startEq: 0, startBtc: 0, startGold: 0,
    allocCash: 0, allocBonds: 0, allocEquities: 100,
    vida: 0, hip: 0, burr: 0, brOn: false,
    childAnnual: 0, healthcareAnnual: 0, pensionAnnual: 0,
    fx: 1, salG: 0,
    salFO: 120000, salCA: 120000, basicFO: 120000, basicCA: 120000, provCo: 12, provOn: true,
    captY: 2200, // never promoted to captain within the horizon
    taxRateProv: 50, useRegionalGeneralIrpf: false,
    gasto: 400000, swr: 4,
    horizonAge: 90
  };
  const off = simulate({ ...base, taxOn: false }, 2);
  const on = simulate({ ...base, taxOn: true }, 2);
  assert.equal(off.fireMonthAll[0], 385, 'sanity: locked-in untaxed FIRE month for this deterministic scenario');
  assert.equal(on.fireMonthAll[0], 650, 'taxOn delays FIRE because the Provident now counts net of its 50% haircut');
  assert.ok(on.fireMonthAll[0] > off.fireMonthAll[0], 'taxes on can only delay (never advance) crossing the target');
});

test('the Provident haircut uses the regional general-IRPF effective rate, not the flat taxRateProv, in regional mode', () => {
  const base = {
    ...DEFAULTS, seed: 1, proMode: true,
    ret: 0, vol: 0, btcRet: 0, btcVol: 0, consRet: 0, consVol: 0, cashRet: 0, cashVol: 0, goldRet: 0, goldVol: 0,
    startEq: 0, startBtc: 0, startGold: 0,
    allocCash: 0, allocBonds: 0, allocEquities: 100,
    vida: 0, hip: 0, burr: 0, brOn: false,
    childAnnual: 0, healthcareAnnual: 0, pensionAnnual: 0,
    fx: 1, salG: 0,
    salFO: 120000, salCA: 120000, basicFO: 120000, basicCA: 120000, provCo: 12, provOn: true,
    captY: 2200,
    taxOn: true, taxRateProv: 50, useRegionalGeneralIrpf: true,
    gasto: 400000, swr: 4,
    horizonAge: 90
  };
  const catalonia = simulate({ ...base, taxRegion: 0 }, 2);
  const valencia = simulate({ ...base, taxRegion: 1 }, 2);
  const flat = simulate({ ...base, useRegionalGeneralIrpf: false }, 2);
  assert.equal(catalonia.fireMonthAll[0], 638);
  assert.equal(valencia.fireMonthAll[0], 675);
  assert.notEqual(catalonia.fireMonthAll[0], valencia.fireMonthAll[0], 'the two regions have different general-IRPF scales, so their haircut differs');
  assert.notEqual(catalonia.fireMonthAll[0], flat.fireMonthAll[0], 'regional mode does not fall back to the flat taxRateProv figure');
});

test('providentFireTaxRate never changes the actual balances, only the FIRE-target comparison', () => {
  // Same scenario, taxOn true vs false: the RAW total (uncapped, including vProv at
  // full value) at the untaxed FIRE month must be identical either way, proving the
  // fix only moves the comparison, never vProv itself.
  const base = {
    ...DEFAULTS, seed: 1, proMode: true,
    ret: 0, vol: 0, btcRet: 0, btcVol: 0, consRet: 0, consVol: 0, cashRet: 0, cashVol: 0, goldRet: 0, goldVol: 0,
    startEq: 0, startBtc: 0, startGold: 0,
    allocCash: 0, allocBonds: 0, allocEquities: 100,
    vida: 0, hip: 0, burr: 0, brOn: false,
    childAnnual: 0, healthcareAnnual: 0, pensionAnnual: 0,
    fx: 1, salG: 0,
    salFO: 120000, salCA: 120000, basicFO: 120000, basicCA: 120000, provCo: 12, provOn: true,
    captY: 2200, taxRateProv: 50, useRegionalGeneralIrpf: false,
    gasto: 200000, swr: 4, horizonAge: 90
  };
  const off = simulate({ ...base, taxOn: false }, 2);
  const on = simulate({ ...base, taxOn: true }, 2);
  // Compare the accumulated wealth at the SAME early year (well before either path
  // retires and taxes start touching withdrawals): balances must be bit-identical.
  assert.deepEqual(on.series.slice(0, 5).map(s => s.p50), off.series.slice(0, 5).map(s => s.p50), 'accumulation-phase balances are unaffected by the FIRE-target haircut');
});

// ---- Fix #2: the Esparreguera mortgage payment continues after FIRE until hipEnd ----
test('the mortgage payment keeps being deducted every month after FIRE, until hipEnd', () => {
  const base = {
    ...DEFAULTS, seed: 1,
    ret: 0, vol: 0, btcRet: 0, btcVol: 0, consRet: 0, consVol: 0, cashRet: 0, cashVol: 0,
    startEq: 1000000, startBtc: 0,
    allocEquities: 100, allocBonds: 0, allocCash: 0,
    vida: 0, burr: 0, brOn: false,
    salFO: 0, salCA: 0, basicFO: 0, basicCA: 0, provOn: false,
    childAnnual: 0, healthcareAnnual: 0, pensionAnnual: 0,
    gasto: 40000, swr: 4, // target exactly matches startEq: immediate FIRE
    horizonAge: 35, wdStrategy: 0,
    hipEnd: 2100
  };
  const withoutHip = simulate({ ...base, hip: 0 }, 2);
  const withHip = simulate({ ...base, hip: 1000 }, 2);
  assert.equal(withoutHip.fireMonthAll[0], 0, 'sanity: FIRE triggers immediately in this scenario');
  assert.equal(withHip.fireMonthAll[0], 0, 'the mortgage payment does not block or delay reaching the target');
  // A full retirement year (2028, the first with no partial-year edge effects) must
  // show exactly 12 months x 1000 EUR/month of extra withdrawal versus no mortgage.
  const year2027 = withoutHip.series.find(s => s.year === 2027).p50 - withHip.series.find(s => s.year === 2027).p50;
  const year2028 = withoutHip.series.find(s => s.year === 2028).p50 - withHip.series.find(s => s.year === 2028).p50;
  assert.ok(Math.abs(year2028 - year2027 - 12000) < 1e-6, 'one extra full year of the mortgage payment is exactly 12,000 EUR (got delta ' + (year2028 - year2027) + ')');
});

// ---- Fix #3: a pre-FIRE deficit becomes debt (negative vCash), never permanent ruin ----
test('a temporary pre-FIRE cash-flow crunch becomes debt and the path can still reach FIRE later', () => {
  // The auditor's repro: a large negative lump sum against modest liquid buckets,
  // followed later by a large positive lump sum. Previously this permanently set
  // ruinedPath=true at the shortfall and the path could never fire again.
  const base = {
    ...DEFAULTS, seed: 1,
    ret: 0, vol: 0, btcRet: 0, btcVol: 0, consRet: 0, consVol: 0, cashRet: 0, cashVol: 0,
    startEq: 100000, startBtc: 0,
    allocEquities: 100, allocBonds: 0, allocCash: 0,
    vida: 0, hip: 0, burr: 0, brOn: false,
    salFO: 100000, salCA: 100000, basicFO: 0, basicCA: 0, provOn: false,
    childAnnual: 0, healthcareAnnual: 0, pensionAnnual: 0,
    gasto: 60000, swr: 4, horizonAge: 90, careerYear: 2026,
    lumpSums: JSON.stringify([{ year: 2027, month: 1, amount: -150000 }, { year: 2029, month: 1, amount: 2000000 }])
  };
  const r = simulate(base, 2);
  assert.ok(r.fireMonthAll[0] >= 0, 'the path reaches FIRE after recovering from its pre-FIRE debt (was permanently blocked before this fix)');
  const counts = core.retirementCohortCounts({ fireMonthAll: r.fireMonthAll, ruined: r.ruined, forcedOut: r.forcedOut, licenseLossOut: r.licenseLossOut }, 2);
  assert.equal(counts.preFireRuin, 0, 'a path that eventually fires is never counted as pre-FIRE ruin, even if it carried debt along the way');
  assert.ok(counts.voluntary >= 1, 'the recovered path is counted as a voluntary FIRE (possibly with a later, unrelated post-retirement ruin)');
});

test('a household that never earns enough and never recovers ends the horizon in debt, counted as preFireRuin', () => {
  const permanentDebt = {
    ...DEFAULTS, seed: 1,
    ret: 0, vol: 0, btcRet: 0, btcVol: 0, consRet: 0, consVol: 0, cashRet: 0, cashVol: 0,
    startEq: 0, startBtc: 0, proMode: false,
    vida: 5000, hip: 1000, burr: 0, brOn: false,
    salFO: 20000, salCA: 20000, basicFO: 0, basicCA: 0, provOn: false,
    childAnnual: 0, healthcareAnnual: 0, pensionAnnual: 0,
    gasto: 130000, swr: 4, horizonAge: 90, careerYear: 2026, hipEnd: 2100
  };
  const r = simulate(permanentDebt, 2);
  assert.equal(r.fireMonthAll[0], -1, 'this household never reaches its unattainable target');
  assert.equal(r.ruined[0], 1, 'the path ends the horizon still in debt, so it is flagged');
  assert.equal(r.series[r.series.length - 1].p50, 0, 'the published (clamped) final wealth reads 0, never a negative number');
  const counts = core.retirementCohortCounts({ fireMonthAll: r.fireMonthAll, ruined: r.ruined, forcedOut: r.forcedOut, licenseLossOut: r.licenseLossOut }, 2);
  assert.deepEqual(counts, { voluntary: 0, voluntaryRuined: 0, forced: 0, licenseLoss: 0, preFireRuin: 2, noRetirement: 0 });
});

test('a deficit that empties every bucket becomes debt of exactly the remaining shortfall', () => {
  const debtCreated = {
    ...DEFAULTS, seed: 1,
    ret: 0, vol: 0, btcRet: 0, btcVol: 0, consRet: 0, consVol: 0, cashRet: 0, cashVol: 0,
    startEq: 0, startBtc: 0,
    allocEquities: 50, allocBonds: 0, allocCash: 50,
    vida: 0, hip: 0, burr: 0, brOn: false,
    salFO: 0, salCA: 0, basicFO: 0, basicCA: 0, provOn: false,
    childAnnual: 0, healthcareAnnual: 0, pensionAnnual: 0,
    gasto: 1000000, swr: 4, horizonAge: 30, careerYear: 2026,
    lumpSums: JSON.stringify([{ year: 2026, month: 9, amount: -50000 }])
  };
  const r = simulate({ ...debtCreated, debugTrackBuckets: true }, 2);
  assert.ok(Math.abs(r.debug.minCash - (-50000)) < 1e-6, 'the whole 50,000 shortfall (every bucket started at 0) becomes vCash debt, not permanent ruin');
  assert.ok(r.debug.minBucketExCash >= -1e-6, 'no bucket other than cash ever goes negative');
  const counts = core.retirementCohortCounts({ fireMonthAll: r.fireMonthAll, ruined: r.ruined, forcedOut: r.forcedOut, licenseLossOut: r.licenseLossOut }, 2);
  assert.equal(counts.preFireRuin, 2, 'with no further income to ever repay it, the path ends the horizon in debt');
});

// ---- Fix #5: mandatoryRetireAge default is 65 (ICAO Annex 1 multi-crew limit) ----
test('mandatoryRetireAge defaults to 65', () => {
  assert.equal(DEFAULTS.mandatoryRetireAge, 65);
});

// ---- Fix #6: Beckham (obligación real) still taxes Spanish-situated real estate ----
test('during the Beckham window, wealth tax still applies to the rental property (vRE) only', () => {
  const base = {
    ...DEFAULTS, seed: 1, proMode: true,
    ret: 0, vol: 0, btcRet: 0, btcVol: 0, consRet: 0, consVol: 0, cashRet: 0, cashVol: 0,
    startEq: 2000000, startBtc: 0,
    allocEquities: 100, allocBonds: 0, allocCash: 0,
    vida: 0, hip: 0, burr: 0, brOn: false,
    salFO: 0, salCA: 0, basicFO: 0, basicCA: 0, provOn: false,
    childAnnual: 0, healthcareAnnual: 0, pensionAnnual: 0,
    gasto: 40000, swr: 4, horizonAge: 35,
    taxOn: true, taxRepatDelay: 0,
    wealthTaxOn: true, wealthExempt: 100000, wealthRate: 2, wealthBonusPct: 0, mortgageBalance: 0,
    reOn: true, reValue: 1000000, reCountsFire: true, reYield: 0, reAppr: 0,
    beckhamOn: true, beckhamYears: 6
  };
  const withBeckham = simulate(base, 2);
  const noWealthTax = simulate({ ...base, wealthTaxOn: false }, 2);
  // Year 1: 2% of (1,000,000 - 100,000 exempt) = 18,000 EUR of wealth tax on vRE alone.
  const bite = noWealthTax.series[0].p50 - withBeckham.series[0].p50;
  assert.ok(Math.abs(bite - 18000) < 1, 'the vRE-only wealth tax bite matches the regional rate against (reValue - wealthExempt) (got ' + bite + ')');
});

// ---- Debt follow-ups: pre-FIRE debt must be repaid at retirement, never silently carried ----
test('pre-FIRE debt is repaid at the retirement transition, and no fired path ends the horizon negative while ruined==0', () => {
  // The auditor's repro: high living cost + a large mortgage relative to salary,
  // plus a big negative lump sum, reliably drives some paths into pre-FIRE debt
  // (negative vCash) while a large Provident balance (locked, untouched by the
  // deficit cascade) still crosses the FIRE target in the same month.
  const base = {
    ...DEFAULTS, seed: 42, proMode: true, taxOn: true,
    ageNow: 25, horizonAge: 75, vida: 9500, hip: 3500, hipEnd: 2032,
    lumpSums: [{ year: 2027, month: 6, amount: -450000 }],
    gasto: 45000, swr: 4.5,
    debugTrackBuckets: true
  };
  const r = simulate(base, 50);
  assert.ok(r.debug.minCash < 0, 'sanity: this scenario does create pre-FIRE debt somewhere across the 50 paths');
  assert.ok(r.debug.minCashAfterFire >= -1e-6, 'debt must be fully repaid (vCash >= 0) by the moment any path retires (voluntary FIRE, mandatory exit, or LOL)');
  assert.ok(r.debug.minRawFinalNonRuined >= -1e-6, 'no path flagged as NOT ruined may actually end the horizon with a negative raw (unclamped) total');
});

// ---- Fix #2 (GK guardrail): the withdrawal-rate check must include the post-FIRE mortgage ----
test('Guyton-Klinger cuts spending once the mortgage payment is counted in the withdrawal rate', () => {
  const gkBase = {
    ...DEFAULTS, seed: 1, proMode: true,
    ret: 0, vol: 0, btcRet: 0, btcVol: 0, consRet: 0, consVol: 0, cashRet: 0, cashVol: 0, goldRet: 0, goldVol: 0,
    startEq: 1000000, startBtc: 0,
    allocEquities: 100, allocBonds: 0, allocCash: 0,
    vida: 0, burr: 0, brOn: false,
    salFO: 0, salCA: 0, basicFO: 0, basicCA: 0, provOn: false,
    childAnnual: 0, healthcareAnnual: 0, pensionAnnual: 0,
    gasto: 40000, swr: 4, // target exactly matches startEq: immediate FIRE at month 0
    wdStrategy: 1, gkGuard: 20, gkCut: 10, gkRaise: 10, gkFreq: 12,
    hip: 1000, hipEnd: 2100,
    // Default careerYear/CAREER_MONTH puts careerStart at absolute month 9 (Jun-2027),
    // so the mortgage/salary machinery stays inert before that, same as fireMonth=0.
    startDelay: 0, careerYear: 2027, ageNow: 28
  };
  // Long horizon so the capital preservation rule is active (it is switched off in the last 15
  // years, as in Guyton & Klinger 2006). Compare a 10 % cut with no cut: the first review is at
  // month 12 and applies to that month's withdrawal, so by the Dec-2027 snapshot (month 15) the
  // cut run has spent 4 x 4,000/12 = 1,333.33 EUR less. Without the mortgage in the rate check the
  // guard is never crossed (40,000/1,000,000 = 4 % vs a 4.8 % upper band) and the runs are equal.
  const year2027 = r => r.series.find(x => x.year === 2027).p50;
  const cut = simulate({ ...gkBase, horizonAge: 70 }, 2);
  const noCut = simulate({ ...gkBase, horizonAge: 70, gkCut: 0 }, 2);
  assert.equal(cut.fireMonthAll[0], 0, 'sanity: FIRE triggers immediately');
  const saved = year2027(cut) - year2027(noCut);
  assert.ok(Math.abs(saved - 4000 * 4 / 12) < 1, `expected ~1,333 EUR saved by the guardrail cut (got ${saved})`);
});

// ---- Fix #3 (fees): cumFees must never read negative, even while vCash is in debt ----
test('cumulative fees never read negative even while a path is carrying debt (negative vCash)', () => {
  const debtWithFees = {
    ...DEFAULTS, seed: 1, proMode: true,
    ret: 0, vol: 0, btcRet: 0, btcVol: 0, consRet: 0, consVol: 0, cashRet: 0, cashVol: 0,
    feeCash: 2,
    startEq: 0, startBtc: 0,
    allocEquities: 50, allocBonds: 0, allocCash: 50,
    vida: 0, hip: 0, burr: 0, brOn: false,
    salFO: 0, salCA: 0, basicFO: 0, basicCA: 0, provOn: false,
    childAnnual: 0, healthcareAnnual: 0, pensionAnnual: 0,
    gasto: 1000000, swr: 4, horizonAge: 30, careerYear: 2026,
    lumpSums: [{ year: 2026, month: 9, amount: -50000 }]
  };
  const r = simulate(debtWithFees, 2);
  assert.ok(r.series.every(s => s.fee50 >= 0), 'the published cumulative fee series must never go negative, even while vCash is in debt');
});

// ---- Fix #4 (texts): outcome-dashboard wording, README test list, and the hip/hipEnd hint ----
test('README documents the actual outcome-dashboard categories and how to run every test file', () => {
  const readme = fs.readFileSync('README.md', 'utf8');
  assert.ok(/FIRE voluntario/.test(readme), 'README must name voluntary FIRE');
  assert.ok(/post-FIRE ruin/i.test(readme), 'README must name the post-FIRE ruin sub-rate');
  assert.ok(/salida forzosa/.test(readme), 'README must name forced retirement (salida forzosa)');
  assert.ok(/p[eé]rdida de licencia/.test(readme), 'README must name loss of licence');
  assert.ok(/nunca llega al FIRE/.test(readme) && /deuda/.test(readme), 'README must name the never-fires-and-ends-in-debt category');
  assert.ok(readme.includes('node --test test/*.test.js'), 'README must document the glob that runs every test file (no hand-kept list to go stale)');
});

test('the hip/hipEnd controls explain the mortgage continues after FIRE and is separate from retirement spend', () => {
  const rawHtml = fs.readFileSync('index.html', 'utf8');
  const hipSection = rawHtml.slice(rawHtml.indexOf('id="hip"'), rawHtml.indexOf('id="mortgageBalance"'));
  assert.ok(/class="hint"/.test(hipSection), 'a hint paragraph must sit between the hip/hipEnd controls and mortgageBalance');
  assert.ok(/Fin de hipoteca/.test(hipSection), 'the hint must reference "Fin de hipoteca"');
  assert.ok(/Gasto anual al jubilarte/.test(hipSection), 'the hint must clarify it is separate from "Gasto anual al jubilarte"');
});

test('during the Beckham window, wealth tax is fully suspended on everything except the rental property', () => {
  const base = {
    ...DEFAULTS, seed: 1, proMode: true,
    ret: 0, vol: 0, btcRet: 0, btcVol: 0, consRet: 0, consVol: 0, cashRet: 0, cashVol: 0,
    startEq: 2000000, startBtc: 0,
    allocEquities: 100, allocBonds: 0, allocCash: 0,
    vida: 0, hip: 0, burr: 0, brOn: false,
    salFO: 0, salCA: 0, basicFO: 0, basicCA: 0, provOn: false,
    childAnnual: 0, healthcareAnnual: 0, pensionAnnual: 0,
    gasto: 40000, swr: 4, horizonAge: 35,
    taxOn: true, taxRepatDelay: 0,
    wealthTaxOn: true, wealthExempt: 100000, wealthRate: 2, wealthBonusPct: 0, mortgageBalance: 0,
    // Property excluded from the FIRE target and left OUT of the series total, so a
    // change in its own wealth tax cannot show up here — isolates the ex-RE portfolio.
    reOn: true, reValue: 1000000, reCountsFire: false, reYield: 0, reAppr: 0,
    beckhamOn: true, beckhamYears: 6
  };
  const withBeckham = simulate(base, 2);
  const withoutBeckham = simulate({ ...base, beckhamOn: false }, 2);
  // Without Beckham, the full portfolio (ex-RE) pays wealth tax and shrinks faster than
  // just the withdrawal rate; with Beckham, the ex-RE portfolio should decline by EXACTLY
  // the withdrawal (40,000/year), since its own wealth tax is fully suspended.
  const declineWithBeckham = withBeckham.series[0].p50 - withBeckham.series[1].p50;
  assert.ok(Math.abs(declineWithBeckham - 40000) < 1, 'with Beckham active, the ex-RE portfolio only shrinks by the withdrawal, no wealth tax (got decline ' + declineWithBeckham + ')');
  const declineWithoutBeckham = withoutBeckham.series[0].p50 - withoutBeckham.series[1].p50;
  assert.ok(declineWithoutBeckham > 40000 + 1, 'without Beckham, the same ex-RE portfolio also pays its own wealth tax and shrinks faster (got decline ' + declineWithoutBeckham + ')');
});
