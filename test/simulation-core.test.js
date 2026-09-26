const assert = require('node:assert/strict');
const core = require('../simulation-core.js');
const a = core.seededRandom(42), b = core.seededRandom(42);
assert.deepEqual([a(),a(),a()], [b(),b(),b()], 'seeded PRNG must reproduce paths');
assert.equal(core.progressiveSavingsTax(6000), 1140);
assert.equal(core.netMonthlyReturn(.01, 0), .01, 'zero fee preserves gross monthly return');
assert.ok(core.netMonthlyReturn(.01, 1) < .01, 'annual fee reduces the monthly return');
assert.equal(core.netMonthlyReturn(.01, 101), -1, 'out-of-range annual fees cannot produce NaN returns');
assert.ok(core.historicalWithdrawalBacktest([.10], 1000, 0, 1, 1)[0].finalBalance < 1100, 'historical backtests apply the configured annual equity cost');
assert.equal(core.generalIncomeTax(50000, 'catalonia'), 14465.75, '2025 individual general IRPF combines state and Catalan scales without deductions');
assert.equal(core.generalIncomeTax(50000, 'valencian-community'), 14230.75, '2025 individual general IRPF combines state and Valencian scales without deductions');
for (const [region, ytd, net] of [['catalonia', 0, 10000], ['valencian-community', 49000, 3000]]) {
  const gross = core.grossForNetGeneralIncome(net, ytd, region, 1e6);
  assert.ok(Math.abs(core.netAfterGeneralIncomeTax(gross, ytd, region) - net) < 1e-3, 'regional IRPF gross-up round-trips');
}
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

// ---- boundedPair: open-ended ranges (no min/max) must never yield NaN ----
assert.deepEqual(core.boundedPair(3600, 360, undefined, undefined), { low: 3240, high: 3960, changed: true }, 'boundedPair without min/max is unbounded');
assert.deepEqual(core.boundedPair(10, 5, 8, undefined), { low: 8, high: 15, changed: true }, 'only a lower bound');
assert.deepEqual(core.boundedPair(10, 5, undefined, 12), { low: 5, high: 12, changed: true }, 'only an upper bound');
assert.deepEqual(core.boundedPair(0, 0, undefined, undefined), { low: 0, high: 0, changed: false }, 'zero delta is unchanged, not NaN');

// ---- boundedPair: a one-sided clamp inverts when the whole raw interval sits
// outside [min,max] (both bounds present). Each endpoint must be clamped into
// [min,max] independently, mirroring index-publico.html's local boundedPair.
assert.deepEqual(core.boundedPair(1400, 140, 1800, 7000), { low: 1800, high: 1800, changed: false }, 'interval entirely below min collapses to min, not an inverted pair');
assert.deepEqual(core.boundedPair(8000, 140, 1800, 7000), { low: 7000, high: 7000, changed: false }, 'interval entirely above max collapses to max, not an inverted pair');

// ---- normalizeSeed: one gate for every seed source ----
assert.equal(core.normalizeSeed(''), null, 'empty seed is random');
assert.equal(core.normalizeSeed('   '), null, 'blank seed is random');
assert.equal(core.normalizeSeed(null), null);
assert.equal(core.normalizeSeed(undefined), null);
assert.equal(core.normalizeSeed(NaN), null);
assert.equal(core.normalizeSeed('abc'), null);
assert.equal(core.normalizeSeed(Infinity), null);
assert.equal(core.normalizeSeed(-1), null, 'negative seeds are not valid');
assert.equal(core.normalizeSeed(4294967296), null, 'seed above uint32 is not valid');
assert.equal(core.normalizeSeed(0), 0, 'seed zero is a valid deterministic seed');
assert.equal(core.normalizeSeed('0'), 0);
assert.equal(core.normalizeSeed('42'), 42);
assert.equal(core.normalizeSeed(42.9), 42, 'fractional seeds are truncated');
assert.equal(core.normalizeSeed(4294967295), 4294967295);
assert.notEqual(core.seededRandom(0)(), core.seededRandom(0x9e3779b9)(), 'seed zero has its own stream distinct from the old fallback');

