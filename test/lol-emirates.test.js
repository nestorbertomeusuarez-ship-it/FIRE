const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const core = require('../simulation-core.js');
const html = fs.readFileSync('index.html', 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const source = inline.slice(0, inline.indexOf('// The simulation runs off the main thread')) + '\nglobalThis.__test={simulate,DEFAULTS,lolEmiratesMonths,lolAnnualPctAtAge:typeof lolAnnualPctAtAge==="function"?lolAnnualPctAtAge:null};';
const context = { console, Math, Float64Array, Int32Array, Uint8Array, Date, Infinity, NavlogCore: core, document:{getElementById:()=>null}, globalThis:null };
context.globalThis = context; vm.createContext(context); vm.runInContext(source, context, { timeout: 1000 });
const { simulate, DEFAULTS, lolEmiratesMonths } = context.__test;

test('Emirates contract pays 36/24/12/0 months of basic salary by age band', () => {
  assert.equal(lolEmiratesMonths(30), 36);
  assert.equal(lolEmiratesMonths(61.9), 36);
  assert.equal(lolEmiratesMonths(62), 24);
  assert.equal(lolEmiratesMonths(63), 12);
  assert.equal(lolEmiratesMonths(64), 0);
  assert.equal(lolEmiratesMonths(70), 0);
});

test('an early LOL credits 36 months of first-officer basic salary to the portfolio', () => {
  // Certain LOL in the first career month, flat markets, no private policy: the only
  // difference between the two runs is the contractual Emirates benefit.
  const base = { ...DEFAULTS, seed: 5, proMode: true, lolOn: true, lolAgeCurveOn: false, lolAnnualProb: 100, lolPayoutMode: 0, lolPayout: 0, lolPremiumMonthly: 0,
    ret: 0, vol: 0, btcRet: 0, btcVol: 0, consRet: 0, consVol: 0, cashRet: 0, cashVol: 0, startEq: 0, startBtc: 0,
    childAnnual: 0, vida: 0, hip: 0, gasto: 1, burr: 0, brOn: false, provOn: false, mandatoryRetireOn: false };
  const at2027 = r => r.series.find(x => x.year === 2027).p50;
  const withContract = at2027(simulate({ ...base, lolEmiratesOn: true }, 4));
  const without = at2027(simulate({ ...base, lolEmiratesOn: false }, 4));
  const expected = 36 * DEFAULTS.basicFO * DEFAULTS.fx;
  assert.ok(Math.abs((withContract - without) - expected) < 50, `benefit ${withContract - without} should be ~${expected}`);
});

test('age-based LOL risk follows the bathtub curve', () => {
  const { lolAnnualPctAtAge } = context.__test;
  assert.equal(lolAnnualPctAtAge(30), 0.1);
  assert.equal(lolAnnualPctAtAge(45), 0.3);
  assert.ok(Math.abs(lolAnnualPctAtAge(52.5) - 0.95) < 1e-9, 'linear ramp between 50 and 55');
  assert.equal(lolAnnualPctAtAge(55), 1.6, 'FAA denial rate at 55-59 is ~1.6 %/year');
  assert.equal(lolAnnualPctAtAge(60), 1.6, 'flat after 55 (healthy-worker effect), not exponential');
  assert.equal(lolAnnualPctAtAge(64), 1.6);
});

test('with the age curve on, the flat probability slider is ignored', () => {
  const base = { ...DEFAULTS, seed: 11, proMode: true, lolOn: true, ret: 0, vol: 0, btcRet: 0, btcVol: 0 };
  const lolCount = r => [...r.licenseLossOut].filter(Boolean).length;
  const curveA = lolCount(simulate({ ...base, lolAgeCurveOn: true, lolAnnualProb: 0 }, 400));
  const curveB = lolCount(simulate({ ...base, lolAgeCurveOn: true, lolAnnualProb: 3 }, 400));
  const flatZero = lolCount(simulate({ ...base, lolAgeCurveOn: false, lolAnnualProb: 0 }, 400));
  assert.equal(curveA, curveB);
  assert.equal(flatZero, 0);
  assert.ok(curveA > 0, 'the curve produces some LOL events over a career');
});
