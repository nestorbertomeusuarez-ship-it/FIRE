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
