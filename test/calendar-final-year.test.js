// Bug: MONTH_DATES' isSnap flag is precomputed against the GLOBAL max horizon
// (MONTHS, tied to horizonAge=110), so it is only true in December or at the
// global final month. Every simulate() run has its OWN horizon (`months`,
// derived from p.horizonAge/p.ageNow) which almost never lands on December for
// an integer age (the model starts in September). The run's own final month
// must always be captured as a snapshot, and the year-end gates (wealth tax,
// glide path, Prime Harvesting) must apply there too.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../simulation-core.js');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const source = inline.slice(0, inline.indexOf('// Renderer shared by the inline chart')) + '\nglobalThis.__t={simulate,DEFAULTS};';
const context = { console, Math, Float64Array, Int32Array, Uint8Array, Date, Infinity, NavlogCore: core, document: { getElementById: () => null }, globalThis: null };
context.globalThis = context; vm.createContext(context); vm.runInContext(source, context, { timeout: 5000 });
const { simulate, DEFAULTS } = context.__t;

// --- 1. Default profile: the run ends at age 90 (September), not December. ---
{
  const p = { ...DEFAULTS, seed: 1 };
  const months = Math.floor((p.horizonAge - p.ageNow) * 12) + 1;
  const r = simulate(p, 50);
  assert.ok(r.series.length > 0, 'series must not be empty');
  const last = r.series[r.series.length - 1];
  assert.equal(last.idx, months - 1, 'the last series point must be the run\'s own final month, not a global one');
  // months-1 = 744 from age 28 to 90 starting Sep-2026 -> Sep-2088.
  assert.equal(last.year, 2088, 'the final partial year must be labelled with its own calendar year');
}

// --- 2. Wealth tax must be charged in the final partial year when active,
//     even though that month is never December. ---
{
  const base = {
    ...DEFAULTS, seed: 1, proMode: true, startEq: 400e6, startBtc: 0, ret: 5, vol: 0, btcRet: 0, btcVol: 0,
    gasto: 12e6, swr: 4, vida: 0, hip: 0, childAnnual: 0, brOn: false, burr: 0, provOn: false,
    startDelay: 0, captDelay: 0, taxRepatDelay: 0, allocCash: 0, allocBonds: 0, allocEquities: 100,
    careerYear: 2026,
    // age 28 -> 28.2 is 3 months (Sep, Oct, Nov): no December ever occurs, so the
    // only way wealth tax can apply here is via the run's own final-month gate.
    horizonAge: 28.2,
    wealthTaxOn: true, wealthExempt: 700000, wealthRate: 2, wealthBonusPct: 0
  };
  const months = Math.floor((base.horizonAge - base.ageNow) * 12) + 1;
  assert.equal(months, 3);

  const withTax = simulate(base, 1);
  const withoutTax = simulate({ ...base, wealthTaxOn: false }, 1);
  assert.equal(withTax.series.length, 1, 'a 3-month run has exactly one (final, partial-year) snapshot');
  assert.equal(withTax.series[0].idx, months - 1);
  assert.ok(withTax.series[0].p50 < withoutTax.series[0].p50,
    'wealth tax must reduce the final partial-year snapshot when active');
}
console.log('calendar final-year snapshot: OK');
