// PRO annual cost (TER) defaults reflect realistic fund charges instead of the placeholder 0 %.
// feeProv (Emirates Group Provident Scheme) is an explicit estimate: the scheme does not
// publish its fund charges, so the hint must say so and tell the user to check their own
// scheme statement.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const core = require('../simulation-core.js');

const html = fs.readFileSync('index.html', 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const source = inline.slice(0, inline.indexOf('// The simulation runs off the main thread')) + '\nglobalThis.__t={DEFAULTS};';
const context = { console, Math, Float64Array, Int32Array, Uint8Array, Date, Infinity, NavlogCore: core, document: { getElementById: () => null }, globalThis: null };
context.globalThis = context; vm.createContext(context); vm.runInContext(source, context, { timeout: 1000 });
const { DEFAULTS } = context.__t;

test('annual cost (TER) defaults are non-zero, realistic fund charges', () => {
  assert.equal(DEFAULTS.feeCash, 0.10);
  assert.equal(DEFAULTS.feeCons, 0.15);
  assert.equal(DEFAULTS.feeEq, 0.20);
  assert.equal(DEFAULTS.feeBtc, 0.20);
  assert.equal(DEFAULTS.feeGold, 0.15);
  assert.equal(DEFAULTS.feeProv, 0.75);
});

test('feeProv hint discloses it is an estimate (the Provident Scheme does not publish fund charges)', () => {
  const feeProvBlock = html.slice(html.indexOf('id="feeProv"') - 600, html.indexOf('id="feeProv"'));
  assert.match(feeProvBlock, /estimaci[oó]n/i, 'feeProv hint mentions it is an estimate');
  assert.match(feeProvBlock, /no publica/i, 'feeProv hint mentions the scheme does not publish its charges');
});
