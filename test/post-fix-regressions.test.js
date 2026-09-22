const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../simulation-core.js');
const html = fs.readFileSync('index.html', 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const source = inline.slice(0, inline.indexOf('// The simulation runs off the main thread')) + '\nglobalThis.__test={simulate,DEFAULTS,buildRuinCurve};';
const context = { console, Math, Float64Array, Int32Array, Uint8Array, Date, Infinity, NavlogCore: core, document:{getElementById:()=>null}, globalThis:null };
context.globalThis=context; vm.createContext(context); vm.runInContext(source, context, {timeout:1000});
const {simulate, DEFAULTS, buildRuinCurve}=context.__test;
// Deterministic profile with REAL gains: 5 % return, no volatility, capital far above the FIRE target,
// so every path retires in the first month and withdraws part-gain money each month. (With ret:0 the
// gain fraction is zero and every tax assertion would pass even if the tax logic were deleted.)
const gainsBase={...DEFAULTS, seed:444, proMode:true, startEq:10000000, startBtc:0, ret:5, vol:0, btcRet:0, btcVol:0, gasto:120000, swr:4, vida:0, hip:0, nur:0, brOn:false, burr:0, provOn:false, startDelay:0, captDelay:0, taxRepatDelay:0, horizonAge:38, allocCash:0, allocBonds:0, allocEquities:100, taxRate:19};
const p50 = params => simulate(params,4).series.map(x=>x.p50);
const untaxed=p50({...gainsBase,taxOn:false});
const taxedFlat=p50({...gainsBase,taxOn:true,useIrpfBrackets:false});
const taxedBrackets=p50({...gainsBase,taxOn:true,useIrpfBrackets:true});
assert.equal(simulate({...gainsBase,taxOn:false},4).fireMonthAll[0],0,'scenario retires immediately, so drawdown/tax code runs from month 0');
for(let i=0;i<untaxed.length;i++){
  assert.ok(taxedFlat[i]<untaxed[i],'flat-rate gains tax reduces wealth (year index '+i+')');
  assert.ok(taxedBrackets[i]<untaxed[i],'progressive gains tax reduces wealth (year index '+i+')');
}
assert.ok(untaxed[untaxed.length-1]-taxedFlat[taxedFlat.length-1]>1000,'tax drag is material, not floating-point noise');
// Ley Beckham: taxed as a non-resident for its window, so an always-open window equals the untaxed run...
const beckhamAlways=p50({...gainsBase,taxOn:true,useIrpfBrackets:true,beckhamOn:true,beckhamYears:99});
assert.deepEqual(beckhamAlways,untaxed,'Beckham period suspends progressive gains tax');
assert.notDeepEqual(beckhamAlways,taxedBrackets,'and the taxed comparison run really differs (the assertion above is not vacuous)');
// ...its FIRST resident month is inside the window (no ordinary tax on month 0 with zero repatriation delay)...
const oneYear=p50({...gainsBase,taxOn:true,useIrpfBrackets:false,beckhamOn:true,beckhamYears:1});
const noWindow=p50({...gainsBase,taxOn:true,useIrpfBrackets:false,beckhamOn:true,beckhamYears:0});
assert.equal(oneYear[0],untaxed[0],'first Beckham months (Sep-Dec 2026) are untaxed');
assert.notEqual(noWindow[0],untaxed[0],'without a window the same months are taxed');
assert.equal(noWindow[0],taxedFlat[0],'a zero-year window behaves exactly like no Beckham');
// ...and it expires: after the window, ordinary tax resumes.
assert.ok(oneYear[oneYear.length-1]<untaxed[untaxed.length-1],'tax resumes once the Beckham window is over');
assert.ok(oneYear[oneYear.length-1]>taxedFlat[taxedFlat.length-1],'but the exempt year still leaves the path better off than never being exempt');
assert.notEqual(oneYear[1],untaxed[1],'the year after the window is already taxed');
// Provident vs savings brackets: in bracket mode the Provident tax rate must still steer the withdrawal
// order (cheap Provident is drained first, expensive one last), so the two runs cannot coincide.
// (Final gross wealth is not comparable across the two orders, hence only inequality is asserted.)
const providentBase={...DEFAULTS,seed:9,proMode:true,startEq:900000,startBtc:0,gasto:40000,swr:3.25,provOn:true,taxOn:true,useIrpfBrackets:true,taxRepatDelay:0,startDelay:0,captDelay:0,horizonAge:70,vol:0,ret:4};
const providentCheap=p50({...providentBase,taxRateProv:0}), providentDear=p50({...providentBase,taxRateProv:47});
assert.notDeepEqual(providentCheap,providentDear,'the Provident rate changes the withdrawal order in bracket mode');
assert.equal(providentCheap[0],providentDear[0],'orders only diverge once withdrawals start');
const fireMonthAll=new Int32Array(3000); fireMonthAll.fill(-1); fireMonthAll.set([12,12,12]);
const ruinMonth=new Int32Array(3000); ruinMonth.fill(-1); ruinMonth.set([14,14,14]);
const forcedOut=new Uint8Array(3000); forcedOut[1]=1; const licenseLossOut=new Uint8Array(3000); licenseLossOut[2]=1;
const curve=buildRuinCurve({fireMonthAll,ruinMonth,ruined:Uint8Array.from([1,1,1,...new Array(2997).fill(0)]),forcedOut,licenseLossOut},3000);
assert.equal(curve[0].atRisk,1,'ruin denominator includes voluntary FIRE only');
assert.equal(curve[0].pct,null,'small voluntary-only cohort is correctly marked insufficient rather than mixing forced exits');
assert.deepEqual(core.retirementCohortCounts({fireMonthAll,ruined:Uint8Array.from([1,1,1]),forcedOut,licenseLossOut},3),{voluntary:1,voluntaryRuined:1,forced:1,licenseLoss:1,preFireRuin:0,noRetirement:0},'headline and charts use the same voluntary cohort while exposing forced exits and LOL separately');
const seedZeroA=core.seededRandom(0), seedZeroB=core.seededRandom(0), seedFallback=core.seededRandom(0x9e3779b9);
assert.equal(seedZeroA(),seedZeroB(),'seed zero remains reproducible');
assert.notEqual(seedZeroB(),seedFallback(),'seed zero does not collide with fallback seed');
assert.throws(()=>core.seededRandom(''),'blank seed is not silently made deterministic');
assert.equal(core.marginalSavingsTaxRate(1,300001),30,'large YTD gains use the top progressive savings bracket');
assert.equal(core.providentFirst(10,[{balance:100000,basis:0}],300001),true,'cheaper Provident bucket wins over savings gains at the top bracket');
assert.equal(core.providentFirst(19,[{balance:100000,basis:50000}],300001),false,'effective gains tax accounts for the savings basis fraction');
const safeScenario={id:'sc1',name:'Safe',color:'#1F7A4D',visible:true,series:[{year:2030,p10:1,p50:2,p90:3}],target:100,ageMed:'40',successRate:.8,params:{ageNow:28}};
const normalized=core.normalizeScenarios([safeScenario,{...safeScenario,id:'sc2',name:'<img src=x onerror=alert(1)>'},{...safeScenario,id:'sc3',color:'red'}],['ageNow'],['#1F7A4D']);
assert.equal(normalized.length,2,'scenario sanitizer rejects invalid color while retaining valid records');
assert.equal(normalized[1].name,'<img src=x onerror=alert(1)>','untrusted scenario labels are kept as data for safe text-node rendering');
assert.deepEqual(core.normalizeScenarios('{broken',['ageNow'],['#1F7A4D']),[],'corrupt scenario payload recovers to empty list');
assert.equal(core.historicalWithdrawalBacktest([0,0],100,120,1).length,2,'historical sequential withdrawal backtest evaluates every eligible start year');
assert.ok(core.historicalWithdrawalBacktest([0],100,120,1)[0].ruined,'historical backtest records depletion');
assert.equal(core.wealthTaxBase(100000,500000,true),600000,'owned property remains in wealth-tax base independent of FIRE-capital toggle');
assert.equal(core.beckhamApplies(true,20,20,6),true,'Beckham regime applies on the first resident month, including zero repatriation delay');
assert.equal(core.beckhamApplies(true,20,92,6),false,'Beckham regime ends after its configured month window');
assert.equal(core.sameParameterSnapshot({seed:null,ageNow:28},{ageNow:28,seed:null}),true,'snapshot equality is independent of key order');
assert.equal(core.sameParameterSnapshot({seed:0},{seed:1}),false,'current controls cannot reuse stale scenario results');
// Wealth tax: owned property stays in the base even when it does not count as FIRE capital.
const wealthBase={...gainsBase, ret:0, reOn:true, reValue:500000, reCountsFire:false, reYield:0, reAppr:0, wealthExempt:0, wealthRate:0.5};
const finalP50=params=>{ const s=simulate(params,4).series; return s[s.length-1].p50; };
const dragWith=finalP50({...wealthBase,wealthTaxOn:false})-finalP50({...wealthBase,wealthTaxOn:true});
const dragWithout=finalP50({...wealthBase,reOn:false,wealthTaxOn:false})-finalP50({...wealthBase,reOn:false,wealthTaxOn:true});
assert.ok(dragWithout>100000,'wealth tax bites the liquid portfolio (0.5 % of ~EUR 10M over ~10 years)');
assert.ok(dragWith-dragWithout>20000,'EUR 500k of owned property adds ~EUR 2.5k/year of wealth tax even though it is not FIRE capital (got '+(dragWith-dragWithout).toFixed(0)+')');
// Beckham also pauses the wealth tax.
const wealthBeckham=finalP50({...wealthBase,wealthTaxOn:true,beckhamOn:true,beckhamYears:99}), wealthNone=finalP50({...wealthBase,wealthTaxOn:false});
assert.equal(wealthBeckham,wealthNone,'wealth tax is paused during the Beckham window');
console.log('post-fix regressions: OK');
