const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../simulation-core.js');
const html = fs.readFileSync('index.html', 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
assert.doesNotThrow(() => new vm.Script(inline), 'complete inline application script parses');
assert.match(inline, /span\.append\(marker,document\.createTextNode\(sc\.name\)\)/, 'saved scenario names render as text nodes');
const workerFunction = inline.slice(inline.indexOf('function buildWorkerSource(){'), inline.indexOf('\n// Job manager for the simulation worker'));
const simulationSource = inline.slice(0, inline.indexOf('// Renderer shared by the inline chart')) + '\n' + workerFunction + '\nglobalThis.__simTest={simulate,DEFAULTS,buildWorkerSource,readParams,controls:el,setSeedValue:value=>{el.seed={type:"number",value};}};';
const context = { console, Math, Float64Array, Int32Array, Uint8Array, Date, Infinity, NavlogCore: core,
  document: { getElementById: () => null }, globalThis: null };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(simulationSource, context, { timeout: 1000 });
const { simulate, DEFAULTS, buildWorkerSource, readParams, controls, setSeedValue } = context.__simTest;
assert.equal(readParams().seed,null,'empty seed control resolves to random mode, not NaN');
setSeedValue('0');
assert.equal(readParams().seed,0,'seed control preserves a valid zero seed');
controls.cashRet={type:'number',value:'not-a-number',min:'-10',max:'20'};
assert.throws(()=>readParams(),/cashRet.*n.mero finito/,'invalid numeric controls block a simulation before it starts');
controls.cashRet=null;
controls.horizonAge={type:'number',value:'109',min:'19',max:'110'};
assert.throws(()=>readParams(),/horizon/,'a horizon beyond 80 years is visibly blocked');
controls.horizonAge=null;
assert.throws(()=>simulate({...DEFAULTS,cashRet:NaN},2),/cashRet.*n.mero finito/,'direct and worker simulation calls reject non-finite numeric parameters');
assert.match(html,/function serializeScenarioParams\(params\)/,'scenario saves serialize reconstructed payment schedules');
assert.match(html,/exportScenarios[\s\S]*?addEventListener/,'scenario export control is wired');
assert.match(html,/exportCsv[\s\S]*?addEventListener/,'report export control is wired');
assert.match(html,/id="ageNow"[^>]*min="18"[^>]*max="75"/,'current age is an editable bounded control');
assert.match(html,/function syncHorizonControl\(\)[\s\S]*?current\+80/,'horizon maximum is synchronized to the engine limit');
const syncSource=inline.slice(inline.indexOf('function syncHorizonControl(){'),inline.indexOf('\nfunction readParams(){'));
const loadSource=inline.slice(inline.indexOf('function loadScenario(id){'),inline.indexOf('\nfunction deleteScenario',inline.indexOf('function loadScenario(id){')));
const scenarioControls={
  ageNow:{type:'number',value:'60'}, horizonAge:{type:'number',value:'109'}, careerYear:{type:'number',value:'2080'},
  proMode:{type:'checkbox',checked:false}, seed:{type:'number',value:''}
};
const scenarioContext={Number,String,Math,Object,JSON,Array,START_YEAR:2026,CAREER_YEAR_MAX:2040,showScenarioMsg:()=>{},el:scenarioControls,ids:['ageNow','horizonAge','careerYear','proMode','seed'],
  DEFAULTS:{ageNow:28,horizonAge:90,careerYear:2027,proMode:false,seed:null},
  savedScenarios:[{id:'saved-at-28',params:{ageNow:28,horizonAge:90,careerYear:2080,proMode:false}},
    {id:'hostile',params:{ageNow:'evil',horizonAge:true,careerYear:NaN,proMode:5,seed:-3,__proto__:{ageNow:1}}},
    {id:'seeded',params:{seed:0}},{id:'unseeded',params:{seed:null}}],
  document:{body:{classList:{toggle:()=>{}}}},initVisibleLabels:()=>{},safeRun:()=>{},globalThis:null};
scenarioContext.globalThis=scenarioContext; vm.createContext(scenarioContext);
vm.runInContext(syncSource+'\n'+loadSource+'\nglobalThis.loadScenarioForTest=loadScenario;',scenarioContext);
scenarioContext.loadScenarioForTest('saved-at-28');
assert.equal(scenarioControls.ageNow.value,28,'scenario load restores its saved current age');
assert.equal(scenarioControls.horizonAge.value,90,'scenario load restores its saved horizon');
assert.equal(scenarioControls.horizonAge.max,'108','loaded age synchronizes the 80-year horizon cap');
assert.equal(scenarioControls.careerYear.max,'2040','loaded age and horizon synchronize the career-year cap (capped by CAREER_YEAR_MAX)');
scenarioControls.ageNow.value='60'; scenarioControls.horizonAge.value='80'; scenarioControls.careerYear.value='2040';
scenarioContext.loadScenarioForTest('hostile');
assert.equal(scenarioControls.ageNow.value,'60','a non-numeric saved age is ignored, never written into the control');
assert.equal(scenarioControls.horizonAge.value,'80','a boolean where a number is expected is ignored');
assert.equal(scenarioControls.careerYear.value,'2040','NaN is ignored');
assert.equal(scenarioControls.proMode.checked,false,'a non-boolean where a checkbox is expected is ignored');
scenarioContext.loadScenarioForTest('seeded');
assert.equal(scenarioControls.seed.value,'0','seed zero is restored');
scenarioContext.loadScenarioForTest('unseeded');
assert.equal(scenarioControls.seed.value,'','a random-seed scenario clears the seed control');
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