// ---- per-path RNG: (seed, path) fully determines the stream ----
const draws = (rng, n) => Array.from({ length: n }, () => rng());
assert.deepEqual(draws(core.pathRandom(5, 3), 5), draws(core.pathRandom(5, 3), 5), 'same (seed, path) reproduces');
assert.notDeepEqual(draws(core.pathRandom(5, 3), 5), draws(core.pathRandom(5, 4), 5), 'different paths differ');
assert.notDeepEqual(draws(core.pathRandom(5, 3), 5), draws(core.pathRandom(6, 3), 5), 'different seeds differ');
assert.notDeepEqual(draws(core.pathRandom(5, 3, 0), 5), draws(core.pathRandom(5, 3, 1), 5), 'streams of one path are independent');
assert.notDeepEqual(draws(core.pathRandom(0, 0), 5), draws(core.pathRandom(0x9e3779b9, 0), 5), 'seed zero does not alias another seed');
assert.ok(draws(core.pathRandom(0, 7), 1000).every(v => v >= 0 && v < 1), 'draws stay in [0,1)');

// ---- savings-tax brackets: every boundary and the >300k region ----
const BRACKET_TAX = [[0, 0], [6000, 1140], [50000, 1140 + 44000 * .21], [200000, 1140 + 44000 * .21 + 150000 * .23],
  [300000, 1140 + 44000 * .21 + 150000 * .23 + 100000 * .27], [400000, 1140 + 44000 * .21 + 150000 * .23 + 100000 * .27 + 100000 * .30]];
for (const [gain, tax] of BRACKET_TAX) assert.ok(Math.abs(core.progressiveSavingsTax(gain) - tax) < 1e-6, 'progressive tax at ' + gain + ' = ' + tax + ' (got ' + core.progressiveSavingsTax(gain) + ')');
assert.ok(Math.abs(core.progressiveSavingsTax(400000) - 101880) < 1e-6, '30% bracket applies above 300k');
assert.ok(Math.abs(core.progressiveSavingsTax(1000000) - (101880 + 600000 * .30)) < 1e-6);
assert.ok(Math.abs(core.progressiveSavingsTax(6000.01) - (1140 + .01 * .21)) < 1e-9, 'just above the first boundary uses 21%');
assert.ok(Math.abs(core.progressiveSavingsTax(300000.01) - (core.progressiveSavingsTax(300000) + .01 * .30)) < 1e-9, 'just above 300k uses 30%');
assert.equal(core.progressiveSavingsTax(-5), 0, 'negative gains give zero tax');
// exact net values: 100000 fully gain, no earlier YTD gains => tax on 100000
assert.ok(Math.abs(core.netAfterSavingsTax(100000, 1, 0) - (100000 - core.progressiveSavingsTax(100000))) < 1e-6);
assert.ok(Math.abs(core.netAfterSavingsTax(100000, 1, 0) - 100000 + 1140 + 44000 * .21 + 50000 * .23) < 1e-6, 'exact net after 100k gain');
assert.ok(Math.abs(core.netAfterSavingsTax(100000, 1, 300000) - 70000) < 1e-6, 'all-gain withdrawal above 300k YTD nets 70%');
assert.ok(Math.abs(core.netAfterSavingsTax(100000, .5, 300000) - 85000) < 1e-6, 'half-gain withdrawal above 300k YTD nets 85%');
assert.ok(Math.abs(core.netAfterSavingsTax(100000, 1, 250000) - (100000 - (50000 * .27 + 50000 * .30))) < 1e-6, 'a withdrawal straddling 300k mixes 27% and 30%');
assert.equal(core.netAfterSavingsTax(100000, 2, 0), core.netAfterSavingsTax(100000, 1, 0), 'gain fraction is clamped to 1');
assert.equal(core.netAfterSavingsTax(100000, -1, 0), 100000, 'gain fraction is clamped to 0');
for (const [need, frac, ytd] of [[10000, 1, 0], [50000, .6, 280000], [90000, 1, 5000], [25000, .3, 400000]]) {
  const g = core.grossForNetSavings(need, frac, ytd, 1e7);
  assert.ok(Math.abs(core.netAfterSavingsTax(g, frac, ytd) - need) < 1e-3, 'gross-up round-trip for net ' + need + ' (frac ' + frac + ', ytd ' + ytd + ')');
  assert.ok(g >= need, 'gross is never below the net requested');
}
assert.equal(core.grossForNetSavings(0, 1, 0, 1000), 0);
assert.equal(core.grossForNetSavings(500, 1, 0, 0), 0);
assert.ok(core.grossForNetSavings(1e9, 1, 0, 1000) <= 1000, 'gross is capped at the available balance');
console.log('simulation-core extended invariants: OK');

