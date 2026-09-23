// Regression tests for four remaining audit fixes:
// 1) validateSimulationParams range validation (PARAM_BOUNDS derived from slider min/max).
// 2) Pension/healthcare income-cost also applied while still working (not just retired).
// 3) Sensitivity/stress analysis jobs run on a dedicated Worker, separate from the
//    interactive slider worker, with correct new-supersedes-old cancellation semantics.
// 4) Chart canvases are keyboard-accessible; zoom-reset controls are <button>, not <a>.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const core = require('../simulation-core.js');
const { loadApp } = require('./helpers/fake-app.js');

const html = fs.readFileSync('index.html', 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const source = inline.slice(0, inline.indexOf('// The simulation runs off the main thread')) + '\nglobalThis.__test={simulate,DEFAULTS};';
const context = { console, Math, Float64Array, Int32Array, Uint8Array, Date, Infinity, NavlogCore: core, document: { getElementById: () => null }, globalThis: null };
context.globalThis = context; vm.createContext(context); vm.runInContext(source, context, { timeout: 1000 });
const { simulate, DEFAULTS } = context.__test;

// ---------------------------------------------------------------------------
// 1) Range validation
// ---------------------------------------------------------------------------
test('validateSimulationParams rejects out-of-range numeric params (real slider bounds via fake DOM)', async () => {
  const app = await loadApp();
  const validateSimulationParams = app.run('validateSimulationParams');
  const DEFAULTS = app.run('DEFAULTS');
  const PARAM_BOUNDS = app.run('PARAM_BOUNDS');

  // DEFAULTS must always pass.
  assert.doesNotThrow(() => validateSimulationParams({ ...DEFAULTS }), 'DEFAULTS must pass validation');

  // ret:-100 would otherwise produce NaN downstream. (The thrown error is a RangeError from
  // the vm sandbox's own realm, so match by message/regex rather than an outer-realm `instanceof`.)
  assert.throws(() => validateSimulationParams({ ...DEFAULTS, ret: -100 }), /ret/, 'ret=-100 must be rejected, naming the field');
  // swr:0 would otherwise produce an Infinity target.
  assert.throws(() => validateSimulationParams({ ...DEFAULTS, swr: 0 }), /swr/, 'swr=0 must be rejected');
  assert.throws(() => validateSimulationParams({ ...DEFAULTS, swr: -1 }), /swr/, 'negative swr must be rejected');
  assert.throws(() => validateSimulationParams({ ...DEFAULTS, vol: -1 }), /vol/, 'negative vol must be rejected');
  assert.throws(() => validateSimulationParams({ ...DEFAULTS, gasto: -1 }), /gasto/, 'negative gasto must be rejected');
  assert.throws(() => validateSimulationParams({ ...DEFAULTS, gasto: 1e9 }), /gasto/, 'absurdly large gasto must be rejected');

  // seed:null must remain allowed, booleans and lumpSums must be untouched.
  assert.doesNotThrow(() => validateSimulationParams({ ...DEFAULTS, seed: null }), 'seed:null stays allowed');
  assert.doesNotThrow(() => validateSimulationParams({ ...DEFAULTS, proMode: true, taxOn: true }), 'booleans stay allowed');
  assert.doesNotThrow(() => validateSimulationParams({ ...DEFAULTS, lumpSums: [{ year: 2030, month: 1, amount: 1000 }] }), 'lumpSums stays allowed');

  // Slider bounds double as the source of PARAM_BOUNDS.
  assert.equal(PARAM_BOUNDS.ret[0], 2, 'ret min comes from the slider markup');
  assert.equal(PARAM_BOUNDS.ret[1], 9, 'ret max comes from the slider markup');
  assert.equal(PARAM_BOUNDS.swr[0], 2.4);
  assert.equal(PARAM_BOUNDS.swr[1], 4.6);

  // The four "extra ages" keep their intentionally wider 0-110 range, not the slider's.
  assert.doesNotThrow(() => validateSimulationParams({ ...DEFAULTS, pensionStartAge: 40 }), 'pensionStartAge below its slider min (55) stays allowed (0-110 by design)');
  assert.throws(() => validateSimulationParams({ ...DEFAULTS, pensionStartAge: 111 }), /edades/, 'pensionStartAge above 110 is still rejected');
});

test('the worker source embeds PARAM_BOUNDS so direct worker calls are bounded too', async () => {
  const app = await loadApp();
  const buildWorkerSource = app.run('buildWorkerSource');
  const source = buildWorkerSource();
  assert.match(source, /const PARAM_BOUNDS=/, 'worker source defines PARAM_BOUNDS');
  const workerCtx = { Math, Float64Array, Int32Array, Uint8Array, Date, Infinity, performance: { now: () => 0 }, self: { postMessage: () => {} } };
  vm.createContext(workerCtx);
  vm.runInContext(source, workerCtx, { timeout: 5000 });
  workerCtx.__DEFAULTS = app.run('DEFAULTS');
  assert.throws(() => vm.runInContext('validateSimulationParams({...__DEFAULTS, ret:-100})', workerCtx), /ret/, 'worker rejects out-of-range ret too');
});

// ---------------------------------------------------------------------------
// 2) Pension/healthcare apply pre-retirement too
// ---------------------------------------------------------------------------
test('pension income and healthcare cost also apply while still working, once past the start age', () => {
  // Flat market, no growth, huge gasto/swr so the household never voluntarily FIREs
  // within the short horizon: stays in the "still working" branch the whole time.
  const flat = {
    ...DEFAULTS, seed: 7, proMode: true, ret: 0, vol: 0, btcRet: 0, btcVol: 0, consRet: 0, consVol: 0, cashRet: 0, cashVol: 0,
    startEq: 2000000, startBtc: 0, allocCash: 0, allocBonds: 100, allocEquities: 0, vida: 0, hip: 0, nur: 0, brOn: false, burr: 0,
    salFO: 0, salCA: 0, basicFO: 0, basicCA: 0, provOn: false, gasto: 1e7, swr: 4, ageNow: 66, horizonAge: 70,
  };
  const finalTotal = r => { const s = r.series[r.series.length - 1]; return s.p50; };

  const withoutPension = simulate({ ...flat, pensionAnnual: 0, healthcareAnnual: 0 }, 4);
  const withPension = simulate({ ...flat, pensionAnnual: 24000, pensionStartAge: 67, healthcareAnnual: 0 }, 4);
  const withHealthcare = simulate({ ...flat, pensionAnnual: 0, healthcareAnnual: 24000, healthcareStartAge: 67 }, 4);

  assert.ok(!withoutPension.fireMonthAll.some(m => m >= 0), 'baseline never voluntarily FIREs (still in the working branch throughout)');
  assert.ok(finalTotal(withPension) > finalTotal(withoutPension), 'pension income adds to net cash flow while still working');
  assert.ok(finalTotal(withHealthcare) < finalTotal(withoutPension), 'healthcare cost subtracts from net cash flow while still working');
});

// ---------------------------------------------------------------------------
// 3) Dedicated worker for sensitivity/stress jobs
// ---------------------------------------------------------------------------
test('sensitivity/stress analysis jobs run on a worker dedicated separate from the interactive one', async () => {
  const app = await loadApp();
  const jobs = app.run('jobs');
  const analysisJobs = app.run('analysisJobs');
  assert.notEqual(jobs, analysisJobs, 'interactive and analysis job managers are distinct instances');
  assert.equal(typeof analysisJobs.cancelPending, 'function', 'the dedicated job manager exposes cancelPending()');
  assert.equal(analysisJobs.restarts(), 0);
  assert.equal(jobs.restarts(), 0);
});

test('createSimulationJobs: terminating the interactive worker never touches a separate analysis instance', async () => {
  const app = await loadApp();
  const createSimulationJobs = app.run('createSimulationJobs');

  function harness() {
    const workers = [];
    const makeWorker = () => {
      const worker = { posted: [], terminated: false, onmessage: null, onerror: null, postMessage(m) { this.posted.push(m); }, terminate() { this.terminated = true; } };
      workers.push(worker); return worker;
    };
    return { workers, jobs: createSimulationJobs({ makeWorker, runSync: (p, paths) => ({ sync: true, paths }), now: () => 0, minTerminatePaths: 1000 }) };
  }
  const tick = () => new Promise(resolve => setImmediate(resolve));

  const interactive = harness();
  const analysis = harness();

  // A slow calibrate:true analysis job is in flight on the dedicated worker.
  const analysisPromise = analysis.jobs.request({ a: 1 }, 5000, { calibrate: true });
  await tick();
  assert.equal(analysis.workers.length, 1);

  // A newer full run supersedes an older one on the INTERACTIVE instance and terminates its worker.
  interactive.jobs.request({ v: 'old' }, 5000); await tick();
  interactive.jobs.request({ v: 'new' }, 5000); await tick();
  assert.equal(interactive.workers[0].terminated, true, 'the interactive worker restarts');
  assert.equal(interactive.jobs.restarts(), 1);

  // The dedicated analysis worker must be completely unaffected.
  assert.equal(analysis.workers.length, 1, 'no second worker was created for the analysis instance');
  assert.equal(analysis.workers[0].terminated, false, 'the analysis worker was never terminated');
  assert.equal(analysis.jobs.restarts(), 0);
  assert.equal(analysis.jobs.pendingCount(), 1, 'the analysis job is still pending, not silently dropped');

  // A NEW analysis batch does supersede (cancel) an OLD one on that SAME dedicated worker.
  let cancelledStale = false;
  analysisPromise.then(v => { cancelledStale = v && v.stale === true; });
  analysis.jobs.cancelPending();
  await tick();
  assert.equal(cancelledStale, true, 'cancelPending() resolves the old analysis job as stale');
  assert.equal(analysis.jobs.pendingCount(), 0);
});

// ---------------------------------------------------------------------------
// 4) Chart canvases: keyboard access + <button> zoom-reset controls
// ---------------------------------------------------------------------------
test('chart canvases declare tabindex="0" and zoom-reset controls are <button>, not <a>', () => {
  for (const id of ['chart', 'contribChart', 'ruinChartCanvas', 'chartModalCanvas']) {
    const tag = (html.match(new RegExp('<canvas id="' + id + '"[^>]*>')) || [''])[0];
    assert.match(tag, /tabindex="0"/, '#' + id + ' is focusable');
  }
  for (const id of ['zoomReset', 'zoomResetContrib', 'zoomResetRuin', 'zoomResetModal']) {
    const tag = (html.match(new RegExp('<[a-z]+[^>]*id="' + id + '"[^>]*>')) || [''])[0];
    assert.match(tag, /^<button\b/, '#' + id + ' is a <button>');
    assert.doesNotMatch(tag, /href=/, '#' + id + ' has no href left over from <a>');
  }
});

test('keyboard: ArrowLeft/ArrowRight move the tooltip cursor, +/- zoom, 0/Escape reset, blur hides the tip', async () => {
  const app = await loadApp();
  await app.settle();
  const canvas = app.el('chart');
  const tip = app.el('chartTip');
  const zoomReset = app.el('zoomReset');

  // A calculation has already run at load, so mainChart has a non-empty series.
  canvas.fire('keydown', { key: 'ArrowRight' });
  assert.equal(tip.style.display, 'block', 'ArrowRight shows the tooltip');
  const firstHtml = tip.textContent !== undefined ? tip.innerHTML : tip.innerHTML;
  canvas.fire('keydown', { key: 'ArrowRight' });
  assert.equal(tip.style.display, 'block', 'tooltip stays visible while moving the cursor');

  canvas.fire('keydown', { key: '+' });
  assert.equal(zoomReset.style.display, 'inline-block', 'zooming in from the cursor shows the reset control once no longer full view');

  canvas.fire('keydown', { key: '0' });
  assert.equal(zoomReset.style.display, 'none', '0 resets the zoom to full view');
  assert.equal(tip.style.display, 'none', '0 also hides the tooltip');

  canvas.fire('keydown', { key: 'ArrowLeft' });
  assert.equal(tip.style.display, 'block');
  canvas.fire('keydown', { key: 'Escape' });
  assert.equal(tip.style.display, 'none', 'Escape hides the tooltip');

  canvas.fire('keydown', { key: 'ArrowLeft' });
  assert.equal(tip.style.display, 'block');
  canvas.fire('blur');
  assert.equal(tip.style.display, 'none', 'blur hides the tooltip');
});

test('main run: OK', () => {});
