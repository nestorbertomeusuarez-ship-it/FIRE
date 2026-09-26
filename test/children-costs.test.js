// Per-child cost model: replaces the old single "Gasto anual por hijo" age-window control
// (childAnnual/childStartAge/childEndAge) with realistic age-banded costs per child, plus a
// school-fee add-on (Emirates pays schooling while employed) and an Emirates medical-insurance
// premium (paid only while employed). See simulation-core.js's childMonthlyCost for the pure
// per-month/per-child logic, and index.html's simulate() for how it is wired into the engine
// (childBirthIdx/childCosts precomputed once per simulate() call, `isWorking` reused from the
// existing salary code as "working at Emirates").
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
const median = values => { const s = Array.from(values).sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

// ---- pure function: NavlogCore.childMonthlyCost(ageMonths, costs, workingAtEmirates, insuranceMonthlyEUR) ----

test('childMonthlyCost: age bands are exact in months (0-2 / 3-17 / 18-22 / 23+)', () => {
  const costs = { cost0to2: 9600, cost3to17: 9400, cost18to22: 12000, schoolCost: 0 };
  assert.equal(core.childMonthlyCost(0, costs, true), 800, 'newborn month is band 0-2');
  assert.equal(core.childMonthlyCost(35, costs, true), 800, 'month 35 (< 3 years) is still band 0-2');
  assert.ok(Math.abs(core.childMonthlyCost(36, costs, true) - 9400 / 12) < 1e-9, 'month 36 (age 3, at school: no more nursery) enters band 3-17');
  assert.ok(Math.abs(core.childMonthlyCost(215, costs, true) - 9400 / 12) < 1e-9, 'month 215 (< 18 years) is still band 3-17');
  assert.equal(core.childMonthlyCost(216, costs, true), 1000, 'month 216 (age 18) enters band 18-22');
  assert.equal(core.childMonthlyCost(275, costs, true), 1000, 'month 275 (< 23 years) is still band 18-22');
  assert.equal(core.childMonthlyCost(276, costs, true), 0, 'month 276 (age 23) costs nothing');
});

test('childMonthlyCost: months before birth always cost 0, whatever the bands/school/insurance', () => {
  const costs = { cost0to2: 12000, cost3to17: 12000, cost18to22: 12000, schoolCost: 12000 };
  assert.equal(core.childMonthlyCost(-1, costs, false, 500), 0);
  assert.equal(core.childMonthlyCost(-100, costs, true, 500), 0);
});

test('childMonthlyCost: school cost applies only ages 3-17, and only while NOT working at Emirates', () => {
  const costs = { cost0to2: 0, cost3to17: 0, cost18to22: 0, schoolCost: 12000 };
  assert.equal(core.childMonthlyCost(35, costs, false), 0, 'age < 3 (month 35): no school cost even if not working');
  assert.equal(core.childMonthlyCost(36, costs, true), 0, 'age 3, still working at Emirates: Emirates pays schooling');
  assert.equal(core.childMonthlyCost(36, costs, false), 1000, 'age 3, not working: school cost applies');
  assert.equal(core.childMonthlyCost(215, costs, false), 1000, 'age < 18 (month 215), not working: school cost applies');
  assert.equal(core.childMonthlyCost(216, costs, false), 0, 'age 18: school cost stops even if not working');
});

test('childMonthlyCost: band cost and school cost stack (not working, ages 3-17)', () => {
  const costs = { cost0to2: 0, cost3to17: 12000, cost18to22: 0, schoolCost: 6000 };
  assert.ok(Math.abs(core.childMonthlyCost(100, costs, false) - (12000 / 12 + 6000 / 12)) < 1e-9);
  assert.ok(Math.abs(core.childMonthlyCost(100, costs, true) - 12000 / 12) < 1e-9, 'working: no school cost added');
});

test('childMonthlyCost: the Emirates insurance premium applies only while working at Emirates', () => {
  const costs = { cost0to2: 0, cost3to17: 0, cost18to22: 0, schoolCost: 0 };
  assert.equal(core.childMonthlyCost(10, costs, true, 110.25), 110.25, 'insurance applies while working');
  assert.equal(core.childMonthlyCost(10, costs, false, 110.25), 0, 'insurance does not apply once retired/left Emirates');
  assert.equal(core.childMonthlyCost(10, costs, true), 0, 'no insurance argument means no insurance cost');
});

test('childMonthlyCost: FS1 (age 3) is charged only while working at Emirates, on top of the 3-17 band', () => {
  const costs = { cost0to2: 12000, cost3to17: 6000, cost18to22: 0, schoolCost: 0, fs1Cost: 10400 };
  assert.ok(Math.abs(core.childMonthlyCost(35, costs, true) - 12000 / 12) < 1e-9, 'age 2 (month 35): no FS1 yet');
  assert.ok(Math.abs(core.childMonthlyCost(36, costs, true) - (6000 + 10400) / 12) < 1e-9, 'age 3 (month 36), working: 3-17 band plus FS1, no nursery');
  assert.ok(Math.abs(core.childMonthlyCost(36, costs, false) - 6000 / 12) < 1e-9, 'age 3, not working: no FS1 (Emirates coverage no longer applies)');
  assert.ok(Math.abs(core.childMonthlyCost(47, costs, true) - (6000 + 10400) / 12) < 1e-9, 'month 47 (still age 3): FS1 still applies');
  assert.ok(Math.abs(core.childMonthlyCost(48, costs, true) - 6000 / 12) < 1e-9, 'age 4 (month 48): FS1 stops, Emirates allowance takes over');
});

test('childMonthlyCost: the Emirates insurance premium stops at the 19th birthday even while still working', () => {
  const costs = { cost0to2: 0, cost3to17: 0, cost18to22: 0, schoolCost: 0 };
  assert.equal(core.childMonthlyCost(227, costs, true, 110), 110, 'month 227 (just under 19): insurance still applies');
  assert.equal(core.childMonthlyCost(228, costs, true, 110), 0, 'month 228 (19th birthday): insurance stops, even though still working');
});

// ---- new DEFAULTS, and the old childAnnual/childStartAge/childEndAge control are gone ----

test('DEFAULTS carry the new per-band child-cost model', () => {
  assert.equal(DEFAULTS.childCount, 1);
  assert.equal(DEFAULTS.child1BirthYear, 2026);
  assert.equal(DEFAULTS.child1BirthMonth, 8);
  assert.equal(DEFAULTS.child2BirthYear, 2029);
  assert.equal(DEFAULTS.child3BirthYear, 2032);
  assert.equal(DEFAULTS.childCost0to2, 9400);
  assert.equal(DEFAULTS.childCost3to17, 9400);
  assert.equal(DEFAULTS.childCost18to22, 10000);
  assert.equal(DEFAULTS.childSchoolCost, 9000);
  assert.equal(DEFAULTS.childFS1Cost, 10400);
  assert.equal(DEFAULTS.childInsuranceAED, 1323);
  assert.equal('childAnnual' in DEFAULTS, false, 'the old single child-cost control is gone');
  assert.equal('childStartAge' in DEFAULTS, false);
  assert.equal('childEndAge' in DEFAULTS, false);
  assert.equal('FS1_GAP' in DEFAULTS, false);
});

test('child2BirthYear/child3BirthYear controls are hidden by class unless childCount selects that many children', () => {
  assert.match(html, /class="ctrl child2-only"[^>]*>[\s\S]{0,400}?id="child2BirthYear"/, 'child2BirthYear control carries the child2-only class');
  assert.match(html, /class="ctrl child3-only"[^>]*>[\s\S]{0,400}?id="child3BirthYear"/, 'child3BirthYear control carries the child3-only class');
  assert.match(html, /body:not\(\.child2\)\s*\.child2-only\s*\{[^}]*display:\s*none/, 'child2-only is hidden unless body has the child2 class');
  assert.match(html, /body:not\(\.child3\)\s*\.child3-only\s*\{[^}]*display:\s*none/, 'child3-only is hidden unless body has the child3 class');
});

// ---- engine-level: childCount 0 vs 1 delays/reduces contributions towards FIRE ----

test('childCount 0 vs 1: FIRE month median is later (or equal) and contributions are lower with a child', () => {
  const base = { ...DEFAULTS, seed: 2026, horizonAge: 70, gasto: 60000, swr: 3.25 };
  const withChild = simulate({ ...base, childCount: 1 }, 300);
  const withoutChild = simulate({ ...base, childCount: 0 }, 300);
  const fireMedian = result => median(result.fireMonthAll.filter(m => m >= 0));
  assert.ok(fireMedian(withChild) >= fireMedian(withoutChild), 'a child cost never brings the median FIRE month forward');
  const contribAt = result => result.series[result.series.length - 1].contrib50;
  assert.ok(contribAt(withoutChild) > contribAt(withChild), 'contributions end up lower once the child cost is subtracted every month');
});

// ---- engine-level: childSchoolCost only matters after leaving Emirates ----

test('childSchoolCost changes nothing while the household never leaves Emirates within the horizon', () => {
  // Long career, short horizon, no forced exits: `isWorking` stays true for the whole run,
  // so the school-cost add-on (which only fires while NOT working) never applies.
  const base = {
    ...DEFAULTS, seed: 55, horizonAge: 45, careerYear: 2026, startDelay: 0, captDelay: 0,
    mandatoryRetireOn: false, lolOn: false, gasto: 20000000, swr: 0.1, // astronomically high target: never voluntarily FIREs
    childCount: 1, child1BirthYear: 2026, child1BirthMonth: 1,
  };
  const noSchool = simulate({ ...base, childSchoolCost: 0 }, 60);
  const bigSchool = simulate({ ...base, childSchoolCost: 20000 }, 60);
  assert.deepEqual(noSchool.series.map(x => x.p50), bigSchool.series.map(x => x.p50), 'childSchoolCost is inert while never leaving Emirates');
});

// ---- engine-level: FS1 (age 3) is a per-child cost, not the old fixed 2029/2031 gap ----

test('no FS1 charge in 2029/2031 when childCount is 0 (it is a per-child cost now, not a fixed calendar-year gap)', () => {
  const base = { ...DEFAULTS, seed: 21, horizonAge: 45, careerYear: 2026, startDelay: 0, captDelay: 0, mandatoryRetireOn: false, lolOn: false, childCount: 0 };
  const noFS1 = simulate({ ...base, childFS1Cost: 0 }, 60);
  const bigFS1 = simulate({ ...base, childFS1Cost: 20000 }, 60);
  assert.deepEqual(noFS1.series.map(x => x.p50), bigFS1.series.map(x => x.p50), 'childFS1Cost is inert with no children, regardless of the year');
});

// ---- engine-level: childInsuranceAED only matters while working at Emirates ----

test('childInsuranceAED changes results while working, but not after leaving Emirates', () => {
  const workingBase = {
    ...DEFAULTS, seed: 8, horizonAge: 40, careerYear: 2026, startDelay: 0, captDelay: 0,
    mandatoryRetireOn: false, lolOn: false, gasto: 20000000, swr: 0.1, // never voluntarily FIREs: isWorking stays true
    childCount: 1, child1BirthYear: 2026, child1BirthMonth: 1,
  };
  const noInsurance = simulate({ ...workingBase, childInsuranceAED: 0 }, 60);
  const withInsurance = simulate({ ...workingBase, childInsuranceAED: 1323 }, 60);
  assert.notDeepEqual(noInsurance.series.map(x => x.p50), withInsurance.series.map(x => x.p50), 'the insurance premium changes results while working');

  // A retired household (large starting wealth, tiny target) never has isWorking===true past month 0.
  const retiredBase = { ...DEFAULTS, seed: 8, startEq: 10000000, gasto: 20000, swr: 4, horizonAge: 40, childCount: 1, child1BirthYear: 2010, child1BirthMonth: 1 };
  const retiredNoInsurance = simulate({ ...retiredBase, childInsuranceAED: 0 }, 60);
  const retiredWithInsurance = simulate({ ...retiredBase, childInsuranceAED: 1323 }, 60);
  assert.deepEqual(retiredNoInsurance.series.map(x => x.p50), retiredWithInsurance.series.map(x => x.p50), 'the insurance premium is inert once retired/left Emirates');
});

// ---- healthcareAnnual: starts the month you stop working at Emirates, not at a configured age ----

test('healthcareAnnual is inert while working at Emirates the whole horizon', () => {
  const base = {
    ...DEFAULTS, seed: 33, horizonAge: 45, careerYear: 2026, startDelay: 0, captDelay: 0,
    mandatoryRetireOn: false, lolOn: false, gasto: 20000000, swr: 0.1, // never voluntarily FIREs: isWorking stays true
    childCount: 0,
  };
  const noHealth = simulate({ ...base, healthcareAnnual: 0 }, 60);
  const bigHealth = simulate({ ...base, healthcareAnnual: 10000 }, 60);
  assert.deepEqual(noHealth.series.map(x => x.p50), bigHealth.series.map(x => x.p50), 'healthcareAnnual changes nothing while never leaving Emirates');
});

test('healthcareAnnual lowers outcomes once the household retires early (voluntary FIRE)', () => {
  const base = { ...DEFAULTS, seed: 12, startEq: 8000000, startBtc: 0, gasto: 30000, swr: 4, horizonAge: 60, childCount: 0 };
  const noHealth = simulate({ ...base, healthcareAnnual: 0 }, 200);
  const bigHealth = simulate({ ...base, healthcareAnnual: 12000 }, 200);
  const last = r => r.series[r.series.length - 1].p50;
  assert.ok(last(noHealth) > last(bigHealth), 'a household paying its own healthcare after an early FIRE ends up with less wealth');
});

test('a legacy scenario with healthcareStartAge loads (the key is dropped, not carried over)', () => {
  const migrated = core.migrateLegacyParams({ gasto: 60000, healthcareStartAge: 65 });
  assert.deepEqual(migrated, { gasto: 60000 }, 'healthcareStartAge is dropped by the general legacy-key migration');
});

// ---- legacy scenario migration: old keys are dropped, new params come from DEFAULTS ----

test('a legacy scenario with childAnnual/childStartAge/childEndAge (or nur) normalizes without those keys', () => {
  const migratedFromChildAnnual = core.migrateLegacyChildParams({ gasto: 60000, childAnnual: 8000, childStartAge: 30, childEndAge: 34 });
  assert.deepEqual(migratedFromChildAnnual, { gasto: 60000 });
  const migratedFromNur = core.migrateLegacyChildParams({ gasto: 60000, nur: 8000 });
  assert.deepEqual(migratedFromNur, { gasto: 60000 });
});

console.log('children-costs.test.js: definitions loaded (node:test runs the tests above)');
