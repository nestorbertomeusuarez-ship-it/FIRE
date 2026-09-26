// The sliders promise an ANNUAL mean and volatility. Twelve compounded monthly lognormal draws
// must reproduce both, not just the mean (annual/√12 monthly vol overshoots badly for BTC).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const core = require('../simulation-core.js');
const html = fs.readFileSync('index.html', 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const source = inline.slice(0, inline.indexOf('// The simulation runs off the main thread')) + '\nglobalThis.__t={annualLogParams:typeof annualLogParams==="function"?annualLogParams:null};';
const c = { console, Math, Float64Array, Int32Array, Uint8Array, Date, Infinity, NavlogCore: core, document: { getElementById: () => null }, globalThis: null };
c.globalThis = c; vm.createContext(c); vm.runInContext(source, c, { timeout: 1000 });
const { annualLogParams } = c.__t;

function sampleAnnual(P) {
  let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const g = () => { let u, v, q; do { u = rnd() * 2 - 1; v = rnd() * 2 - 1; q = u * u + v * v; } while (q === 0 || q >= 1); return u * Math.sqrt(-2 * Math.log(q) / q); };
  const ys = [];
  for (let y = 0; y < 60000; y++) { let f = 1; for (let m = 0; m < 12; m++) f *= Math.exp(P.mu + P.sd * g()); ys.push(f - 1); }
  const mean = ys.reduce((a, b) => a + b) / ys.length;
  return { mean, sd: Math.sqrt(ys.reduce((a, b) => a + (b - mean) ** 2, 0) / ys.length) };
}

test('monthly parameters reproduce the annual mean and volatility of the sliders', () => {
  assert.equal(typeof annualLogParams, 'function');
  for (const [ret, vol] of [[5.5, 17], [10, 55], [10, 70], [1.5, 15]]) {
    const s = sampleAnnual(annualLogParams(ret / 100, vol / 100));
    assert.ok(Math.abs(s.mean * 100 - ret) < 0.6, `mean ${s.mean * 100} vs ${ret}`);
    assert.ok(Math.abs(s.sd * 100 - vol) < 0.03 * vol, `vol ${s.sd * 100} vs ${vol}`);
  }
});
