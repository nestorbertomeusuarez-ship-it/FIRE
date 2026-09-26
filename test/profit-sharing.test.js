// Emirates profit sharing, calibrated on the real payouts: May 2023 24 weeks, May 2024 20,
// May 2025 22, May 2026 20 (mean 21.5 weeks of basic pay, ~41 % of annual basic). It is paid
// in May, and a year can still pay nothing (it did not pay in the 2020-2021 COVID years).
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

test('defaults match the 2023-2026 history and a 10 % no-payout year', () => {
  assert.equal(DEFAULTS.profitShareWeeks, 21.5);
  assert.equal(DEFAULTS.profitShareSkipPct, 10);
  assert.match(html, /<input type="range" id="profitShareWeeks" min="0" max="30" step="0\.5">/);
  assert.match(html, /<input type="range" id="profitShareSkipPct" min="0" max="100" step="1">/);
  assert.doesNotMatch(html, /entre el 0 % y el 30 % del básico/, 'the old 0-30 % claim contradicts the real payouts');
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