// ---- deriveSeed: sensitivity/stress seeds are never NaN and always valid ----
assert.equal(core.deriveSeed(null, 3), 20260924, 'random base seed falls back to a fixed sensitivity seed');
assert.equal(core.deriveSeed('', 0), 20260921);
assert.equal(core.deriveSeed(NaN, 1), 20260922);
assert.equal(core.deriveSeed(10, 5), 15);
assert.equal(core.deriveSeed(0, 0), 0, 'seed zero is preserved');
assert.equal(core.deriveSeed(4294967295, 2), 1, 'offset wraps inside uint32 instead of leaving the valid range');
for (const base of [null, 0, 7, 4294967295]) for (let offset = 0; offset < 8; offset++) assert.notEqual(core.normalizeSeed(core.deriveSeed(base, offset)), null, 'derived seed is valid');
console.log('simulation-core seed derivation: OK');

// ---- scenario import/storage hardening ----
const goodScenario = { id: 'ok1', name: 'Base', color: '#1F7A4D', visible: true, target: 100, successRate: .5, ageMed: '50', series: [{ year: 2040, p10: 10, p25: 15, p50: 20, p75: 25, p90: 30, idx: 3, contrib50: 5 }], params: { seed: 0, ageNow: 28 } };
const keysOk = ['seed', 'ageNow'], colorsOk = ['#1F7A4D'];
const cleaned = core.normalizeScenarios([{ ...goodScenario, evil: 'x', constructor: 'y', series: [{ ...goodScenario.series[0], onload: 'alert(1)' }] }], keysOk, colorsOk);
assert.equal(cleaned.length, 1);
assert.deepEqual(Object.keys(cleaned[0]).sort(), ['ageMed', 'color', 'id', 'name', 'params', 'series', 'successRate', 'target', 'visible'], 'only whitelisted scenario fields survive');
assert.deepEqual(Object.keys(cleaned[0].series[0]).sort(), ['contrib50', 'idx', 'p10', 'p25', 'p50', 'p75', 'p90', 'year'], 'only numeric chart fields survive in the series');
assert.equal(cleaned[0].params.seed, 0, 'seed zero survives import');
assert.notStrictEqual(cleaned[0], goodScenario, 'result is a copy, never the untrusted object');
// prototype pollution keys, own "__proto__" from JSON.parse, huge/wrong-typed payloads
const polluted = JSON.parse('{"version":1,"scenarios":[{"id":"p1","name":"x","color":"#1F7A4D","visible":true,"target":1,"successRate":0.5,"ageMed":"1","series":[{"year":1,"p10":1,"p50":1,"p90":1}],"params":{"__proto__":{"isAdmin":true},"seed":null},"__proto__":{"polluted":true}}]}');
assert.equal(core.normalizeScenarios(polluted.scenarios, keysOk, colorsOk).length, 0, 'own __proto__ params key is rejected');
core.importScenarioJson(JSON.stringify({ version: 1, scenarios: [] }).replace('[]', '[{"__proto__":{"polluted":1}},{"constructor":{"prototype":{"polluted":1}}}]'), keysOk, colorsOk);
assert.equal({}.polluted, undefined, 'Object.prototype is never polluted');
assert.equal(core.normalizeScenarios([{ ...goodScenario, params: { constructor: 1 } }], keysOk, colorsOk).length, 0, 'constructor is not an allowed parameter');
assert.equal(core.normalizeScenarios([{ ...goodScenario, params: { seed: -1 } }], keysOk, colorsOk).length, 0, 'invalid seed in a saved scenario');
assert.equal(core.normalizeScenarios([{ ...goodScenario, params: { seed: 1.5 } }], keysOk, colorsOk).length, 0, 'fractional seed');
assert.equal(core.normalizeScenarios([{ ...goodScenario, params: { seed: 4294967296 } }], keysOk, colorsOk).length, 0, 'oversized seed');
assert.equal(core.normalizeScenarios([{ ...goodScenario, params: { ageNow: '28' } }], keysOk, colorsOk).length, 0, 'numeric strings are refused');
assert.equal(core.normalizeScenarios([{ ...goodScenario, ageMed: 'x'.repeat(5000) }], keysOk, colorsOk).length, 0, 'oversized ageMed');
assert.equal(core.normalizeScenarios([{ ...goodScenario, id: '<b>' }], keysOk, colorsOk).length, 0, 'ids are restricted to a safe alphabet');
assert.equal(core.normalizeScenarios([{ ...goodScenario, name: 'n'.repeat(61) }], keysOk, colorsOk).length, 0, 'oversized names');
assert.equal(core.normalizeScenarios([{ ...goodScenario, series: Array.from({ length: 101 }, (_, i) => ({ year: i, p10: 1, p50: 1, p90: 1 })) }], keysOk, colorsOk).length, 0, 'oversized series');
assert.equal(core.normalizeScenarios([{ ...goodScenario, series: [{ year: 1, p10: 1, p50: 'NaN', p90: 1 }] }], keysOk, colorsOk).length, 0, 'non numeric series values');
assert.deepEqual(core.normalizeScenarios({ length: 1, 0: goodScenario }, keysOk, colorsOk), [], 'array-likes are not arrays');
assert.deepEqual(core.normalizeScenarios(null, keysOk, colorsOk), []);
assert.deepEqual(core.normalizeScenarios('[]', keysOk, colorsOk), []);
// A flood of valid scenarios is capped, and the work is bounded deterministically: count how many entries are inspected.
let inspected = 0;
const flood = Array.from({ length: 50000 }, (_, i) => Object.defineProperty({ ...goodScenario }, 'id', { enumerable: true, get() { inspected++; return 'f' + i; } }));
assert.equal(core.normalizeScenarios(flood, keysOk, colorsOk).length, 4, 'a flood of valid scenarios is capped');
assert.ok(inspected <= 1000 * 8, 'at most the first 1000 entries are inspected (id reads: ' + inspected + ')');
assert.equal(core.importScenarioJson('x'.repeat(2000001), keysOk, colorsOk).length, 0, 'import size cap');
assert.equal(core.importScenarioJson('{"version":2,"scenarios":[]}', keysOk, colorsOk).length, 0, 'unknown version');
assert.equal(core.importScenarioJson('not json', keysOk, colorsOk).length, 0, 'bad JSON never throws');
assert.equal(core.importScenarioJson('[' + JSON.stringify(goodScenario) + ',{"junk":1}]', keysOk, colorsOk).length, 1, 'malformed entries are dropped, valid ones kept');
console.log('scenario hardening: OK');

