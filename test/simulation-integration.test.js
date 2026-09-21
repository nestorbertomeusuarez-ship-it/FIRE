const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../simulation-core.js');
const html = fs.readFileSync('index.html', 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
assert.doesNotThrow(() => new vm.Script(inline), 'complete inline application script parses');
assert.match(inline, /span\.append\(marker,document\.createTextNode\(sc\.name\)\)/, 'saved scenario names render as text nodes');
const workerFunction = inline.slice(inline.indexOf('function buildWorkerSource(){'), inline.indexOf('\nlet worker=null;'));
const simulationSource = inline.slice(0, inline.indexOf('// Renderer shared by the inline chart')) + '\n' + workerFunction + '\nglobalThis.__simTest={simulate,DEFAULTS,buildWorkerSource,readParams,setSeedValue:value=>{el.seed={type:"number",value};}};';
const context = { console, Math, Float64Array, Int32Array, Uint8Array, Date, Infinity, NavlogCore: core,
  document: { getElementById: () => null }, globalThis: null };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(simulationSource, context, { timeout: 1000 });
const { simulate, DEFAULTS, buildWorkerSource, readParams, setSeedValue } = context.__simTest;
assert.equal(readParams().seed,null,'empty seed control resolves to random mode, not NaN');
setSeedValue('0');
assert.equal(readParams().seed,0,'seed control preserves a valid zero seed');
const p = { ...DEFAULTS, seed: 7, proMode: true, lolOn: true, lolAnnualProb: 100, lolPayoutMode: 1,
  lolReplacePct: 60, lolReplaceYears: 3, startEq: 0, startBtc: 0, ret: 0, vol: 0, btcRet: 0, btcVol: 0,
  vida: 0, hip: 0, nur: 0, gasto: 1, brOn: false, provOn: false, mandatoryRetireOn: false };
const loss = simulate(p, 8);
assert.equal(loss.fireMonths.length, 0, 'Loss-of-License exits never count as voluntary FIRE');
assert.equal([...loss.licenseLossOut].filter(Boolean).length, 8, 'Loss-of-License is explicitly reported');
assert.ok(loss.series.find(x => x.year === 2027).p50 > 0, 'first-month income replacement uses contractual salary, not EUR 0');
const reproducibleA = simulate({ ...DEFAULTS, seed: 99, ret: 2, vol: 10 }, 12);
const reproducibleB = simulate({ ...DEFAULTS, seed: 99, ret: 2, vol: 10 }, 12);
assert.deepEqual(reproducibleA.series.map(x => x.p50), reproducibleB.series.map(x => x.p50), 'seeded full simulations reproduce');
const posted=[];
const workerContext={Math,Float64Array,Int32Array,Uint8Array,Date,Infinity,performance:{now:()=>0},self:{postMessage:message=>posted.push(message)}};
vm.createContext(workerContext);
vm.runInContext(buildWorkerSource(),workerContext,{timeout:1000});
workerContext.self.onmessage({data:{p:{...DEFAULTS,seed:7},paths:2,reqId:1,calibrate:false}});
assert.equal(posted[0].reqId,1,'generated worker source links with the current simulation core');
assert.equal(posted[0].result.fireMonthAll.length,2,'generated worker executes seeded simulation paths');
console.log('simulation integration regressions: OK');
