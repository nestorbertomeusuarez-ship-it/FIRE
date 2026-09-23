// Regression test: dragging a slider into a combination that fails cross-field
// validation (e.g. allocCash+allocBonds+allocEquities != 100) must still paint
// that slider's own label immediately, even though the run itself is refused.
// Before the fix, readParams() threw inside validateSimulationParams() BEFORE
// run() ever reached paintLabels(p), so the label stayed frozen at its old value.
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/fake-app.js');

(async () => {
  const app = await loadApp();
  const { el, env } = app;
  const setValue = (id, value) => { el(id).value = value; };
  const quiesce = async () => { for (let round = 0; round < 4; round++) { env.flushTimers(); await app.settle(); } };

  await quiesce(); // the page's own start-up run leaves a pending announcement

  // ---- the 15 controls this candidate converted from <input type="number"> to
  // <input type="range"> lost their static HTML `value="..."` attribute as part
  // of that conversion (matching how every other slider in this file works: the
  // value comes from DEFAULTS via the page's own top-level init loop, not a
  // static attribute). A native range input with no `value` attribute defaults
  // to the midpoint of its min/max, NOT the app's intended default — so this
  // proves the real production init path (the `ids.forEach(...)` loop that runs
  // once at the bottom of index.html's inline script, executed here for real by
  // loadApp()/fake-app.js, not stubbed) actually assigns the correct DEFAULTS
  // value to each of them, closing the gap a native review flagged: that no
  // assertion here distinguished "the harness fabricated this value" from "the
  // real page set it".
  const CONVERTED_DEFAULTS = {
    ageNow: 28, horizonAge: 90, careerYear: 2027,
    allocCash: 10, allocBonds: 20, allocEquities: 70, cashRet: 1, cashVol: 1.5,
    pensionAnnual: 0, pensionStartAge: 67, healthcareAnnual: 0, healthcareStartAge: 65,
    childAnnual: 0, childStartAge: 30, childEndAge: 40,
  };
  for (const [id, expected] of Object.entries(CONVERTED_DEFAULTS)) {
    const input = el(id);
    assert.equal(input.type, 'range', `${id} was converted to a range slider`);
    assert.equal(input.hasAttribute('value'), false, `${id} carries no static HTML value attribute`);
    assert.equal(Number(input.value), expected, `${id}'s real init path sets the intended DEFAULTS value, not the native min/max midpoint`);
  }

  // ---- allocation is now self-balancing: dragging allocCash alone keeps the 100% invariant ----
  assert.equal(el('allocCash_o').textContent, '10 %', 'sanity: default allocCash label');
  setValue('allocCash', '40');
  el('allocCash').fire('input');
  await quiesce();
  assert.equal(el('assumptionError').textContent, '', 'dragging cash no longer produces a 100 % error (Acciones is computed)');
  assert.equal(el('allocCash_o').textContent, '40 %', 'the dragged label reflects the new value');
  assert.equal(el('allocEquities_o').textContent, '40 %', 'the computed Acciones label follows (100 - 40 - 20)');
  assert.equal(Number(el('allocEquities').value), 40, 'the disabled Acciones control holds the computed value');

  // ---- a label must still update when the run is refused (cross-field child-age check, bypassing the UI sync) ----
  const childStart = String(app.run('DEFAULTS.childStartAge')), childEnd = String(app.run('DEFAULTS.childEndAge'));
  setValue('childStartAge', '50'); setValue('childEndAge', '40'); setValue('cashRet', '2');
  el('cashRet').fire('input');
  await quiesce();
  assert.match(el('assumptionError').textContent, /hijo/, 'the invalid child ages are still refused with a Spanish error');
  assert.equal(el('cashRet_o').textContent, '2.0 %', 'the dragged label reflects the new value immediately, even though the run was refused');
  setValue('childStartAge', childStart); setValue('childEndAge', childEnd); setValue('cashRet', String(app.run('DEFAULTS.cashRet')));

  // ---- a genuinely valid drag (no cross-field constraint) still paints AND still computes ----
  setValue('allocCash', '10'); el('allocCash').fire('input'); await quiesce(); // restore the default allocation
  assert.equal(el('assumptionError').textContent, '', 'allocation is valid again');
  const announcedBefore = el('calcAnnounce').textHistory.length;
  setValue('ret', '7.5');
  el('ret').fire('input'); // slider drag: schedules a debounced preview
  await quiesce();
  assert.equal(el('assumptionError').textContent, '', 'a valid drag keeps the assumption error clear');
  assert.equal(el('ret_o').textContent, '7.5 %', 'a valid drag paints its own label');
  el('ret').fire('change'); // committing the drag: schedules the full run
  await quiesce();
  assert.ok(el('calcAnnounce').textHistory.length > announcedBefore, 'a valid drag still triggers a real full computation (no regression to the happy path)');

  console.log('label-painting.test.js: all assertions passed');
})().catch(error => { console.error(error); process.exit(1); });
