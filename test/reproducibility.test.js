const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../simulation-core.js');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const source = inline.slice(0, inline.indexOf('// Renderer shared by the inline chart')) + '\nglobalThis.__t={simulate,DEFAULTS,readParams,controls:el};';
const context = { console, Math, Float64Array, Int32Array, Uint8Array, Date, Infinity, NavlogCore: core, document: { getElementById: () => null }, globalThis: null };
context.globalThis = context; vm.createContext(context); vm.runInContext(source, context, { timeout: 5000 });
const { simulate, DEFAULTS, readParams, controls } = context.__t;
const plain = value => JSON.parse(JSON.stringify(value, (k, v) => ArrayBuffer.isView(v) ? Array.from(v) : v));

// Fast-retiring profile with every state-gated random draw enabled (profit share, LOL).
const gated = { ...DEFAULTS, proMode: true, seed: 5, startEq: 1200000, startBtc: 0, gasto: 30000, swr: 3.25, profitShareWeeks: 8, lolOn: true, lolAnnualProb: 4, horizonAge: 70 };

// 1) Path i sees the same random numbers whatever the path count is AND whatever OTHER paths consume.
//    N-independence alone also holds for one shared sequential stream, so the real test is the second half:
//    a shorter horizon makes every EARLIER path draw fewer numbers in total, which would shift all later paths
//    under a shared stream. Wealth after the first year must not move at all.
const tracked = { ...DEFAULTS, seed: 5, profitShareWeeks: 8, proMode: true, lolOn: true, lolAnnualProb: 4, debugTrackBuckets: true };
const early = (params, paths) => Array.from(simulate(params, paths).debug.earlyWealth);
const earlyBase = early(tracked, 60);
assert.equal(earlyBase.length, 60);
assert.ok(new Set(earlyBase).size > 50, 'paths really differ from each other (random draws are in play)');
assert.deepEqual(early(tracked, 120).slice(0, 60), earlyBase, 'the first 60 paths do not depend on N');
assert.deepEqual(early({ ...tracked, horizonAge: 45 }, 60), earlyBase, 'nor on how many numbers other paths draw (shorter horizon => fewer draws per path)');
assert.deepEqual(early({ ...tracked, swr: 3.6 }, 60), earlyBase, 'nor on a different withdrawal rate (retirement dates move)');
const small = simulate(gated, 30), large = simulate(gated, 90);
assert.deepEqual(Array.from(small.fireMonthAll), Array.from(large.fireMonthAll.slice(0, 30)), 'first 30 paths identical whatever N is');
assert.deepEqual(Array.from(small.ruinMonth), Array.from(large.ruinMonth.slice(0, 30)));
assert.deepEqual(Array.from(small.licenseLossOut), Array.from(large.licenseLossOut.slice(0, 30)));

// 2) Changing only the withdrawal rate moves the target, never the pre-retirement random draws.
//    (The shared sequential RNG used to shift here: paths that retire earlier stop drawing
//    profit-share/LOL numbers, which moved every later path's market draws.)
const shared = { ...DEFAULTS, seed: 5, profitShareWeeks: 8 };
// A Loss-of-License exit does not depend on swr, so only voluntary FIRE dates can make the runs diverge.
const earliestFire = result => Math.min(...Array.from(result.fireMonthAll).filter((month, k) => month >= 0 && !result.licenseLossOut[k] && !result.forcedOut[k]));
for (const overrides of [{}, { proMode: true, lolOn: true, lolAnnualProb: 4 }]) {
  const swrLow = simulate({ ...shared, ...overrides, swr: 3.25 }, 300), swrHigh = simulate({ ...shared, ...overrides, swr: 3.5 }, 300);
  const quiet = Math.floor((Math.min(earliestFire(swrLow), earliestFire(swrHigh)) - 1) / 12); // whole years before anyone retires
  assert.ok(quiet >= 3, 'scenario has several pre-retirement years to compare (got ' + quiet + ')');
  for (const key of ['p10', 'p25', 'p50', 'p75', 'p90']) {
    assert.deepEqual(swrHigh.series.slice(0, quiet).map(x => x[key]), swrLow.series.slice(0, quiet).map(x => x[key]),
      key + ' identical before any path retires when only swr changes (' + JSON.stringify(overrides) + ')');
  }
}
// Same check without profit share keeps holding.
const plainA = simulate({ ...DEFAULTS, seed: 5, swr: 3.25 }, 100), plainB = simulate({ ...DEFAULTS, seed: 5, swr: 3.5 }, 100);
assert.deepEqual(plainA.series.slice(0, 4).map(x => x.p50), plainB.series.slice(0, 4).map(x => x.p50));

// 4) Seeds: zero is a real seed with its own stream; unseeded runs differ between calls.
const zeroA = simulate({ ...DEFAULTS, seed: 0 }, 20), zeroB = simulate({ ...DEFAULTS, seed: 0 }, 20);
assert.deepEqual(plain(zeroA), plain(zeroB), 'seed 0 reproduces');
const aliased = simulate({ ...DEFAULTS, seed: 0x9e3779b9 }, 20);
assert.notDeepEqual(plain(zeroA.series), plain(aliased.series), 'seed 0 no longer aliases the old fallback seed');
const oneSeed = simulate({ ...DEFAULTS, seed: 1 }, 20);
assert.notDeepEqual(plain(zeroA.series), plain(oneSeed.series), 'seed 0 differs from seed 1');
const random1 = simulate({ ...DEFAULTS, seed: null, vol: 20 }, 20), random2 = simulate({ ...DEFAULTS, seed: null, vol: 20 }, 20);
assert.notDeepEqual(plain(random1.series), plain(random2.series), 'null seed is random, not reproducible');
assert.throws(() => simulate({ ...DEFAULTS, seed: NaN }, 4), /semilla/i, 'NaN seed is rejected instead of aliasing seed 0');
assert.throws(() => simulate({ ...DEFAULTS, seed: -1 }, 4), /semilla/i);

// 5) The seed control goes through NavlogCore.normalizeSeed.
for (const [text, expected] of [['', null], ['  ', null], ['0', 0], ['12', 12], ['4294967295', 4294967295]]) {
  controls.seed = { type: 'number', value: text, min: '0', max: '4294967295' };
  assert.equal(readParams().seed, expected, 'seed control "' + text + '"');
}
// A non-empty seed that is not a valid integer must be refused loudly, never silently turned into a random run.
for (const text of ['7.9', '-3', '99999999999', 'abc', '4294967296', '1e3x']) {
  controls.seed = { type: 'number', value: text, min: '0', max: '4294967295' };
  assert.throws(() => readParams(), /semilla/i, 'seed control "' + text + '" is rejected with a Spanish message');
}
controls.seed = null;
console.log('reproducibility: OK');
