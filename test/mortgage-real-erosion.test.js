// A fixed-rate mortgage keeps the same nominal payment, so inflation makes it cheaper in real
// euros every year. hipRealErosion is that yearly loss of real value (2 % by default: a fixed
// rate with 2 % inflation; 0 % for a variable rate that tracks inflation).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const core = require('../simulation-core.js');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const source = inline.slice(0, inline.indexOf('// Renderer shared by the inline chart')) + '\nglobalThis.__t={simulate,DEFAULTS,MONTH_DATES,monthIndex,CAREER_MONTH};';
const context = { console, Math, Float64Array, Int32Array, Uint8Array, Date, Infinity, NavlogCore: core, document: { getElementById: () => null }, globalThis: null };
context.globalThis = context; vm.createContext(context); vm.runInContext(source, context, { timeout: 5000 });
const { simulate, DEFAULTS, MONTH_DATES, monthIndex, CAREER_MONTH } = context.__t;

test('hipRealErosion: slider 0-5 %, default 2 %, with a hint', () => {
  assert.equal(DEFAULTS.hipRealErosion, 2);
  assert.match(html, /<input type="range" id="hipRealErosion" min="0" max="5" step="0.25">/);
  const block = html.slice(html.indexOf('<label for="hipRealErosion">'), html.indexOf('id="hipRealErosion" min='));
  assert.match(block, /class="hint"/);
});

test('the FIRE target counts the remaining mortgage in eroded real euros', () => {
  const p = { ...DEFAULTS, seed: 1, horizonAge: 80, childCount: 0 };
  const months = Math.floor((p.horizonAge - p.ageNow) * 12) + 1, careerStart = monthIndex(p.careerYear, CAREER_MONTH);
  const k = Math.log(1 + p.hipRealErosion / 100) / 12;
  let committed = 0;
  for (let i = 0; i < months; i++) { const d = MONTH_DATES[i]; if (i >= careerStart && (d.y < p.hipEnd || (d.y === p.hipEnd && d.m <= 12))) committed += p.hip * Math.exp(-k * i); }
  const expected = (p.gasto + p.healthcareAnnual) / (p.swr / 100) + committed;
  assert.ok(Math.abs(simulate(p, 5).target - expected) < 1e-6);
  assert.ok(simulate({ ...p, hipRealErosion: 0 }, 5).target > simulate(p, 5).target, 'no erosion means a larger remaining mortgage');
});

test('erosion brings the median FIRE month forward (or leaves it unchanged)', () => {
  // Final wealth is not a fair check: a lower target means retiring earlier and withdrawing longer.
  const base = { ...DEFAULTS, seed: 4, horizonAge: 70 };
  const med = r => { const s = Array.from(r.fireMonthAll).filter(m => m >= 0).sort((a, b) => a - b); return s[s.length >> 1]; };
  assert.ok(med(simulate({ ...base, hipRealErosion: 2 }, 400)) <= med(simulate({ ...base, hipRealErosion: 0 }, 400)));
});
