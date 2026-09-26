// Emirates profit sharing, paid every May in weeks of basic pay. Last 10 years (payment May):
// 2017 0 (unconfirmed), 2018 5, 2019-2022 0, 2023 24, 2024 20, 2025 22, 2026 20 -> paid 5 of 10
// years, ~9 weeks/year on average, and clustered in cycles: after a paying year the next paid
// 3 of 4 times, after a non-paying year 2 of 5 (a 35-point persistence).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const core = require('../simulation-core.js');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const source = inline.slice(0, inline.indexOf('// Renderer shared by the inline chart')) + '\nglobalThis.__t={simulate,DEFAULTS};';
const context = { console, Math, Float64Array, Int32Array, Uint8Array, Date, Infinity, NavlogCore: core, document: { getElementById: () => null }, globalThis: null };
context.globalThis = context; vm.createContext(context); vm.runInContext(source, context, { timeout: 5000 });
const { simulate, DEFAULTS } = context.__t;
const median = values => { const s = Array.from(values).sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

test('profitShareWeeksDraw: skip year pays 0, otherwise mean ±10 %', () => {
  assert.equal(core.profitShareWeeksDraw(0.05, 0.5, 21.5, 10), 0);
  assert.equal(core.profitShareWeeksDraw(0.10, 0, 21.5, 10), 21.5 * 0.9);
  assert.ok(Math.abs(core.profitShareWeeksDraw(0.99, 1, 21.5, 10) - 21.5 * 1.1) < 1e-9);
  assert.equal(core.profitShareWeeksDraw(0.5, 0.5, 21.5, 10), 21.5);
  assert.equal(core.profitShareWeeksDraw(0.5, 0.5, 21.5, 100), 0);
  assert.equal(core.profitShareWeeksDraw(0.5, 0.5, 0, 0), 0);
  assert.equal(core.profitShareWeeksDraw(NaN, NaN, NaN, NaN), 0);
});

test('profitShareWeeksDraw: persistence keeps the cycle, 0 % keeps years independent', () => {
  // 50 % skip, 35 % persistence: P(paid | paid) = 0.5 + 0.35 * 0.5 = 0.675, P(paid | not) = 0.325.
  assert.equal(core.profitShareWeeksDraw(0.33, 0.5, 18, 50, 35, true), 18, 'u1 >= 0.325 pays after a paying year');
  assert.equal(core.profitShareWeeksDraw(0.32, 0.5, 18, 50, 35, true), 0);
  assert.equal(core.profitShareWeeksDraw(0.67, 0.5, 18, 50, 35, false), 0, 'u1 < 0.675 skips after a skipped year');
  assert.equal(core.profitShareWeeksDraw(0.68, 0.5, 18, 50, 35, false), 18);
  for (const prev of [true, false]) {
    assert.equal(core.profitShareWeeksDraw(0.49, 0.5, 18, 50, 0, prev), 0, 'no persistence: skip iff u1 < skip');
    assert.equal(core.profitShareWeeksDraw(0.5, 0.5, 18, 50, 0, prev), 18);
    assert.equal(core.profitShareWeeksDraw(0.999, 0.5, 18, 100, 90, prev), 0, '100 % skip never pays');
    assert.equal(core.profitShareWeeksDraw(0, 0.5, 18, 0, 90, prev), 18, '0 % skip always pays');
  }
});

test('the chain reproduces the configured long-run frequency and a positive lag-1 correlation', () => {
  const rnd = core.seededRandom(7);
  let prev = true, paid = 0, same = 0; const n = 200000;
  for (let i = 0; i < n; i++) { const w = core.profitShareWeeksDraw(rnd(), rnd(), 18, 50, 35, prev); const now = w > 0; if (now === prev) same++; paid += now; prev = now; }
  assert.ok(Math.abs(paid / n - 0.5) < 0.01, 'long-run paying share ~50 %');
  assert.ok(Math.abs(same / n - 0.675) < 0.01, 'P(same state next year) = 0.5 + 0.35/2');
});

test('defaults match the 10-year history', () => {
  assert.equal(DEFAULTS.profitShareWeeks, 18);
  assert.equal(DEFAULTS.profitShareSkipPct, 50);
  assert.equal(DEFAULTS.profitSharePersistPct, 35);
  assert.match(html, /<input type="range" id="profitSharePersistPct" min="0" max="90" step="5">/);
  assert.match(html, /<input type="range" id="profitShareWeeks" min="0" max="30" step="0\.5">/);
  assert.match(html, /<input type="range" id="profitShareSkipPct" min="0" max="100" step="1">/);
  assert.doesNotMatch(html, /entre el 0 % y el 30 % del básico/, 'the old 0-30 % claim contradicts the real payouts');
  assert.doesNotMatch(html, /en 2020 y 2021 \(COVID\)/, 'the no-payout years were May 2019-2022');
});

test('profit sharing is paid in May', () => {
  assert.match(inline, /profitShareActive && d\.m===5/);
  assert.doesNotMatch(inline, /profitShareActive && d\.m===12/);
});

test('a 100 % no-payout probability equals no profit sharing; the default brings FIRE forward', () => {
  const base = { ...DEFAULTS, seed: 11, horizonAge: 55 };
  const none = simulate({ ...base, profitShareWeeks: 0 }, 400);
  const skipped = simulate({ ...base, profitShareSkipPct: 100 }, 400);
  const paid = simulate(base, 400);
  const last = r => r.series[r.series.length - 1].p50;
  assert.equal(last(skipped), last(none));
  // Final wealth is not the right check: retiring earlier means years of withdrawals by the horizon.
  assert.ok(median(paid.fireMonthAll.filter(m => m >= 0)) < median(none.fireMonthAll.filter(m => m >= 0)), 'profit sharing must bring the median FIRE month forward');
});