// ---- pathRandom quality: 128-bit state, no replayed windows, uniform output ----
{
  // With a 32-bit state every generator is a window on ONE 2^32 cycle, so a path can replay another path's
  // draws time-shifted. Detect it: index every generator's first two outputs, then scan the next draws of all generators.
  const generators = 6000, scan = 2000, firstPairs = new Map();
  const pair = (a, b) => a * 4294967296 + b;
  for (let g = 0; g < generators; g++) {
    const rng = core.pathRandom(12345, g, g % 2);
    const a = Math.floor(rng() * 4294967296), b = Math.floor(rng() * 4294967296);
    firstPairs.set(pair(a, b), g);
  }
  let replays = 0;
  for (let g = 0; g < generators; g++) {
    const rng = core.pathRandom(12345, g, g % 2);
    let previous = Math.floor(rng() * 4294967296);
    for (let step = 0; step < scan; step++) {
      const next = Math.floor(rng() * 4294967296);
      const owner = firstPairs.get(pair(previous, next));
      if (owner !== undefined && !(owner === g && step === 0)) replays++;
      previous = next;
    }
  }
  assert.equal(replays, 0, 'no path replays a time-shifted copy of another path stream (found ' + replays + ')');
}
{
  const rng = core.pathRandom(2026, 17, 0), n = 400000; let sum = 0, sumSq = 0, buckets = new Array(10).fill(0);
  for (let i = 0; i < n; i++) { const v = rng(); sum += v; sumSq += v * v; buckets[Math.floor(v * 10)]++; }
  const mean = sum / n, variance = sumSq / n - mean * mean;
  assert.ok(Math.abs(mean - .5) < .004, 'uniform mean ~ 0.5 (got ' + mean + ')');
  assert.ok(Math.abs(variance - 1 / 12) < .002, 'uniform variance ~ 1/12 (got ' + variance + ')');
  for (const count of buckets) assert.ok(Math.abs(count / n - .1) < .004, 'deciles are even');
}
{
  // draws are a pure function of (seed, path, stream): consuming other generators (or none) changes nothing
  const solo = Array.from({ length: 8 }, ((rng) => () => rng())(core.pathRandom(9, 4, 0)));
  const noisy = core.pathRandom(9, 4, 0), other = core.pathRandom(9, 5, 0);
  const interleaved = []; for (let i = 0; i < 8; i++) { other(); other(); interleaved.push(noisy()); }
  assert.deepEqual(interleaved, solo, 'draw count of other generators is irrelevant');
  const triples = new Set(); for (let seed = 0; seed < 5; seed++) for (let path = 0; path < 20; path++) for (let stream = 0; stream < 3; stream++) triples.add(core.pathRandom(seed, path, stream)().toString() + core.pathRandom(seed, path, stream)().toString());
  assert.equal(triples.size, 5 * 20 * 3, 'every (seed, path, stream) triple gives a different sequence');
  assert.equal(core.pathRandom(1, 0, 0)().toString().length > 3, true);
}
console.log('pathRandom quality: OK');

