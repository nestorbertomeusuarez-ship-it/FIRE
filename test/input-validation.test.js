const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../simulation-core.js');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const source = inline.slice(0, inline.indexOf('// Renderer shared by the inline chart')) + '\nglobalThis.__t={simulate,DEFAULTS,readParams,validateSimulationParams,controls:el};';
const context = { console, Math, Float64Array, Int32Array, Uint8Array, Date, Infinity, NavlogCore: core, document: { getElementById: () => null }, globalThis: null };
context.globalThis = context; vm.createContext(context); vm.runInContext(source, context, { timeout: 5000 });
const { simulate, DEFAULTS, readParams, validateSimulationParams, controls } = context.__t;
// simulate() clamps the published snapshots with Math.max(0, ...), so p50 >= 0 could never fail. The
// debug hook (p.debugTrackBuckets) exposes the smallest UNCLAMPED bucket value / cost basis seen in any month.
const finiteSeries = result => result.series.every(x => [x.p10, x.p25, x.p50, x.p75, x.p90, x.contrib50].every(Number.isFinite) && x.p50 >= 0)
  && (result.debug === undefined || result.debug.minBucket >= -1e-6);

// A short horizon must not be rejected because a (zero-valued) pension / health / child age lies beyond it.
for (const horizonAge of [40, 60, 66]) {
  const result = simulate({ ...DEFAULTS, seed: 1, horizonAge }, 6);
  assert.ok(finiteSeries(result), 'horizon ' + horizonAge + ' gives finite results');
  assert.equal(result.series.length > 0, true);
}
// An interval that starts after the horizon simply never applies.
const beyond = simulate({ ...DEFAULTS, seed: 1, horizonAge: 50, pensionAnnual: 50000, pensionStartAge: 67, healthcareAnnual: 9000, healthcareStartAge: 80, childAnnual: 5000, childStartAge: 60, childEndAge: 70 }, 8);
const without = simulate({ ...DEFAULTS, seed: 1, horizonAge: 50 }, 8);
assert.deepEqual(beyond.series.map(x => x.p50), without.series.map(x => x.p50), 'income/costs that start after the horizon change nothing');
// Genuinely invalid ages are still rejected.
assert.throws(() => simulate({ ...DEFAULTS, childStartAge: 50, childEndAge: 40 }, 2), /hijo/, 'child end before start');
assert.throws(() => simulate({ ...DEFAULTS, pensionStartAge: 111 }, 2), /edades/, 'age above 110');
assert.throws(() => simulate({ ...DEFAULTS, pensionStartAge: -1 }, 2), /edades/, 'negative age');
assert.throws(() => simulate({ ...DEFAULTS, pensionStartAge: 67.5 }, 2), /edades/, 'fractional age');
assert.throws(() => simulate({ ...DEFAULTS, careerYear: 2100 }, 2), /inicio/, 'career after the horizon');

// No input may propagate NaN: empty / non-numeric / infinite values are blocked loudly, not simulated.
for (const bad of [NaN, Infinity, -Infinity]) assert.throws(() => simulate({ ...DEFAULTS, gasto: bad }, 2), /gasto/, 'gasto=' + bad);
assert.throws(() => simulate({ ...DEFAULTS, startEq: undefined }, 2), /startEq/);
assert.throws(() => simulate({ ...DEFAULTS, ret: null }, 2), /ret/);
assert.throws(() => simulate({ ...DEFAULTS, ret: '5' }, 2), /ret/, 'numeric strings are not silently coerced');
assert.throws(() => simulate({ ...DEFAULTS, lumpSums: '[{"year":2030,"month":13,"amount":1}]' }, 2), /pago|payment|month/i, 'malformed payment schedule');
assert.throws(() => simulate({ ...DEFAULTS, lumpSums: '{"__proto__":{}}' }, 2), /pagos|payments|list/i, 'schedule must be a list');
assert.throws(() => simulate({ ...DEFAULTS, allocCash: 50, allocBonds: 30, allocEquities: 30 }, 2), /100/, 'allocation must total 100');
for (const text of ['', '   ', 'abc', 'Infinity', '1e999']) {
  controls.gasto = { type: 'range', value: text, min: '25000', max: '130000' };
  assert.throws(() => readParams(), /gasto/, 'control text ' + JSON.stringify(text) + ' is refused');
}
controls.gasto = { type: 'range', value: '-5', min: '25000', max: '130000' };
assert.throws(() => readParams(), /rango/, 'below-range value is refused');
controls.gasto = { type: 'range', value: '1e12', min: '25000', max: '130000' };
assert.throws(() => readParams(), /rango/, 'huge value is refused');
controls.gasto = null;

