// The Web Worker source is assembled from Function#toString() of the main-thread
// code. A missing dependency or a value that does not survive serialization
// (e.g. upTo: Infinity -> null) only fails inside the worker at runtime, so this
// test evaluates the REAL generated worker string in node:vm and compares it with
// the main-thread implementation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../simulation-core.js');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const workerFunction = inline.slice(inline.indexOf('function buildWorkerSource(){'), inline.indexOf('\n// Job manager for the simulation worker'));
const mainSource = inline.slice(0, inline.indexOf('// Renderer shared by the inline chart')) + '\n' + workerFunction
  + '\nglobalThis.__main={simulate,DEFAULTS,buildWorkerSource,validateSimulationParams};';
const main = { console, Math, Float64Array, Int32Array, Uint8Array, Date, Infinity, NavlogCore: core, document: { getElementById: () => null }, globalThis: null };
main.globalThis = main; vm.createContext(main); vm.runInContext(mainSource, main, { timeout: 5000 });
const { simulate, DEFAULTS, buildWorkerSource } = main.__main;

const posted = [];
const worker = { Math, Float64Array, Int32Array, Uint8Array, Date, Infinity, performance: { now: () => 0 }, self: { postMessage: message => posted.push(message) } };
vm.createContext(worker);
const workerSource = buildWorkerSource();
vm.runInContext(workerSource, worker, { timeout: 5000 });
const inWorker = expression => vm.runInContext(expression, worker);

// 1) Tax helpers: the worker must agree with the main thread on every bracket.
for (const gain of [0, 5000, 6000, 6001, 50000, 200000, 300000, 300001, 400000, 2500000]) {
  assert.equal(inWorker('progressiveSavingsTax(' + gain + ')'), core.progressiveSavingsTax(gain), 'worker progressiveSavingsTax(' + gain + ')');
  assert.equal(inWorker('netAfterSavingsTax(80000,0.6,' + gain + ')'), core.netAfterSavingsTax(80000, .6, gain), 'worker netAfterSavingsTax gain=' + gain);
  assert.equal(inWorker('NavlogCore.grossForNetSavings(30000,0.5,' + gain + ',1e7)'), core.grossForNetSavings(30000, .5, gain, 1e7), 'worker grossForNetSavings ytd=' + gain);
  assert.equal(inWorker('NavlogCore.marginalSavingsTaxRate(0.5,' + gain + ')'), core.marginalSavingsTaxRate(.5, gain), 'worker marginalSavingsTaxRate ytd=' + gain);
}
assert.equal(inWorker('progressiveSavingsTax(400000)'), 101880, 'worker applies the 30% bracket above 300k');
assert.equal(core.progressiveSavingsTax(400000), 101880);
assert.equal(inWorker('SAVINGS_BRACKETS[SAVINGS_BRACKETS.length-1].upTo'), Infinity, 'top bracket stays open-ended in the worker');
assert.equal(inWorker('IRPF_SAVINGS_BRACKETS[IRPF_SAVINGS_BRACKETS.length-1].upTo'), Infinity, 'IRPF bracket table keeps its open top in the worker');

// 2) Every NavlogCore member the simulation code calls must exist in the worker.
const called = new Set();
for (const source of [main.__main.simulate.toString(), main.__main.validateSimulationParams.toString()]) {
  for (const match of source.matchAll(/NavlogCore\.(\w+)/g)) called.add(match[1]);
}
for (const fn of Object.values(core)) if (typeof fn === 'function') for (const match of fn.toString().matchAll(/NavlogCore\.(\w+)/g)) if (inWorker('typeof NavlogCore.' + match[1]) === 'function') called.add(match[1]);
for (const name of called) assert.equal(inWorker('typeof NavlogCore.' + name), 'function', 'worker NavlogCore.' + name + ' must be defined');