// ---- strict per-key parameter typing in stored/imported scenarios ----
{
  const types = { seed: 'seed', ageNow: 'number', proMode: 'boolean', lumpSums: 'lumpSums' };
  const scenario = params => ({ id: 'ty1', name: 'T', color: '#1F7A4D', visible: true, target: 1, successRate: .5, ageMed: '1', series: [{ year: 2030, p10: 1, p50: 2, p90: 3 }], params });
  const accepted = params => core.normalizeScenarios([scenario(params)], types, ['#1F7A4D']).length === 1;
  const goodLump = [{ year: 2030, month: 6, amount: -100 }];
  assert.equal(accepted({ seed: null, ageNow: 30, proMode: true, lumpSums: JSON.stringify(goodLump) }), true, 'well-typed parameters pass');
  assert.equal(accepted({ lumpSums: goodLump }), true, 'a validated array schedule passes');
  for (const bad of [{ seed: true }, { seed: '5' }, { seed: -1 }, { seed: 1.5 }, { seed: 4294967296 }, { seed: 0.5 },
    { ageNow: true }, { ageNow: '30' }, { ageNow: NaN }, { ageNow: null }, { proMode: 1 }, { proMode: 'true' }, { proMode: null },
    { lumpSums: true }, { lumpSums: 5 }, { lumpSums: null }, { lumpSums: '{}' }, { lumpSums: '[{"year":1,"month":1,"amount":1}]' }, { lumpSums: [{ year: 2030 }] }, { lumpSums: Array.from({ length: 101 }, () => goodLump[0]) }, { lumpSums: 'x'.repeat(13000) }])
    assert.equal(accepted(bad), false, 'rejected: ' + JSON.stringify(bad).slice(0, 60));
  // legacy array form: only numbers (plus seed / lumpSums with their own rules) are accepted
  assert.equal(core.normalizeScenarios([scenario({ ageNow: true })], ['ageNow'], ['#1F7A4D']).length, 0, 'array form: booleans are not numbers');
  assert.equal(core.normalizeScenarios([scenario({ seed: true })], ['seed'], ['#1F7A4D']).length, 0, 'array form: seed:true rejected');
  assert.equal(core.normalizeScenarios([scenario({ lumpSums: 3 })], ['lumpSums'], ['#1F7A4D']).length, 0, 'array form: numeric lumpSums rejected');
  assert.equal(core.normalizeScenarios([scenario({ ageNow: 30 })], ['ageNow'], ['#1F7A4D']).length, 1);
  // ageNow below 18 gets its own message
  assert.throws(() => core.validateHorizon({ currentAge: 17, endAge: 60, startAge: 17 }), /Current age/, 'age below 18');
  assert.throws(() => core.validateHorizon({ currentAge: 40, endAge: 130, startAge: 40 }), /horizon/, 'horizon problems keep their message');
  assert.throws(() => core.validateHorizon({ currentAge: 40, endAge: 40, startAge: 40 }), /horizon/);
  assert.doesNotThrow(() => core.validateHorizon({ currentAge: 18, endAge: 60, startAge: 18 }));
}
console.log('strict scenario typing: OK');

