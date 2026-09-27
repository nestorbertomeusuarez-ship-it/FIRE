// Profit sharing and markets: a year without payout tends to follow a bad fiscal year for the
// airline (Emirates' year runs April-March; the payout is decided in May), which usually
// coincides with a market fall (COVID: 2020-2022). A Gaussian copula ties the yearly draw to
// the fiscal year's equity return without changing the long-run share of non-paying years.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const core = require('../simulation-core.js');

test('profitShareMarketU: 0 % correlation returns the uniform unchanged', () => {
  for (const u of [0.01, 0.3, 0.5, 0.97]) assert.equal(core.profitShareMarketU(u, -2.5, 0), u);
});

test('profitShareMarketU: a bad fiscal year lowers the draw (more likely no payout), a good one raises it', () => {
  assert.ok(core.profitShareMarketU(0.5, -2, 50) < 0.5);
  assert.ok(core.profitShareMarketU(0.5, 2, 50) > 0.5);
  assert.ok(core.profitShareMarketU(0.5, -2, 90) < core.profitShareMarketU(0.5, -2, 50), 'stronger correlation, stronger effect');
});

test('profitShareMarketU keeps the draw uniform when the market z-score is standard normal', () => {
  const rnd = core.seededRandom(3);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  let below = 0, sum = 0; const n = 100000;
  for (let i = 0; i < n; i++) { const u = core.profitShareMarketU(rnd(), gauss(), 60); sum += u; if (u < 0.5) below++; }
  assert.ok(Math.abs(sum / n - 0.5) < 0.01, 'mean ~0.5');
  assert.ok(Math.abs(below / n - 0.5) < 0.01, 'median ~0.5: the long-run skip share is unchanged');
});

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const source = inline.slice(0, inline.indexOf('// Renderer shared by the inline chart')) + '\nglobalThis.__t={simulate,DEFAULTS};';
const context = { console, Math, Float64Array, Int32Array, Uint8Array, Date, Infinity, NavlogCore: core, document: { getElementById: () => null }, globalThis: null };
context.globalThis = context; vm.createContext(context); vm.runInContext(source, context, { timeout: 5000 });
const { simulate, DEFAULTS } = context.__t;

test('profitShareMarketCorr: slider 0-90, default 50, with a hint', () => {
  assert.equal(DEFAULTS.profitShareMarketCorr, 50);
  assert.match(html, /<input type="range" id="profitShareMarketCorr" min="0" max="90" step="5">/);
  const block = html.slice(html.indexOf('<label for="profitShareMarketCorr">'), html.indexOf('id="profitShareMarketCorr" min='));
  assert.match(block, /class="hint"/);
});

test('the market link changes outcomes and makes the bad tail no better', () => {
  const base = { ...DEFAULTS, seed: 21, horizonAge: 60 };
  const fire = r => Array.from(r.fireMonthAll).filter(m => m >= 0).sort((a, b) => a - b);
  const p90 = r => { const s = fire(r); return s[Math.floor(s.length * 0.9)]; };
  const off = simulate({ ...base, profitShareMarketCorr: 0 }, 1500), on = simulate({ ...base, profitShareMarketCorr: 90 }, 1500);
  assert.notDeepEqual(fire(on), fire(off));
  assert.ok(p90(on) >= p90(off), 'losing profit sharing in bad market years cannot make the slow 10 % faster');
});
