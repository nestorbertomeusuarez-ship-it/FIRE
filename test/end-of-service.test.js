const assert = require('node:assert/strict');
const test = require('node:test');
const core = require('../simulation-core.js');

test('UAE gratuity days: 21/year for 5 years, 30/year after, nothing before 1 year, capped at 2 years', () => {
  assert.equal(core.gratuityDays(0.5), 0);
  assert.equal(core.gratuityDays(1), 21);
  assert.equal(core.gratuityDays(5), 105);
  assert.equal(core.gratuityDays(10), 255);
  assert.equal(core.gratuityDays(40), 730);
});

test('Emirates pays the higher of gratuity and Provident, never both', () => {
  // 10 years, basic 30,000 AED/month, fx 0.25: gratuity = 255 days * 1,000 AED * 0.25 = 63,750 EUR.
  const base = { years: 10, basicAED: 30000, fx: 0.25 };
  assert.equal(core.endOfServiceTopUp({ ...base, provBalance: 200000, provOn: true }), 0, 'Provident higher: no extra payment');
  assert.equal(core.endOfServiceTopUp({ ...base, provBalance: 50000, provOn: true }), 13750, 'gratuity higher: only the difference is added');
  assert.equal(core.endOfServiceTopUp({ ...base, provBalance: 0, provOn: false }), 63750, 'Provident not modelled: full gratuity');
});

test('legacy gratuityYears is dropped from saved scenarios', () => {
  const migrated = core.migrateLegacyParams({ gasto: 50000, gratuityYears: 5 });
  assert.deepEqual(Object.keys(migrated), ['gasto']);
});

test('normalizeScenarios migrates legacy keys itself, whatever the caller', () => {
  const allowed = { gasto: 'number', childAnnual: 'number', childStartAge: 'number', childEndAge: 'number' };
  const legacy = [{ id: 'a', name: 'Viejo', color: '#1F7A4D', visible: true, params: { gasto: 50000, gratuityYears: 5, nur: 8000 },
    series: [{ year: 2030, p10: 1, p50: 2, p90: 3 }], target: 1000000, ageMed: '45', successRate: 0.8 }];
  const out = core.normalizeScenarios(legacy, allowed, ['#1F7A4D'], 4);
  assert.equal(out.length, 1, 'legacy scenario is kept, not rejected');
  assert.equal(out[0].params.childAnnual, 8000, 'nursery cost carried over');
  assert.equal('gratuityYears' in out[0].params, false, 'obsolete key dropped');
});

test('legacy life expectancy folds into the end age', () => {
  assert.deepEqual(core.migrateLegacyParams({ proMode: true, horizonAge: 95, lifeExpOn: true, lifeExp: 85 }), { proMode: true, horizonAge: 85 });
  assert.deepEqual(core.migrateLegacyParams({ proMode: true, horizonAge: 80, lifeExpOn: true, lifeExp: 85 }), { proMode: true, horizonAge: 80 });
  assert.deepEqual(core.migrateLegacyParams({ horizonAge: 95, lifeExpOn: false, lifeExp: 85 }), { horizonAge: 95 });
});

test('legacy life expectancy does not shorten the horizon without PRO mode', () => {
  assert.deepEqual(core.migrateLegacyParams({ proMode: false, horizonAge: 95, lifeExpOn: true, lifeExp: 85 }), { proMode: false, horizonAge: 95 });
});
