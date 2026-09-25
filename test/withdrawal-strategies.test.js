// PRO withdrawal strategies (wdStrategy 3-5) and the independent Prime Harvesting
// toggle (phOn). TDD: this file is written before any implementation exists, so the
// first run must fail (RED) on the new wdStrategy/fcFloor/fcCeiling/ysYears/ysYield/
// phOn plumbing before index.html and simulation-core.js are updated (GREEN).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const core = require('../simulation-core.js');
const html = fs.readFileSync('index.html', 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const source = inline.slice(0, inline.indexOf('// The simulation runs off the main thread')) + '\nglobalThis.__test={simulate,DEFAULTS};';
const context = { console, Math, Float64Array, Int32Array, Uint8Array, Date, Infinity, NavlogCore: core, document: { getElementById: () => null }, globalThis: null };
context.globalThis = context; vm.createContext(context); vm.runInContext(source, context, { timeout: 1000 });
const { simulate, DEFAULTS } = context.__test;

// ---- pure helper unit tests (simulation-core.js) ----------------------------------

test('vpwRate: n=1 always spends everything (rate 1), for any real return', () => {
  assert.equal(core.vpwRate(0, 1), 1);
  assert.ok(Math.abs(core.vpwRate(0.05, 1) - 1) < 1e-9);
  assert.ok(Math.abs(core.vpwRate(-0.02, 1) - 1) < 1e-9);
});

test('vpwRate: r=0 degenerates to an equal 1/n split', () => {
  assert.equal(core.vpwRate(0, 30), 1 / 30);
  assert.equal(core.vpwRate(0, 10), 1 / 10);
});

test('vpwRate: matches the annuity-due PMT formula directly for a known case', () => {
  const r = 0.0404, n = 62; // 70/30 risky/safe weighted rate (5% / 1.8%), 62 years left
  const expected = r / ((1 + r) * (1 - Math.pow(1 + r, -n)));
  assert.ok(Math.abs(core.vpwRate(r, n) - expected) < 1e-12);
  assert.ok(Math.abs(core.vpwRate(r, n) - 0.042476466814015436) < 1e-9);
});

test('vpwRate: n is floored at 1 (a horizon already reached is still a valid single year)', () => {
  assert.equal(core.vpwRate(0.05, 0), core.vpwRate(0.05, 1));
  assert.equal(core.vpwRate(0.05, -5), core.vpwRate(0.05, 1));
});

test('floorCeilingWithdrawal: clamps a raw SWR withdrawal into [floor,ceiling] of the base', () => {
  assert.equal(core.floorCeilingWithdrawal(2500000, 3.25, 60000, 90, 125), 75000, 'above ceiling is clamped down');
  assert.equal(core.floorCeilingWithdrawal(1000000, 3.25, 60000, 90, 125), 54000, 'below floor is clamped up');
  assert.equal(core.floorCeilingWithdrawal(1800000, 3.25, 60000, 90, 125), 58500, 'inside the band passes through unclamped');
});

test('floorCeilingWithdrawal: never negative for a zero or negative portfolio', () => {
  assert.equal(core.floorCeilingWithdrawal(0, 3.25, 60000, 90, 125), 54000, 'floor still applies at a zero portfolio');
  assert.equal(core.floorCeilingWithdrawal(-100, 3.25, 60000, 90, 125), 54000);
});

// ---- deterministic flat-market fixtures --------------------------------------------
// 0% real returns everywhere and startEq set exactly at (or just above) the FIRE
// target, so retirement starts at month 0 and any wealth difference across strategies
// comes purely from withdrawal-strategy bookkeeping, not market noise.
const baseFlat = {
  ...DEFAULTS, seed: 7, proMode: true,
  ret: 0, vol: 0, btcRet: 0, btcVol: 0, consRet: 0, consVol: 0, cashRet: 0, cashVol: 0,
  startBtc: 0, allocCash: 10, allocBonds: 20, allocEquities: 70,
  vida: 0, hip: 0, burr: 0, brOn: false, salFO: 0, salCA: 0, basicFO: 0, basicCA: 0, provOn: false,
  childAnnual: 0, pensionAnnual: 0, healthcareAnnual: 0, mandatoryRetireOn: false, srrShockOn: false,
  histMarketOn: false, fxVolOn: false, inflOn: false, taxOn: false, wealthTaxOn: false, beckhamOn: false,
  lolOn: false, reOn: false, glideOn: false, baristaOn: false,
};
// swr 5% -> target = gasto/0.05 = 1,200,000; startEq set to exactly that so FIRE fires at i=0.
const flat = { ...baseFlat, gasto: 60000, swr: 5, startEq: 1200000 };
const firstSeries = p => simulate(p, 4).series.map(x => x.p50);
const anyDiffer = (a, b) => a.some((v, i) => Math.abs(v - b[i]) > 1e-6) || a.length !== b.length;

test('strat 0 (SWR fijo) is unaffected by the new sliders (baseline sanity)', () => {
  const a = firstSeries({ ...flat, wdStrategy: 0 });
  const b = firstSeries({ ...flat, wdStrategy: 0, fcFloor: 50, fcCeiling: 200, ysYears: 10, ysYield: 8 });
  assert.deepEqual(a, b, 'strat 0 never reads the VPW/floor-ceiling/Yield Shield sliders');
});

for (const [strat, name] of [[3, 'VPW'], [4, 'floor & ceiling'], [5, 'Yield Shield']]) {
  test(`strat ${strat} (${name}): runs with default params, no NaN, and differs from SWR fijo`, () => {
    const swrFijo = firstSeries({ ...flat, wdStrategy: 0 });
    const result = simulate({ ...flat, wdStrategy: strat }, 4);
    const alt = result.series.map(x => x.p50);
    for (const v of alt) assert.ok(Number.isFinite(v), `${name} produced a non-finite p50`);
    assert.ok(anyDiffer(swrFijo, alt), `${name} must produce a different wealth trajectory than SWR fijo`);
  });
}

// The first calendar-year snapshot (December) always lands 3 months after fireMonth=0
// (Sep->Oct->Nov->Dec), and no strategy recomputes before monthsSinceRetire=12, so the
// first snapshot exercises exactly the INITIAL annual spend (set once, at the FIRE
// month itself) applied for 3 months at 0% real return: expected = totalAtFire - 3*(annual/12).
test('strat 3 (VPW): first-snapshot spend matches totalAtFire * vpwRate(rWeighted, yearsLeft)', () => {
  // allocCash 10/allocBonds 20/allocEquities 70 -> riskyNow=840,000 (equities),
  // safeNow=360,000 (bonds+cash) out of a 1,200,000 portfolio -> rWeighted = 0.0404,
  // yearsLeft = max(100, horizonAge 90) - ageNow(28) = 72 (VPW plans to age 100).
  const totalAtFire = 1200000;
  const rWeighted = (840000 * 0.05 + 360000 * 0.018) / totalAtFire;
  const annual = totalAtFire * core.vpwRate(rWeighted, 72);
  const expected = totalAtFire - 3 * (annual / 12);
  const result = simulate({ ...flat, wdStrategy: 3 }, 1);
  assert.ok(Math.abs(result.series[0].p50 - expected) < 1, `expected ~${expected}, got ${result.series[0].p50}`);
});

test('strat 3 (VPW): an end age beyond 100 extends the plan (lower pct, slower spending)', () => {
  // VPW plans to age 100; only an end age above 100 lengthens the plan. An end age below
  // 100 must not change the spending rate at all.
  const at90 = simulate({ ...flat, wdStrategy: 3, horizonAge: 90 }, 1).series.map(x => x.p50);
  const at60 = simulate({ ...flat, wdStrategy: 3, horizonAge: 60 }, 1).series.map(x => x.p50);
  assert.equal(at60[2], at90[2], 'end ages below 100 all plan to 100');
  const shortHorizon = at90;
  const longHorizon = simulate({ ...flat, wdStrategy: 3, horizonAge: 108 }, 1).series.map(x => x.p50);
  assert.ok(shortHorizon[2] < longHorizon[2], 'a shorter horizon leaves less wealth at the same early snapshot');
});

test('strat 4 (floor & ceiling): initial withdrawal equals gasto (unclamped first year)', () => {
  const result = simulate({ ...flat, wdStrategy: 4 }, 1);
  const expected = 1200000 - 3 * (60000 / 12);
  assert.ok(Math.abs(result.series[0].p50 - expected) < 1, `expected ~${expected}, got ${result.series[0].p50}`);
});

test('strat 4 (floor & ceiling): a lower ceiling preserves more wealth once the SWR-of-portfolio formula would otherwise exceed it', () => {
  // growth fixture: strong deterministic equity growth eventually pushes swr% of the
  // portfolio above even a generous ceiling, so a tighter ceiling must leave more wealth.
  const tight = simulate({ ...growth, gasto: 60000, wdStrategy: 4, fcCeiling: 100 }, 1).series.map(x => x.p50);
  const loose = simulate({ ...growth, gasto: 60000, wdStrategy: 4, fcCeiling: 300 }, 1).series.map(x => x.p50);
  const last = Math.min(tight.length, loose.length) - 1;
  assert.ok(tight[last] > loose[last], 'a lower ceiling spends less once the band binds, leaving more wealth');
});

test('strat 5 (Yield Shield): spend is capped at ysYield% of the portfolio while below gasto', () => {
  const result = simulate({ ...flat, wdStrategy: 5 }, 1);
  // ysYield 4% of 1,200,000 = 48,000 < gasto 60,000 -> spend is yield-limited, not gasto.
  const expected = 1200000 - 3 * (48000 / 12);
  assert.ok(Math.abs(result.series[0].p50 - expected) < 1, `expected ~${expected}, got ${result.series[0].p50}`);
});

test('strat 5 (Yield Shield): reverts to plain gasto once ysYears has elapsed', () => {
  const result = simulate({ ...flat, wdStrategy: 5, ysYears: 0 }, 1);
  const expected = 1200000 - 3 * (60000 / 12);
  assert.ok(Math.abs(result.series[0].p50 - expected) < 1, `ysYears=0 behaves like SWR fijo from year 0 (expected ~${expected}, got ${result.series[0].p50})`);
});

// ---- Prime Harvesting (phOn): independent of wdStrategy ----------------------------
// Needs actual equity growth to ever trigger its 1.2xE0 sweep, so this uses its own
// fixture with a positive, deterministic (0-vol) equity return and no spending.
const growth = { ...baseFlat, gasto: 0, swr: 5, startEq: 1200000, ret: 8, vol: 0 };

test('phOn changes results only when proMode is on', () => {
  const proOff = simulate({ ...growth, proMode: false, phOn: true }, 4).series.map(x => x.p50);
  const proOffBaseline = simulate({ ...growth, proMode: false, phOn: false }, 4).series.map(x => x.p50);
  assert.deepEqual(proOff, proOffBaseline, 'phOn is inert while proMode is off');

  const proOnOff = simulate({ ...growth, proMode: true, phOn: false }, 4).series.map(x => x.p50);
  const proOnOn = simulate({ ...growth, proMode: true, phOn: true }, 4).series.map(x => x.p50);
  assert.ok(anyDiffer(proOnOff, proOnOn), 'phOn changes the wealth trajectory once proMode is on');
});

test('phOn combines with every wdStrategy (0-5), never throwing or producing NaN', () => {
  for (let strat = 0; strat <= 5; strat++) {
    const result = simulate({ ...growth, wdStrategy: strat, phOn: true }, 4);
    for (const x of result.series) assert.ok(Number.isFinite(x.p50), `wdStrategy ${strat} + phOn produced a non-finite p50`);
  }
});

// ---- slider-range compliance: every new default sits on its slider's step grid ----
test('new sliders: defaults are within [min,max] and on the step grid', () => {
  const parseRanges = () => {
    const ranges = new Map();
    for (const match of html.matchAll(/<input\b([^>]*)>/g)) {
      const attrs = {};
      for (const attr of match[1].matchAll(/([\w-]+)="([^"]*)"/g)) attrs[attr[1]] = attr[2];
      if (attrs.type === 'range' && attrs.id) ranges.set(attrs.id, { min: Number(attrs.min), max: Number(attrs.max), step: Number(attrs.step) });
    }
    return ranges;
  };
  const ranges = parseRanges();
  for (const id of ['fcFloor', 'fcCeiling', 'ysYears', 'ysYield', 'wdStrategy']) {
    assert.ok(ranges.has(id), `${id} slider exists`);
    const r = ranges.get(id);
    const def = DEFAULTS[id];
    const steps = (def - r.min) / r.step;
    assert.ok(def >= r.min && def <= r.max, `${id} default ${def} within [${r.min},${r.max}]`);
    assert.ok(Math.abs(steps - Math.round(steps)) < 1e-9, `${id} default ${def} sits on the step grid`);
  }
  assert.deepEqual(ranges.get('wdStrategy'), { min: 0, max: 5, step: 1 }, 'wdStrategy now spans 6 strategies (0-5)');
  assert.equal(typeof DEFAULTS.phOn, 'boolean', 'phOn is a checkbox default, not a range');
  assert.equal(DEFAULTS.phOn, false);
});

// ---- markup: every new control has its own hint, and labels list all 6 strategies -
test('every new control has its own <p class="hint"> in the markup', () => {
  for (const id of ['fcFloor', 'fcCeiling', 'ysYears', 'ysYield']) {
    const re = new RegExp('<p class="hint">[^<]*</p>\\s*<input type="range" id="' + id + '"');
    assert.match(html, re, `#${id} has a preceding hint paragraph`);
  }
  assert.match(html, /<p class="hint">[^<]*<\/p>\s*<div class="toggle">\s*<input type="checkbox" id="phOn">/,
    '#phOn has a preceding hint paragraph');
});

test('paintLabels lists all six wdStrategy names, and no position-dependent wording was introduced', () => {
  assert.match(inline, /\['SWR fijo','Guyton-Klinger','Fases go-go\/slow-go\/no-go','VPW \(Bogleheads\)','Suelo y techo \(Bengen\)','Yield Shield'\]/);
  for (const pattern of [/\barriba\b/i, /\babajo\b/i]) {
    const section = html.slice(html.indexOf('PRO · Estrategia de retirada'), html.indexOf('PRO · Activos y allocation adicionales'));
    assert.equal(pattern.test(section), false, `forbidden position wording ${pattern} found in the withdrawal-strategy group`);
  }
});

console.log('withdrawal-strategies.test.js: all assertions passed');

test('VPW plans to age 100 like Bogleheads, so it never empties the portfolio at the end age', () => {
  const r = simulate({ ...DEFAULTS, seed: 9, proMode: true, wdStrategy: 3 }, 400);
  const ruined = [...r.ruinMonth].filter(m => m >= 0).length;
  assert.ok(ruined <= 4, `VPW should almost never run out, got ${ruined}/400 ruined paths`);
});
