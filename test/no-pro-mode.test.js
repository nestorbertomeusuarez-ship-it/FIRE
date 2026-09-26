// "Modo PRO" was removed: every former PRO section is always visible and always active
// through its own toggle. The only master on/off switch left is Spanish taxation
// (fiscalOn), off by default. Portfolio costs (TER) always apply.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const core = require('../simulation-core.js');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const source = inline.slice(0, inline.indexOf('// The simulation runs off the main thread')) + '\nglobalThis.__test={simulate,DEFAULTS};';
const context = { console, Math, Float64Array, Int32Array, Uint8Array, Date, Infinity, NavlogCore: core, document: { getElementById: () => null }, globalThis: null };
context.globalThis = context; vm.createContext(context); vm.runInContext(source, context, { timeout: 1000 });
const { simulate, DEFAULTS } = context.__test;
const p50 = p => simulate(p, 8).series.map(x => x.p50);

test('no proMode id/key/class anywhere in index.html', () => {
  assert.equal(/\bproMode\b/.test(html), false, 'no proMode identifier remains');
  assert.equal(/\bpro-only\b/.test(html), false, 'no pro-only class remains');
  assert.equal(/class="proRow"/.test(html), false, 'no proRow wrapper remains');
  assert.equal('proMode' in DEFAULTS, false, 'DEFAULTS has no proMode key');
});

test('fiscalOn checkbox exists, defaults to false, and is the first control of the Fiscalidad group', () => {
  assert.equal(DEFAULTS.fiscalOn, false, 'fiscalOn defaults to off');
  const groupStart = html.indexOf('<h3>Fiscalidad España</h3>');
  assert.notEqual(groupStart, -1, 'the Fiscalidad group exists, without a PRO prefix');
  const groupEnd = html.indexOf('<h3>', groupStart + 1);
  const group = html.slice(groupStart, groupEnd);
  const fiscalOnIdx = group.indexOf('id="fiscalOn"');
  assert.notEqual(fiscalOnIdx, -1, 'fiscalOn lives inside the Fiscalidad group');
  // No other checkbox/range input precedes it within the group (start from its own <input tag).
  const before = group.slice(0, group.lastIndexOf('<input', fiscalOnIdx));
  assert.equal(/<input\b/.test(before), false, 'fiscalOn is the first control of the group');
  const toggleBlock = group.slice(group.indexOf('<div class="toggle">'), group.indexOf('</div>', fiscalOnIdx) + 6);
  assert.match(toggleBlock, /<p class="hint">/, 'fiscalOn has its own hint');
});

test('cost sliders live in their own "Costes de la cartera" group, not inside Fiscalidad', () => {
  const costGroupStart = html.indexOf('<h3>Costes de la cartera</h3>');
  assert.notEqual(costGroupStart, -1, 'the Costes de la cartera group exists');
  const costGroupEnd = html.indexOf('<h3>', costGroupStart + 1);
  const costGroup = html.slice(costGroupStart, costGroupEnd);
  const fiscalGroupStart = html.indexOf('<h3>Fiscalidad España</h3>');
  const fiscalGroupEnd = html.indexOf('<h3>', fiscalGroupStart + 1);
  const fiscalGroup = html.slice(fiscalGroupStart, fiscalGroupEnd);
  for (const id of ['feeCash', 'feeCons', 'feeEq', 'feeBtc', 'feeGold', 'feeProv']) {
    assert.ok(costGroup.includes('id="' + id + '"'), '#' + id + ' lives in Costes de la cartera');
    assert.equal(fiscalGroup.includes('id="' + id + '"'), false, '#' + id + ' no longer lives in Fiscalidad');
  }
});

test('no "PRO ·" prefixed group titles remain', () => {
  assert.equal(/PRO\s*·/.test(html), false, 'no group title keeps the PRO prefix');
});

test('with fiscalOn off, taxOn/wealthTaxOn/beckhamOn have no effect (equivalent to a fully untaxed run)', () => {
  const base = { ...DEFAULTS, seed: 11, fiscalOn: false, startEq: 2000000, startBtc: 0, ret: 5, vol: 0, btcRet: 0, btcVol: 0, consRet: 0, consVol: 0, cashRet: 0, cashVol: 0, gasto: 40000, swr: 3.25, horizonAge: 75, taxRepatDelay: 0 };
  const taxed = { ...base, taxOn: true, wealthTaxOn: true, beckhamOn: true, useIrpfBrackets: true };
  assert.deepEqual(p50(taxed), p50({ ...base, taxOn: false, wealthTaxOn: false, beckhamOn: false }), 'fiscalOn:false ignores every Spanish tax toggle');
});

