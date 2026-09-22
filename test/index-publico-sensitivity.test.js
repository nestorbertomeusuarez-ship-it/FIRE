// index-publico.html is a standalone public fork of the FIRE simulator: it has
// its OWN inline <script> and does NOT load simulation-core.js / NavlogCore, so
// its runSensitivity() cannot reuse NavlogCore.boundedPair(). This test proves
// the local `boundedPair` helper and the SENSITIVITY_PARAMS entries it clamps
// against never let a sensitivity run simulate a parameter value outside the
// matching slider's own min/max — mirroring the extraction technique used by
// test/worker-parity.test.js (regex-extract the inline <script>, evaluate the
// pure prefix in node:vm).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index-publico.html'), 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');

// Slice just the pure prefix: DEFAULTS, eur(), boundedPair() and the
// SENSITIVITY_PARAMS table. Everything else (chart rendering, worker wiring,
// requestSimulation) is irrelevant to the clamping bug and would need a real
// DOM/canvas/Worker to evaluate.
const marker = 'const SENSITIVITY_PARAMS = [';
const markerIdx = inline.indexOf(marker);
assert.ok(markerIdx >= 0, 'index-publico.html must still define SENSITIVITY_PARAMS');
const arrayEnd = inline.indexOf('\n];', markerIdx);
assert.ok(arrayEnd >= 0, 'SENSITIVITY_PARAMS array must close with "];"');
const prefixSource = inline.slice(0, arrayEnd + 3)
  + '\nglobalThis.__pub = { DEFAULTS, SENSITIVITY_PARAMS, boundedPair: typeof boundedPair === "function" ? boundedPair : undefined };';

const sandbox = { console, Math, Date, document: { getElementById: () => null }, window: { addEventListener: () => {} } };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(prefixSource, sandbox, { timeout: 5000 });

const { DEFAULTS, SENSITIVITY_PARAMS, boundedPair } = sandbox.__pub;

assert.equal(typeof boundedPair, 'function', 'index-publico.html must define a local boundedPair(value, delta, min, max) helper');

// The exact min/max each slider carries in the markup (verified by reading the
// <input type="range"> tags directly).
const SLIDER_BOUNDS = {
  ret: { min: 2, max: 9 },
  vol: { min: 0, max: 26 },
  btcRet: { min: -10, max: 20 },
  vida: { min: 1800, max: 7000 },
  swr: { min: 2.4, max: 4.6 },
  salG: { min: -1, max: 2.5 },
  startDelay: { min: 0, max: 18 },
  hip: { min: 0, max: 1400 },
};

for (const key of Object.keys(SLIDER_BOUNDS)) {
  assert.ok(SENSITIVITY_PARAMS.some(def => def.key === key), 'SENSITIVITY_PARAMS must still cover ' + key);
}

for (const def of SENSITIVITY_PARAMS) {
  const bounds = SLIDER_BOUNDS[def.key];
  assert.ok(bounds, 'unexpected SENSITIVITY_PARAMS key ' + def.key + ' has no known slider bounds in this test');
  assert.equal(def.min, bounds.min, def.key + ' must carry its slider min');
  assert.equal(def.max, bounds.max, def.key + ' must carry its slider max');

  const delta = typeof def.delta === 'function' ? def.delta(DEFAULTS) : def.delta;
  const base = DEFAULTS[def.key];
  const pair = boundedPair(base, delta, def.min, def.max);

  assert.ok(pair.low >= bounds.min, def.key + ' valueLow ' + pair.low + ' must be >= slider min ' + bounds.min);
  assert.ok(pair.high <= bounds.max, def.key + ' valueHigh ' + pair.high + ' must be <= slider max ' + bounds.max);
  assert.ok(Number.isFinite(pair.low) && Number.isFinite(pair.high), def.key + ' clamped values must stay finite');
}

// Concrete before/after evidence for the two entries that actually go out of
// range with the real DEFAULTS (computed directly, not guessed):
//   vida: base=1400, delta=1400*0.1=140 -> raw [1260, 1540], slider min=1800.
//         BOTH ends fall below the min, so the clamped pair degenerates to
//         low === high === 1800 (the parameter is already at its bound).
const vidaDef = SENSITIVITY_PARAMS.find(d => d.key === 'vida');
const vidaDelta = vidaDef.delta(DEFAULTS);
assert.equal(DEFAULTS.vida, 1400, 'baseline check: DEFAULTS.vida is 1400');
assert.equal(vidaDelta, 140, 'baseline check: vida delta is 10% of 1400');
// Objects returned by functions evaluated in node:vm belong to a different
// realm than this test file, so assert.deepEqual/deepStrictEqual (which also
// compares prototypes) would spuriously fail here even when values match:
// individual field assertions avoid that realm mismatch entirely.
const vidaPair = boundedPair(DEFAULTS.vida, vidaDelta, vidaDef.min, vidaDef.max);
assert.equal(vidaPair.low, 1800, 'vida low must clamp up to the slider min instead of simulating 1260');
assert.equal(vidaPair.high, 1800, 'vida high must clamp up to the slider min instead of simulating 1540');
assert.equal(vidaPair.changed, false, 'vida pair degenerates to a single point: the parameter is already at its bound');

//   startDelay: base=3, delta=6 (fixed) -> raw [-3, 9], slider min=0.
//         Only the low end is out of range, so the pair stays meaningful:
//         low clamps to 0, high stays 9.
const startDelayDef = SENSITIVITY_PARAMS.find(d => d.key === 'startDelay');
assert.equal(DEFAULTS.startDelay, 3, 'baseline check: DEFAULTS.startDelay is 3');
assert.equal(startDelayDef.delta, 6, 'baseline check: startDelay delta is fixed at 6');
const startDelayPair = boundedPair(DEFAULTS.startDelay, startDelayDef.delta, startDelayDef.min, startDelayDef.max);
assert.equal(startDelayPair.low, 0, 'startDelay must clamp its low end (raw -3) to the slider min 0');
assert.equal(startDelayPair.high, 9, 'startDelay high end (9) is already in range and must stay unchanged');
assert.equal(startDelayPair.changed, true, 'startDelay pair still spans a real range after clamping');

// Illustrative boundary scenario from the bug report: a user who has dragged
// every slider to its extreme value before running the sensitivity analysis.
// None of the resulting low/high pairs may leave [min, max].
const extremeBase = { ret: 2, vol: 0, btcRet: -10, vida: 1800, swr: 2.4, salG: -1, startDelay: 0, hip: 0 };
for (const def of SENSITIVITY_PARAMS) {
  const delta = typeof def.delta === 'function' ? def.delta(extremeBase) : def.delta;
  const pair = boundedPair(extremeBase[def.key], delta, def.min, def.max);
  assert.ok(pair.low >= def.min, def.key + ' at extreme low: valueLow ' + pair.low + ' must be >= ' + def.min);
  assert.ok(pair.high <= def.max, def.key + ' at extreme low: valueHigh ' + pair.high + ' must be <= ' + def.max);
}
// swr at its own min (2.4) with delta 0.25 must clamp low to 2.4, not 2.15.
const swrExtremePair = boundedPair(extremeBase.swr, SENSITIVITY_PARAMS.find(d => d.key === 'swr').delta, 2.4, 4.6);
assert.equal(swrExtremePair.low, 2.4, 'swr at the slider min must not simulate 2.15');
assert.equal(swrExtremePair.high, 2.65, 'swr high end stays at the plain unclamped value');
assert.equal(swrExtremePair.changed, true, 'swr pair still spans a real range at this boundary');

console.log('index-publico.html runSensitivity clamping: OK');
