// A mean-zero inflation surprise must not make a nominal payment cheaper in real terms on
// average: E[factor] must stay ≈ 1 (exp of a random walk needs a variance correction).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const core = require('../simulation-core.js');

test('real factor of a nominal amount has mean 1 under mean-zero inflation surprises', () => {
  assert.equal(typeof core.inflationRealFactor, 'function');
  let seed = 3; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const g = () => { let u, v, q; do { u = rnd() * 2 - 1; v = rnd() * 2 - 1; q = u * u + v * v; } while (q === 0 || q >= 1); return u * Math.sqrt(-2 * Math.log(q) / q); };
  const volM = 0.04 / Math.sqrt(12), months = 60 * 12, n = 20000;
  let sum = 0;
  for (let k = 0; k < n; k++) { let cum = 0; for (let i = 0; i < months; i++) cum += volM * g(); sum += core.inflationRealFactor(cum, months * volM * volM); }
  assert.ok(Math.abs(sum / n - 1) < 0.01, `mean factor ${sum / n}`);
});

test('the engine applies the corrected factor to the mortgage', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.match(html, /hipReal=inflActive \? p\.hip\*NavlogCore\.inflationRealFactor\(cumInfl, *cumInflVar\)/);
});
