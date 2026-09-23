const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const core = require('../simulation-core.js');
const html = fs.readFileSync('index.html', 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const source = inline.slice(0, inline.indexOf('// The simulation runs off the main thread')) + '\nglobalThis.__test={simulate,DEFAULTS};';
const context = { console, Math, Float64Array, Int32Array, Uint8Array, Date, Infinity, NavlogCore: core, document:{getElementById:()=>null}, globalThis:null };
context.globalThis = context; vm.createContext(context); vm.runInContext(source, context, { timeout: 1000 });
const { simulate, DEFAULTS } = context.__test;

// Deterministic, flat-return profile: any wealth difference comes from bookkeeping, not markets.
const flat = { ...DEFAULTS, seed: 7, proMode: true, ret: 0, vol: 0, btcRet: 0, btcVol: 0, consRet: 0, consVol: 0, cashRet: 0, cashVol: 0,
  startEq: 0, startBtc: 200000, allocCash: 0, allocBonds: 100, allocEquities: 0, vida: 0, hip: 0, nur: 0, brOn: false, burr: 0,
  salFO: 0, salCA: 0, basicFO: 0, basicCA: 0, provOn: false, gasto: 1000000, swr: 4 };
const firstP50 = p => simulate(p, 4).series[0].p50;

test('glide-path rebalance never creates money when the equity bucket is empty', () => {
  const off = firstP50({ ...flat, startEq: 100000, startBtc: 100000, glideOn: false });
  const on = firstP50({ ...flat, startEq: 100000, startBtc: 100000, glideOn: true, glideTargetYear: 2100, glideStartYears: 1 });
  assert.ok(on <= off + 1, `glide on (${on}) must not exceed glide off (${off})`);
});

test('a 0 % sequence-risk shock is honoured instead of falling back to -30 %', () => {
  const base = { ...flat, startEq: 500000, startBtc: 0, allocBonds: 0, allocEquities: 100, srrShockOn: true, srrShockMonths: 12, gasto: 10000 };
  const zero = simulate({ ...base, srrShockPct: 0 }, 4).series.map(x => x.p50);
  const minus30 = simulate({ ...base, srrShockPct: -30 }, 4).series.map(x => x.p50);
  assert.notDeepEqual(zero, minus30, '0 % and -30 % shocks must differ');
});