// ---- outcome categories are mutually exclusive and exhaustive ----
{
  const n = 10;
  const fireMonthAll = Int32Array.from([5, 5, 5, 5, -1, -1, -1, 7, 7, -1]);
  const forcedOut = Uint8Array.from([0, 0, 1, 0, 0, 0, 0, 0, 0, 0]);
  const licenseLossOut = Uint8Array.from([0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
  const ruined = Uint8Array.from([0, 1, 1, 0, 1, 0, 0, 1, 0, 1]);
  const counts = core.retirementCohortCounts({ fireMonthAll, forcedOut, licenseLossOut, ruined }, n);
  assert.deepEqual(counts, { voluntary: 4, voluntaryRuined: 2, forced: 1, licenseLoss: 1, preFireRuin: 2, noRetirement: 2 });
  assert.equal(counts.voluntary + counts.forced + counts.licenseLoss + counts.preFireRuin + counts.noRetirement, n, 'categories sum to N');
  assert.ok(counts.voluntaryRuined <= counts.voluntary, 'voluntary ruin is a subset of voluntary FIRE, not a separate category');
}
console.log('outcome categories: OK');

// ---- pathRandom seeding uses the FULL (seed, path, stream) triple for every state word ----
{
  // If the four state words were all derived from one 32-bit hash, ~19 % of seeds would show a duplicate among
  // 40000 (path, stream) pairs (birthday bound). With independent 128-bit seeding no seed may show any duplicate.
  let duplicates = 0;
  for (let seed = 0; seed < 40; seed++) {
    const seen = new Set();
    for (let path = 0; path < 20000; path++) for (let stream = 0; stream < 2; stream++) {
      const rng = core.pathRandom(seed * 7919 + 13, path, stream);
      const key = rng() + ':' + rng() + ':' + rng();
      if (seen.has(key)) duplicates++; else seen.add(key);
    }
  }
  assert.equal(duplicates, 0, 'no two (path, stream) pairs of one seed share their opening draws (found ' + duplicates + ')');
}
console.log('pathRandom seeding: OK');

// ---- progressiveTax: bracket edges, exact thresholds, and non-positive bases ----
{
  const brackets = [{ upTo: 100, rate: 0.10 }, { upTo: 300, rate: 0.20 }, { upTo: Infinity, rate: 0.30 }];
  assert.equal(core.progressiveTax(0, brackets), 0, 'zero base pays no tax');
  assert.equal(core.progressiveTax(-500, brackets), 0, 'a negative base is clamped to zero, never a negative tax');
  assert.equal(core.progressiveTax(100, brackets), 10, 'exactly at the first threshold stays inside the first bracket (10% of 100)');
  assert.equal(core.progressiveTax(100.01, brackets), 10 + 0.01 * 0.20, 'one cent above the threshold spills into the second bracket only on the marginal cent');
  assert.equal(core.progressiveTax(300, brackets), 10 + 200 * 0.20, 'exactly at the second threshold stays inside the second bracket');
  assert.equal(core.progressiveTax(1000, brackets), 10 + 200 * 0.20 + 700 * 0.30, 'above every finite threshold taxes the remainder at the open top bracket');
  assert.equal(core.progressiveTax(undefined, brackets), 0, 'a non-numeric base is treated as zero, never NaN');
}
console.log('progressiveTax bracket edges: OK');

// ---- validateLumpSums: valid and invalid payment schedules ----
{
  assert.deepEqual(core.validateLumpSums([]), [], 'an empty schedule is valid');
  assert.deepEqual(core.validateLumpSums([{ year: 2030, month: 6, amount: -1500 }]), [{ year: 2030, month: 6, amount: -1500 }], 'a well-formed entry round-trips with only its three fields kept');
  assert.throws(() => core.validateLumpSums('not-an-array'), /at most 100/, 'a non-array schedule is rejected');
  assert.throws(() => core.validateLumpSums(new Array(101).fill({ year: 2030, month: 1, amount: 1 })), /at most 100/, 'more than 100 payments is rejected');
  assert.throws(() => core.validateLumpSums([{ year: 2025, month: 1, amount: 1 }]), /2026/, 'a year before the supported window is rejected');
  assert.throws(() => core.validateLumpSums([{ year: 2107, month: 1, amount: 1 }]), /2106/, 'a year after the supported window is rejected');
  assert.throws(() => core.validateLumpSums([{ year: 2030, month: 0, amount: 1 }]), /month/, 'month 0 is rejected');
  assert.throws(() => core.validateLumpSums([{ year: 2030, month: 13, amount: 1 }]), /month/, 'month 13 is rejected');
  assert.throws(() => core.validateLumpSums([{ year: 2030, month: 1, amount: 10000001 }]), /10,000,000/, 'an amount above the cap is rejected');
  assert.throws(() => core.validateLumpSums([{ year: 2030, month: 1, amount: NaN }]), /10,000,000/, 'a non-finite amount is rejected');
}
console.log('validateLumpSums valid/invalid schedules: OK');

// ---- canonicalParameterFingerprint: key order never changes the fingerprint ----
{
  const a = { b: 1, a: { y: 2, x: [1, 2, 3] }, c: 'text' };
  const b = { c: 'text', a: { x: [1, 2, 3], y: 2 }, b: 1 };
  assert.equal(core.canonicalParameterFingerprint(a), core.canonicalParameterFingerprint(b), 'differently ordered keys at every nesting level produce the same fingerprint');
  assert.notEqual(core.canonicalParameterFingerprint({ a: 1, b: 2 }), core.canonicalParameterFingerprint({ a: 2, b: 1 }), 'different values still produce different fingerprints');
  assert.equal(core.canonicalParameterFingerprint(-0), '0', 'negative zero fingerprints the same as positive zero');
  assert.throws(() => core.canonicalParameterFingerprint(Infinity), /finite/, 'a non-finite number cannot be fingerprinted');
  assert.throws(() => core.canonicalParameterFingerprint(() => {}), /Unsupported/, 'a function cannot be fingerprinted');
}
console.log('canonicalParameterFingerprint key-order independence: OK');

// ---- providentFireTaxRate: FIRE-target haircut for the Provident balance (audit fix #1) ----
{
  assert.equal(core.providentFireTaxRate(100000, false, false, 30, 'catalonia'), 0, 'taxes off: no haircut regardless of mode');
  assert.equal(core.providentFireTaxRate(0, true, false, 30, 'catalonia'), 0, 'an empty balance has nothing to haircut');
  assert.equal(core.providentFireTaxRate(100000, true, false, 30, 'catalonia'), 0.30, 'flat mode uses the configured average rate directly');
  assert.equal(core.providentFireTaxRate(100000, true, false, 0, 'catalonia'), 0, 'a 0% flat rate is a 0% haircut');
  const withdrawal = 100000 / 10;
  const expectedRegional = core.generalIncomeTax(withdrawal, 'catalonia') / withdrawal;
  assert.equal(core.providentFireTaxRate(100000, true, true, 30, 'catalonia'), expectedRegional, 'regional mode uses the effective average rate of a 10-year withdrawal, not the flat taxRateProv');
  assert.ok(core.providentFireTaxRate(100000, true, true, 30, 'catalonia') > 0 && core.providentFireTaxRate(100000, true, true, 30, 'catalonia') < 1, 'the regional haircut is a genuine rate between 0 and 1');
}
console.log('providentFireTaxRate: OK');