// The hook itself: absent unless requested, and it reports real (unclamped) minima.
assert.equal(simulate({ ...DEFAULTS, seed: 1 }, 2).debug, undefined, 'no debug output unless requested');
const tracked = simulate({ ...DEFAULTS, seed: 1, debugTrackBuckets: true }, 4);
assert.ok(Number.isFinite(tracked.debug.minBucket) && tracked.debug.minBucket >= 0, 'buckets and cost bases never go negative in the default scenario');
// Stress: retired household paying wealth tax and spending from empty buckets, with every asset class active.
const stress = { ...DEFAULTS, seed: 11, proMode: true, debugTrackBuckets: true, startEq: 1500000, startBtc: 100000, startGold: 100000, gasto: 120000, swr: 8, horizonAge: 80,
  taxOn: true, useIrpfBrackets: true, taxRepatDelay: 0, wealthTaxOn: true, wealthExempt: 0, wealthRate: 3, reOn: true, reValue: 600000, reCountsFire: true, glideOn: true,
  glideTargetYear: 2035, lolOn: true, lolAnnualProb: 5, profitShareWeeks: 8, wdStrategy: 1, mortgageBalance: 200000, allocCash: 5, allocBonds: 15, allocEquities: 80 };
const stressed = simulate(stress, 40);
assert.ok(stressed.ruined.some(Boolean) && stressed.fireMonthAll.some(month => month >= 0), 'the stress scenario reaches drawdown and ruin, so bucket exhaustion is exercised');
assert.ok(stressed.debug.minBucket >= -1e-6, 'no bucket or cost basis goes negative even when every bucket is exhausted (min ' + stressed.debug.minBucket + ')');

// Working household whose costs exceed its income: deficits drain cash, bonds, equities, BTC, gold in turn.
const deficitHousehold = { ...DEFAULTS, seed: 5, proMode: true, debugTrackBuckets: true, startEq: 60000, startBtc: 20000, startGold: 20000, goldAporte: 0, salFO: 280000, salCA: 420000,
  vida: 7000, hip: 1400, gasto: 130000, swr: 2.4, allocCash: 10, allocBonds: 20, allocEquities: 70, reOn: true, reValue: 100000, reCountsFire: true };
const deficitResult = simulate(deficitHousehold, 30);
assert.ok(deficitResult.debug.minBucket >= -1e-6, 'deficits never push a bucket or basis below zero (min ' + deficitResult.debug.minBucket + ')');
assert.ok(Array.from(deficitResult.ruined).filter(Boolean).length >= 10, 'the household cannot fund itself, so buckets are exhausted');

// Every numeric control at its minimum and maximum yields finite results (or a clear validation error).
const tag = key => (html.match(new RegExp('<(?:input|select)[^>]*id="' + key + '"[^>]*>')) || [''])[0];
const heavy = { ...DEFAULTS, seed: 3, proMode: true, taxOn: true, useIrpfBrackets: true, beckhamOn: true, wealthTaxOn: true, lolOn: true, fxVolOn: true, inflOn: true,
  glideOn: true, lifeExpOn: true, baristaOn: true, reOn: true, reValue: 200000, startGold: 50000, goldAporte: 5, btcAporte: 5, profitShareWeeks: 5, gratuityYears: 5,
  mandatoryRetireOn: true, wdStrategy: 1, srrShockOn: true, startEq: 2000000, horizonAge: 70 };
heavy.debugTrackBuckets = true;
// Per-control expectations: every min/max is accepted EXCEPT the listed cross-field violations,
// which must be refused with the specific Spanish message (so wrongly rejected values cannot hide).
const EXPECTED_REJECTIONS = {
  'ageNow@max': /horizonte/, 'horizonAge@min': /horizonte/, 'careerYear@max': /inicio/,
  'allocCash@min': /100 %/, 'allocCash@max': /100 %/, 'allocBonds@min': /100 %/, 'allocBonds@max': /100 %/, 'allocEquities@min': /100 %/, 'allocEquities@max': /100 %/,
  'childStartAge@max': /hijo/, 'childEndAge@min': /hijo/
};
const seen = new Set(); let checked = 0, rejected = 0;
for (const key of Object.keys(DEFAULTS)) {
  if (typeof DEFAULTS[key] !== 'number') continue;
  const element = tag(key), min = Number((element.match(/min="([^"]+)"/) || [])[1]), max = Number((element.match(/max="([^"]+)"/) || [])[1]);
  for (const [edge, value] of [['min', min], ['max', max]]) {
    if (!Number.isFinite(value)) continue;
    const label = key + '@' + edge, expected = EXPECTED_REJECTIONS[label];
    if (expected) {
      seen.add(label); rejected++;
      assert.throws(() => simulate({ ...heavy, [key]: value }, 3), expected, label + '=' + value + ' must be refused with a specific message');
    } else {
      const result = simulate({ ...heavy, [key]: value }, 3); // must NOT throw
      assert.ok(finiteSeries(result), label + '=' + value + ' must not produce NaN/Infinity or a negative bucket');
      checked++;
    }
  }
}
assert.deepEqual([...seen].sort(), Object.keys(EXPECTED_REJECTIONS).sort(), 'every listed rejection corresponds to a real control edge');
assert.equal(rejected, Object.keys(EXPECTED_REJECTIONS).length);
assert.ok(checked > 80, 'sweep covered the controls (' + checked + ')');
console.log('input validation: OK');