// 2b) Static free-call check: every bare function call made by an embedded function must resolve inside the worker.
const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'new', 'else', 'do', 'in', 'of', 'void', 'throw']);
const embedded = [main.__main.simulate, main.__main.validateSimulationParams, ...['pathRandom', 'progressiveSavingsTax', 'netAfterSavingsTax', 'marginalSavingsTaxRate', 'providentFirst', 'beckhamApplies', 'wealthTaxBase', 'grossForNetSavings', 'validateAllocation', 'validateHorizon', 'validateLumpSums'].map(name => core[name])];
for (const fn of embedded) {
  const stringLiteral = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g;
  const text = fn.toString().replace(/\/\*[\s\S]*?\*\//g, '').replace(stringLiteral, "''").replace(/\/\/.*$/gm, ''); // drop comments and string literals
  const local = new Set([...text.matchAll(/function\s+(\w+)\s*\(/g)].map(m => m[1]));
  for (const m of text.matchAll(/(?:const|let|var)\s+(\w+)/g)) local.add(m[1]); // any locally declared name (function-valued locals included)
  for (const m of text.matchAll(/[(,]\s*(\w+)\s*(?=[,)=])/g)) local.add(m[1]); // parameters
  for (const m of text.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
    const name = m[1];
    if (KEYWORDS.has(name) || local.has(name)) continue;
    assert.notEqual(inWorker('typeof ' + name), 'undefined', 'worker is missing "' + name + '" called from ' + text.slice(0, 40).replace(/\s+/g, ' '));
  }
}

// 3) Full simulate() runs through the worker entry point must equal the main thread.
const rich = {
  ...DEFAULTS, proMode: true, seed: 20260921, startEq: 2500000, startBtc: 400000, startGold: 150000, gasto: 45000, swr: 3.5,
  taxOn: true, useIrpfBrackets: true, taxRepatDelay: 0, provOn: true, taxRateProv: 8, beckhamOn: false,
  wealthTaxOn: true, wealthExempt: 300000, mortgageBalance: 50000, reOn: true, reValue: 300000, reCountsFire: true,
  lolOn: true, lolAnnualProb: 3, glideOn: true, glideTargetYear: 2040, fxVolOn: true, inflOn: true, histMarketOn: false,
  baristaOn: true, lifeExpOn: true, lifeExp: 85, wdStrategy: 1, srrShockOn: true, profitShareWeeks: 6,
  mandatoryRetireOn: true, mandatoryRetireAge: 50, pensionAnnual: 6000, pensionStartAge: 40, healthcareAnnual: 1500, healthcareStartAge: 40,
  childAnnual: 3000, childStartAge: 30, childEndAge: 35, lumpSums: '[{"year":2032,"month":3,"amount":-20000},{"year":2034,"month":8,"amount":15000}]',
  horizonAge: 80
};
const variants = [
  rich,
  { ...rich, wdStrategy: 2, histMarketOn: true, beckhamOn: true, beckhamYears: 6, useIrpfBrackets: false, taxRate: 21, lolPayoutMode: 1 },
  { ...rich, taxRateProv: 30, startEq: 9000000, gasto: 200000, swr: 4, taxRepatDelay: 1 },
  { ...DEFAULTS, seed: 0 },
  { ...DEFAULTS, seed: null }
];
const toPlain = value => JSON.parse(JSON.stringify(value, (key, v) => ArrayBuffer.isView(v) ? Array.from(v) : v));
variants.forEach((params, index) => {
  if (params.seed === null) return; // unseeded runs are random by design
  posted.length = 0;
  worker.self.onmessage({ data: { p: params, paths: 24, reqId: index, calibrate: false } });
  assert.equal(posted.length, 1, 'worker answered variant ' + index);
  const fromWorker = toPlain(posted[0].result), fromMain = toPlain(simulate(params, 24));
  assert.deepEqual(fromWorker, fromMain, 'worker result equals main-thread result for variant ' + index);
});
// Unseeded runs must at least execute in the worker with every feature enabled.
posted.length = 0;
worker.self.onmessage({ data: { p: { ...rich, seed: null }, paths: 8, reqId: 99, calibrate: false } });
assert.equal(posted[0].result.fireMonthAll.length, 8, 'unseeded worker run completes');
// Sanity: the rich scenarios really exercise the withdrawal/tax path (otherwise parity would be vacuous).
const exercised = simulate(rich, 24);
assert.ok(exercised.fireMonthAll.some(month => month >= 0), 'parity scenario reaches retirement so drawdown/tax code runs');
// Validation errors raised inside the worker are user-facing Spanish text, never a ReferenceError.
assert.throws(() => worker.self.onmessage({ data: { p: { ...DEFAULTS, seed: 1, allocCash: 50 }, paths: 2, reqId: 1, calibrate: false } }), /100 %/, 'worker validation errors are translated');
assert.throws(() => worker.self.onmessage({ data: { p: { ...DEFAULTS, seed: 1, lumpSums: '[{"year":1,"month":1,"amount":1}]' }, paths: 2, reqId: 2, calibrate: false } }), /pago/i, 'worker payment-schedule errors are translated');
console.log('worker parity: OK');
