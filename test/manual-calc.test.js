// Manual-calculation mode: sliders/inputs only repaint labels and mark results stale;
// a "Calcular" button (#runCalc) runs the actual simulation, with a precision selector
// (#calcPrecision / #calcSeconds) controlling the time budget and path-count ceiling.
// Reset, loading a scenario and the initial page load still recalculate for real.
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/fake-app.js');

(async () => {
  const app = await loadApp();
  const { el, env } = app;
  const setValue = (id, value) => { el(id).value = value; };
  const quiesce = async () => { for (let round = 0; round < 4; round++) { env.flushTimers(); await app.settle(); } };
  const isStale = () => app.run("document.body.className.split(' ').includes('stale')");
  await quiesce(); // the page's own start-up run

  // ---- initial load already computed a result with the default ("fast") precision ----
  assert.ok(app.run('lastSeries'), 'the initial load produced a result without pressing Calcular');
  assert.ok(app.run('lastFullParams'), 'the initial load recorded lastFullParams');
  assert.equal(el('calcPrecision').value, 'fast', 'the default precision preset is "Rápida"');
  assert.equal(el('runCalc').tagName, 'BUTTON');
  assert.equal(el('runCalc').getAttribute('type'), 'button');

  // ---- calcPrecision / calcSeconds are UI-only: never part of DEFAULTS, ids, params or snapshots ----
  assert.equal(app.run('DEFAULTS.calcPrecision'), undefined);
  assert.equal(app.run('DEFAULTS.calcSeconds'), undefined);
  assert.equal(app.run("ids.includes('calcPrecision')"), false);
  assert.equal(app.run("ids.includes('calcSeconds')"), false);
  assert.equal(app.run("Object.prototype.hasOwnProperty.call(readParams(),'calcPrecision')"), false);
  assert.equal(app.run("Object.prototype.hasOwnProperty.call(lastFullParams,'calcPrecision')"), false);

  // A committed seed makes every subsequent full run use the fixed, uncalibrated seeded path
  // count (see calibratePathsFull()) instead of the real multi-second wall-clock calibration that
  // an unseeded run deliberately performs — this test presses Calcular/reset/etc. many times, so
  // staying seeded keeps it fast without changing anything this file actually asserts.
  setValue('seed', '7');

  // ---- dragging a slider only repaints labels/constraints and marks results stale: no run happens ----
  const seriesBefore = JSON.stringify(app.run('lastSeries'));
  const fullParamsBefore = JSON.stringify(app.run('lastFullParams'));
  setValue('gasto', '70000');
  el('gasto').fire('input');
  assert.equal(env.pendingTimers(), 0, 'no debounced run is scheduled by a slider input');
  await quiesce();
  assert.equal(JSON.stringify(app.run('lastSeries')), seriesBefore, 'no new calculation ran');
  assert.equal(JSON.stringify(app.run('lastFullParams')), fullParamsBefore, 'lastFullParams is untouched');
  assert.match(el('gasto_o').textContent, /70/, 'the label still repaints immediately');
  assert.ok(isStale(), 'the body is marked stale after a param change');
  assert.equal(el('staleNotice').style.display, 'block', 'the stale notice becomes visible');
  assert.match(el('staleNotice').textContent, /Calcular/, 'the notice tells the user to press Calcular');
  assert.equal(el('saveScenario').disabled, true, 'saving is disabled while stale');

  // ---- an invalid combination is still surfaced immediately (no run needed to validate) ----
  // Set both ages directly (bypassing childEndAge/childStartAge's own syncChildAges self-clamp,
  // same technique test/label-painting.test.js uses) and fire an unrelated control's 'input'.
  setValue('childStartAge', '50'); setValue('childEndAge', '40');
  el('cashRet').fire('input');
  assert.match(el('assumptionError').textContent, /hijo/i, 'cross-field errors surface without pressing Calcular');
  setValue('childStartAge', app.run('DEFAULTS.childStartAge')); setValue('childEndAge', app.run('DEFAULTS.childEndAge'));
  el('cashRet').fire('input');
  assert.equal(el('assumptionError').textContent, '', 'the error clears once the combination is valid again');

  // ---- clicking Calcular runs the real calculation and clears the stale state ----
  await el('runCalc').fireAsync('click');
  await quiesce();
  assert.notEqual(JSON.stringify(app.run('lastFullParams')), fullParamsBefore, 'Calcular produced a fresh full-precision result');
  assert.equal(app.run('lastFullParams').gasto, 70000, 'the new result reflects the changed slider');
  assert.equal(isStale(), false, 'no longer stale after Calcular');
  assert.equal(el('staleNotice').style.display, 'none');
  assert.equal(el('saveScenario').disabled, false, 'saving is available again once results match the current params');

  // ---- Calcular disables itself and shows progress while running, and re-enables afterwards ----
  {
    const runPromise = app.run('safeRun("full")');
    assert.equal(el('runCalc').disabled, true, 'the button disables itself while a full run is in flight');
    assert.equal(el('runCalcProgress').style.display, 'inline');
    assert.match(el('runCalcProgress').textContent, /Calculando/);
    await runPromise; await quiesce();
    assert.equal(el('runCalc').disabled, false, 're-enabled once the run finishes');
    assert.equal(el('runCalcProgress').style.display, 'none');
  }

  // ---- Restaurar valores base recalculates immediately (not just "stale") ----
  setValue('gasto', '90000'); el('gasto').fire('input'); await quiesce();
  assert.ok(isStale());
  el('reset').fire('click');
  await quiesce();
  assert.equal(app.run('lastFullParams').gasto, app.run('DEFAULTS.gasto'), 'reset recalculated with the restored defaults');
  assert.equal(isStale(), false, 'reset leaves a fresh (non-stale) result');

  // ---- loading a saved scenario recalculates immediately too ----
  app.context.__scenarioParams = { ...app.run('DEFAULTS'), gasto: 55000 };
  app.run("savedScenarios.push({id:'mc1', name:'t', color:'#000', visible:true, series:[], target:0, ageMed:'—', successRate:0, params: __scenarioParams})");
  app.run("loadScenario('mc1')");
  await quiesce();
  assert.equal(app.run('lastFullParams').gasto, 55000, 'loadScenario recalculated with the loaded params');
  app.run('savedScenarios.length=0');
  setValue('seed', '7'); await el('runCalc').fireAsync('click'); await quiesce(); // stay fast+seeded for the rest of this file

  // ---- precision selector: "Personalizada" reveals the seconds slider; the others hide it ----
  assert.equal(el('calcSecondsWrap').style.display, 'none', 'hidden by default (fast preset)');
  el('calcPrecision').value = 'custom';
  el('calcPrecision').fire('change');
  assert.equal(el('calcSecondsWrap').style.display, 'block', 'revealed when "Personalizada" is selected');
  el('calcPrecision').value = 'high';
  el('calcPrecision').fire('change');
  assert.equal(el('calcSecondsWrap').style.display, 'none', 'hidden again for a non-custom preset');
  el('calcPrecision').value = 'fast';
  el('calcPrecision').fire('change');

  // ---- time-budget mapping and the proportional PATHS_FULL_MAX scaling ----
  const budgetFast = app.run('selectedTimeBudgetMs()');
  assert.equal(budgetFast, app.run('FULL_TIME_BUDGET_MS'), 'the "fast" preset keeps the original default budget exactly');
  el('calcPrecision').value = 'high'; el('calcPrecision').fire('change');
  const budgetHigh = app.run('selectedTimeBudgetMs()');
  assert.ok(budgetHigh > budgetFast, 'a higher precision preset asks for a longer time budget');
  el('calcPrecision').value = 'max'; el('calcPrecision').fire('change');
  const budgetMax = app.run('selectedTimeBudgetMs()');
  assert.ok(budgetMax > budgetHigh, 'maximum precision asks for the longest budget');
  el('calcPrecision').value = 'custom'; el('calcPrecision').fire('change');
  setValue('calcSeconds', '120'); el('calcSeconds').fire('input');
  const budgetCustomMax = app.run('selectedTimeBudgetMs()');
  assert.ok(budgetCustomMax >= budgetMax, 'a 120s custom budget is at least as large as the "Máxima" preset');
  assert.match(el('calcSeconds_o').textContent, /120/, 'the custom seconds slider paints its own label');

  assert.equal(app.run('pathsFullMaxFor(FULL_TIME_BUDGET_MS)'), app.run('PATHS_FULL_MAX'), 'the ceiling is unchanged for the default budget');
  assert.ok(app.run('pathsFullMaxFor(FULL_TIME_BUDGET_MS*3)') > app.run('PATHS_FULL_MAX'), 'a 3x budget raises the ceiling proportionally');
  assert.ok(app.run('pathsFullMaxFor(FULL_TIME_BUDGET_MS*1000)') <= 500000, 'the ceiling never exceeds the ~500k cap');
  el('calcPrecision').value = 'fast'; el('calcPrecision').fire('change');

  // ---- regression: a superseded run() / runSensitivity() / runSrrStress() must never throw
  // (e.g. "Cannot read properties of undefined (reading 'fireMonthAll')") when a second click
  // arrives before the first one's worker response comes back. cancelPending()/supersedeOlderJobs()
  // resolve the older in-flight request(s) with {stale:true} (no .result); the superseded call must
  // detect that and bail out quietly instead of dereferencing .result. The fake DOM has no real
  // Worker, so every request already resolves synchronously and can never race for real: instead,
  // deterministically inject the exact {stale:true} shape a real supersede produces.
  {
    const outcome = app.run(`
      (async () => {
        const original = requestSimulation;
        requestSimulation = async () => ({ stale: true });
        const before = JSON.stringify(lastFullParams);
        try { await run('full'); return { threw: false, unchanged: JSON.stringify(lastFullParams) === before }; }
        catch (e) { return { threw: true, message: String(e && e.message) }; }
        finally { requestSimulation = original; }
      })()
    `);
    const result = await outcome;
    assert.equal(result.threw, false, 'run() must not throw when its response is {stale:true}: ' + (result.message || ''));
    assert.ok(result.unchanged, 'a stale response must not overwrite lastFullParams');
  }
  {
    const outcome = app.run(`
      (async () => {
        const original = requestAnalysisSimulation;
        requestAnalysisSimulation = async () => ({ stale: true });
        try { return { value: await runSensitivity(readParams()), threw: false }; }
        catch (e) { return { threw: true, message: String(e && e.message) }; }
        finally { requestAnalysisSimulation = original; }
      })()
    `);
    const result = await outcome;
    assert.equal(result.threw, false, 'runSensitivity() must not throw when every pair is superseded: ' + (result.message || ''));
    assert.equal(result.value, null, 'a fully superseded sensitivity run resolves null instead of throwing');
  }
  {
    const outcome = app.run(`
      (async () => {
        const original = requestAnalysisSimulation;
        requestAnalysisSimulation = async () => ({ stale: true });
        try { return { value: await runSrrStress(readParams(), -30, 12), threw: false }; }
        catch (e) { return { threw: true, message: String(e && e.message) }; }
        finally { requestAnalysisSimulation = original; }
      })()
    `);
    const result = await outcome;
    assert.equal(result.threw, false, 'runSrrStress() must not throw when superseded: ' + (result.message || ''));
    assert.equal(result.value, null, 'a fully superseded stress run resolves null instead of throwing');
  }
  // ---- and the click handler itself must not let a late, superseded response clobber the UI
  // state (disabled/loading) that a winning, more recent click already owns. Every request is
  // intercepted and its resolver captured (never auto-resolved), so the test controls resolution
  // order explicitly instead of racing real timing: click 1's 16 pairs (32 requests) are resolved
  // strictly AFTER click 2's, reproducing "a late, superseded worker response arrives after the
  // newer click has already finished" deterministically.
  {
    const btn = el('runSensitivity'), loadingEl = el('sensLoading');
    app.run(`
      globalThis.__originalRAS = requestAnalysisSimulation;
      globalThis.__pending = [];
      requestAnalysisSimulation = () => new Promise(resolve => { __pending.push(resolve); });
    `);
    const first = btn.fireAsync('click');
    for (let i = 0; i < 20 && app.run('__pending.length') < 16; i++) await Promise.resolve();
    assert.equal(app.run('__pending.length'), 16, 'click 1 issued its 8 pairs (16 requests) and is now blocked on them');
    const second = btn.fireAsync('click');
    for (let i = 0; i < 20 && app.run('__pending.length') < 32; i++) await Promise.resolve();
    assert.equal(app.run('__pending.length'), 32, 'click 2 issued its own 16 requests on top');
    app.run('__pending.slice(16, 32).forEach(resolve => resolve({ stale: true }));'); // resolve click 2 (the winner) first
    await second;
    assert.equal(btn.disabled, false, 'the winning (second) click leaves the button enabled');
    assert.equal(loadingEl.style.display, 'none', 'the winning (second) click hides the loading indicator');
    app.run('__pending.slice(0, 16).forEach(resolve => resolve({ stale: true }));'); // now resolve click 1 (superseded), late
    await first;
    assert.equal(btn.disabled, false, 'the late, superseded click must not re-disable the button');
    assert.equal(loadingEl.style.display, 'none', 'the late, superseded click must not show the loading indicator again');
    app.run('requestAnalysisSimulation = globalThis.__originalRAS; delete globalThis.__originalRAS; delete globalThis.__pending;');
  }

  console.log('manual-calc: OK');
})().catch(error => { console.error(error); process.exit(1); });
