// Sensitivity runs ~50s of wall-clock time with a static "Calculando…" the whole way, giving no
// feedback. #sensLoading must instead show "Calculando… X de N simulaciones", updating as each
// paired (low/high) job resolves, where N is the number of requests ACTUALLY issued (respecting
// the proOnly filter: fewer requests when proMode is off).
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/fake-app.js');

(async () => {
  const app = await loadApp();
  const { el, env } = app;
  const quiesce = async () => { for (let round = 0; round < 4; round++) { env.flushTimers(); await app.settle(); } };
  await quiesce(); // the page's own start-up run

  const btn = el('runSensitivity'), loadingEl = el('sensLoading');
  assert.equal(el('proMode').checked, false, 'proMode is off by default');
  // 8 non-proOnly SENSITIVITY_PARAMS entries with proMode off => 16 requests (low+high per param).
  app.run(`
    globalThis.__originalRAS = requestAnalysisSimulation;
    globalThis.__pending = [];
    requestAnalysisSimulation = () => new Promise(resolve => { __pending.push(resolve); });
  `);
  const clickDone = btn.fireAsync('click');
  for (let i = 0; i < 20 && app.run('__pending.length') < 16; i++) await Promise.resolve();
  assert.equal(app.run('__pending.length'), 16, 'issues 16 requests (8 non-PRO params, low+high) with proMode off');
  assert.match(loadingEl.textContent, /Calculando… 0 de 16 simulaciones/, 'shows the total up front, before any pair resolves');

  // Resolve pairs (low+high, contiguous per parameter) one at a time; the counter must advance by
  // 2 (one full pair) each time, never stay static across the whole ~50s run.
  for (let done = 2; done <= 16; done += 2) {
    app.run(`__pending.slice(${done - 2}, ${done}).forEach(resolve => resolve({ result: { fireMonths: new Int32Array(0) } }));`);
    const pattern = new RegExp('Calculando… ' + done + ' de 16 simulaciones');
    for (let i = 0; i < 20 && !pattern.test(loadingEl.textContent); i++) await Promise.resolve();
    assert.match(loadingEl.textContent, pattern, 'progress reaches ' + done + ' of 16');
  }
  await clickDone;
  assert.equal(loadingEl.style.display, 'none', 'the loading indicator hides once the run completes');
  assert.equal(loadingEl.textContent, 'Calculando…', 'the text resets to the static default, ready for the next run');
  app.run('requestAnalysisSimulation = globalThis.__originalRAS; delete globalThis.__originalRAS; delete globalThis.__pending;');

  // ---- supersede semantics stay intact: a superseded click's late progress ticks must never
  // clobber the winning click's loading text (mirrors test/manual-calc.test.js's concurrency check).
  app.run(`
    globalThis.__originalRAS2 = requestAnalysisSimulation;
    globalThis.__pending2 = [];
    requestAnalysisSimulation = () => new Promise(resolve => { __pending2.push(resolve); });
  `);
  const first = btn.fireAsync('click');
  for (let i = 0; i < 20 && app.run('__pending2.length') < 16; i++) await Promise.resolve();
  const second = btn.fireAsync('click');
  for (let i = 0; i < 20 && app.run('__pending2.length') < 32; i++) await Promise.resolve();
  // Resolve click 2 (the winner) fully first.
  app.run('__pending2.slice(16, 32).forEach(resolve => resolve({ result: { fireMonths: new Int32Array(0) } }));');
  await second;
  assert.equal(loadingEl.style.display, 'none', 'the winning (second) click hides the loading indicator');
  assert.equal(loadingEl.textContent, 'Calculando…', 'the winning click resets the text');
  // Now resolve click 1 (superseded) late: its progress ticks must not reappear.
  app.run('__pending2.slice(0, 16).forEach(resolve => resolve({ result: { fireMonths: new Int32Array(0) } }));');
  await first;
  assert.equal(loadingEl.style.display, 'none', 'the late, superseded click must not show the loading indicator again');
  assert.equal(loadingEl.textContent, 'Calculando…', 'the late, superseded click must not overwrite the text');
  app.run('requestAnalysisSimulation = globalThis.__originalRAS2; delete globalThis.__originalRAS2; delete globalThis.__pending2;');

  console.log('sensitivity progress: OK');
})().catch(error => { console.error(error); process.exit(1); });
