// index-publico.html keeps its own copy of the engine. Emirates pays the end-of-service
// gratuity OR the Provident balance, whichever is higher, so with a Provident balance far
// above the gratuity, adding gratuity years must not change the outcome.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '..', 'index-publico.html'), 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const end = inline.indexOf('\n];', inline.indexOf('const SENSITIVITY_PARAMS = ['));
const source = inline.slice(0, end + 3) + '\nglobalThis.__pub = { DEFAULTS, simulate };';
// Seeded Math.random so both runs draw identical paths; reset before each run.
let seed = 1;
const seededMath = Object.create(Math);
seededMath.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const sandbox = { console, Math: seededMath, Date, Float64Array, Int32Array, Uint8Array, Infinity, document: { getElementById: () => null }, window: { addEventListener: () => {} } };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { timeout: 2000 });
const { DEFAULTS, simulate } = sandbox.__pub;

test('gratuity is only a top-up over the Provident balance, never paid on top of it', () => {
  const base = { ...DEFAULTS, provOn: true, provCo: 12, vol: 0, btcVol: 0, captDelay: 0, startDelay: 0 };
  const median = r => r.series.map(x => Math.round(x.p50));
  seed = 1; const withGratuity = median(simulate({ ...base, gratuityYears: 3 }, 4));
  seed = 1; const without = median(simulate({ ...base, gratuityYears: 0 }, 4));
  assert.deepEqual(withGratuity, without);
});