test('with fiscalOn on, Spanish taxation reduces outcomes versus fiscalOn off', () => {
  const base = { ...DEFAULTS, seed: 13, startEq: 4000000, startBtc: 0, ret: 5, vol: 0, btcRet: 0, btcVol: 0, consRet: 0, consVol: 0, cashRet: 0, cashVol: 0, gasto: 40000, swr: 3.25, horizonAge: 75, taxRepatDelay: 0, taxOn: true, taxRate: 19 };
  const off = p50({ ...base, fiscalOn: false });
  const on = p50({ ...base, fiscalOn: true });
  assert.ok(on[on.length - 1] < off[off.length - 1], 'Spanish capital-gains tax lowers final wealth once fiscalOn is on');
});

test('portfolio costs (TER) always apply, with no other switch needed', () => {
  const base = { ...DEFAULTS, seed: 5, startEq: 2000000, startBtc: 0, ret: 5, vol: 0, btcRet: 0, btcVol: 0, consRet: 0, consVol: 0, cashRet: 0, cashVol: 0, gasto: 40000, swr: 3.25, horizonAge: 75, fiscalOn: false };
  const noFees = p50({ ...base, feeEq: 0, feeCash: 0, feeCons: 0, feeBtc: 0, feeGold: 0, feeProv: 0 });
  const withFees = p50({ ...base, feeEq: 1.5, feeCash: 0, feeCons: 0, feeBtc: 0, feeGold: 0, feeProv: 0 });
  assert.ok(withFees[withFees.length - 1] < noFees[noFees.length - 1], 'a nonzero feeEq lowers median final wealth with no PRO switch involved');
});

test('inflOn works with no proMode/master switch involved', () => {
  const base = { ...DEFAULTS, seed: 9, startEq: 1000000, startBtc: 0, ret: 5, vol: 5, btcRet: 0, btcVol: 0, gasto: 30000, swr: 3.25, horizonAge: 60 };
  const off = p50({ ...base, inflOn: false });
  const on = p50({ ...base, inflOn: true, inflVol: 4 });
  assert.notDeepEqual(on, off, 'inflOn changes the trajectory on its own');
});

test('the sensitivity fee entries no longer carry a proOnly marker', () => {
  const start = html.indexOf('const SENSITIVITY_PARAMS');
  const block = html.slice(start, html.indexOf('\n];', start));
  for (const id of ['feeCash', 'feeCons', 'feeEq', 'feeBtc', 'feeGold', 'feeProv']) {
    const line = block.split('\n').find(l => l.includes(`key:'${id}'`));
    assert.equal(/proOnly/.test(line), false, `${id} is no longer proOnly`);
  }
  const run = html.slice(html.indexOf('async function runSensitivity'), html.indexOf('async function runSensitivity') + 800);
  assert.equal(/proOnly/.test(run), false, 'runSensitivity no longer filters by proOnly');
});

test('saved scenarios use a bumped storage key and drop the legacy one', () => {
  assert.match(html, /const SCENARIO_STORAGE_KEY\s*=\s*'fireSimScenariosV2'/, 'the scenario storage key was bumped');
  assert.match(html, /localStorage\.removeItem\(LEGACY_SCENARIO_STORAGE_KEY\)/, 'the legacy key is removed on load');
});

test('a scenario carrying the legacy proMode key is rejected, not re-enabled', () => {
  const scenario = params => ({ id: 'legacy1', name: 'Legacy', color: '#1F7A4D', visible: true, target: 1, successRate: .5, ageMed: '65', series: [{ year: 2030, p10: 1, p50: 2, p90: 3 }], params });
  const PARAM_TYPES = Object.fromEntries(Object.keys(DEFAULTS).map(k => [k, k === 'seed' ? 'seed' : k === 'lumpSums' ? 'lumpSums' : typeof DEFAULTS[k] === 'boolean' ? 'boolean' : 'number']));
  const result = core.normalizeScenarios([scenario({ ...DEFAULTS, proMode: true })], PARAM_TYPES, ['#1F7A4D']);
  assert.equal(result.length, 0, 'a scenario with the unknown legacy proMode key is dropped, never applied');
});
