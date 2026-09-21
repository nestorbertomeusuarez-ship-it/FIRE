const assert = require('node:assert/strict');
const core = require('../simulation-core.js');
const a = core.seededRandom(42), b = core.seededRandom(42);
assert.deepEqual([a(),a(),a()], [b(),b(),b()], 'seeded PRNG must reproduce paths');
assert.equal(core.progressiveSavingsTax(6000), 1140);
assert.equal(core.progressiveSavingsTax(7000), 1350, 'second bracket applies only above €6k');
assert.equal(core.netAfterSavingsTax(1000, 0, 0), 1000, 'principal is never gains-taxed');
assert.ok(core.netAfterSavingsTax(1000, .5, 0) > 900, 'only gain fraction is taxed');
const gross = core.grossForNetSavings(10000, 1, 0, 20000);
assert.ok(Math.abs(core.netAfterSavingsTax(gross, 1, 0)-10000) < .01, 'progressive gross-up settles the requested net withdrawal');
assert.deepEqual(core.boundedPair(0, 6, 0, 36), {low:0, high:6, changed:true}, 'sensitivity respects input min');
assert.equal(core.standardErrorProportion(.5, 100), .05);

assert.deepEqual(core.validateAllocation({ cash: 10, bonds: 30, equities: 60 }), { cash: 10, bonds: 30, equities: 60 });
assert.throws(() => core.validateAllocation({ cash: 10, bonds: 30, equities: 50 }), /100/);
assert.throws(() => core.validateAllocation({ cash: -1, bonds: 51, equities: 50 }), /nonnegative/);
assert.equal(core.monthlyRetirementCashflow({
  age: 67, year: 2045, month: 6,
  child: { monthlyCost: 300, startAge: 40, endAge: 70 },
  recurringIncome: [{ amount: 12000, startAge: 67, endAge: 100 }],
  healthcare: [{ amount: 2400, startAge: 65, endAge: 100 }],
  lumpSums: [{ year: 2045, month: 6, amount: -5000 }, { year: 2045, month: 7, amount: 9000 }]
}), -4500);
assert.deepEqual(core.validateHorizon({ currentAge: 40, endAge: 90, startAge: 41 }), { currentAge: 40, endAge: 90, startAge: 41, years: 50 });
assert.throws(() => core.validateHorizon({ currentAge: 40, endAge: 130, startAge: 41 }), /horizon/);
const exportFixture = [{ id: 'a', name: '<scenario>', color: '#1F7A4D', visible: true, target: 100, successRate: .5, ageMed: '50', series: [{ year: 2040, p10: 10, p50: 20, p90: 30 }], params: { seed: null } }];
const exported = core.exportScenarioJson(exportFixture);
assert.equal(core.importScenarioJson(exported, ['seed'], ['#1F7A4D']).length, 1);
assert.equal(core.importScenarioJson('{\"scenarios\":[{\"__proto__\":{}}]}', ['seed'], ['#1F7A4D']).length, 0);

const lumpSumScenario = [{ ...exportFixture[0], params: { seed: null, lumpSums: '[{\"year\":2030,\"month\":1,\"amount\":-500}]' } }];
assert.equal(core.importScenarioJson(core.exportScenarioJson(lumpSumScenario), ['seed','lumpSums'], ['#1F7A4D']).length, 1, 'valid imported payment schedules are retained');
console.log('simulation-core invariants: OK');
