// Slider range audit for index.html.
//  (a) every range default is reachable (inside [min,max] and on the step grid),
//  (b) the agreed min/max/step table matches the markup,
//  (c) Efectivo/Bonos/Acciones always add up to 100 (Acciones is computed, disabled),
//  (d) childCount toggles the child2/child3 visibility classes,
//  (e) SENSITIVITY_PARAMS bounds equal the matching slider bounds,
//  (f) loadScenario reports values the browser had to snap/clamp.
// Behaviour tests run the REAL inline script against test/helpers/fake-app.js.
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/fake-app.js');

function parseRanges(html) {
  const ranges = new Map();
  for (const match of html.matchAll(/<input\b([^>]*)>/g)) {
    const attrs = {};
    for (const attr of match[1].matchAll(/([\w-]+)="([^"]*)"/g)) attrs[attr[1]] = attr[2];
    if (attrs.type === 'range' && attrs.id) ranges.set(attrs.id, { min: Number(attrs.min), max: Number(attrs.max), step: Number(attrs.step) });
  }
  return ranges;
}

const EXPECTED_RANGES = {
  startEq: { step: 500 }, basicFO: { step: 5 }, basicCA: { step: 50 }, brNet: { step: 1000 },
  pensionAnnual: { min: 0, max: 60000, step: 500 },
  healthcareAnnual: { min: 0, max: 30000, step: 500 },
  pensionStartAge: { min: 55, max: 80 },
  childCount: { min: 0, max: 3, step: 1 },
  child1BirthYear: { min: 2020, max: 2045, step: 1 }, child1BirthMonth: { min: 1, max: 12, step: 1 },
  child2BirthYear: { min: 2026, max: 2050, step: 1 }, child3BirthYear: { min: 2026, max: 2050, step: 1 },
  childCost0to2: { min: 0, max: 30000, step: 100 }, childCost3to17: { min: 0, max: 30000, step: 100 },
  childCost18to22: { min: 0, max: 30000, step: 100 }, childFS1Cost: { min: 0, max: 30000, step: 100 },
  childSchoolCost: { min: 0, max: 20000, step: 50 }, childInsuranceAED: { min: 0, max: 5000, step: 1 },
  cashRet: { min: -5, max: 5, step: 0.1 }, cashVol: { min: 0, max: 10, step: 0.1 },
  careerYear: { min: 2026, max: 2040 }, ageNow: { min: 18, max: 75 }
};

(async () => {
  const app = await loadApp();
  const { el, env } = app;
  const ranges = parseRanges(app.html);
  const defaults = JSON.parse(JSON.stringify(app.run('DEFAULTS')));
  assert.ok(ranges.size > 90, 'the audit sees the page sliders (' + ranges.size + ')');

  // ---- (a) every default is reachable with its slider ----
  const unreachable = [];
  for (const [id, r] of ranges) {
    if (typeof defaults[id] !== 'number') continue;
    const steps = (defaults[id] - r.min) / r.step;
    if (defaults[id] < r.min || defaults[id] > r.max || Math.abs(steps - Math.round(steps)) > 1e-9) unreachable.push(id);
  }
  assert.deepEqual(unreachable, [], 'defaults outside [min,max] or off the step grid');

  // ---- (b) the range table ----
  for (const [id, expected] of Object.entries(EXPECTED_RANGES)) {
    assert.ok(ranges.has(id), id + ' slider exists');
    for (const [field, value] of Object.entries(expected)) assert.equal(ranges.get(id)[field], value, id + ' ' + field);
  }

  // ---- (e) sensitivity bounds equal the slider bounds ----
  const sens = JSON.parse(JSON.stringify(app.run('SENSITIVITY_PARAMS.map(d=>({key:d.key,min:d.min,max:d.max}))')));
  const bounds = {};
  for (const def of sens) {
    const slider = ranges.get(def.key);
    if (!slider) continue;
    bounds[def.key] = { min: def.min, max: def.max };
    assert.deepEqual({ min: def.min, max: def.max }, { min: slider.min, max: slider.max }, 'SENSITIVITY_PARAMS ' + def.key + ' matches its slider');
  }
  assert.equal(Object.keys(bounds).length, 18, 'all eighteen sensitivity entries were compared');

  // ---- (c) allocation: Efectivo + Bonos + Acciones == 100 ----
  const quiesce = async () => { for (let round = 0; round < 4; round++) { env.flushTimers(); await app.settle(); } };
  await quiesce();
  // A real browser clamps a dragged range value into [min,max]; the fake DOM does not.
  const drag = (id, value) => { const c = Math.min(Number(el(id).max), Math.max(Number(el(id).min), value)); el(id).value = String(c); el(id).fire('input'); };
  const readAlloc = () => ({ cash: Number(el('allocCash').value), bonds: Number(el('allocBonds').value), eq: Number(el('allocEquities').value) });
  assert.equal(el('allocEquities').disabled, true, 'Acciones is computed, so its slider is disabled');
  assert.deepEqual(readAlloc(), { cash: 10, bonds: 20, eq: 70 }, 'defaults keep 10/20/70');
  assert.equal(app.run('collectRawParams().allocEquities'), 70, 'a disabled slider is still read as a parameter');
  assert.equal(app.run('serializeScenarioParams(readParams()).allocEquities'), 70, 'a disabled slider is still serialized in scenarios');
  for (const cash of [0, 10, 40, 100]) {
    for (const bonds of [0, 20, 100]) {
      drag('allocCash', cash); drag('allocBonds', bonds);
      await quiesce();
      const a = readAlloc();
      assert.equal(a.cash + a.bonds + a.eq, 100, 'cash ' + cash + ' bonds ' + bonds + ' add up to 100 (got ' + JSON.stringify(a) + ')');
      assert.ok(a.eq >= 0 && a.bonds >= 0, 'no negative share');
      assert.equal(el('allocBonds').max, String(100 - cash), 'bonds max follows cash');
      assert.equal(el('allocEquities').disabled, true);
      assert.equal(el('assumptionError').textContent, '', 'no 100 % error for cash ' + cash + ' bonds ' + bonds);
      assert.equal(el('allocEquities_o').textContent, a.eq + ' %', 'Acciones label shows the computed share');
    }
  }
  // Raising cash above 100-bonds pulls bonds down instead of producing a negative equity share.
  drag('allocCash', 0); drag('allocBonds', 60); drag('allocCash', 100); await quiesce();
  assert.deepEqual(readAlloc(), { cash: 100, bonds: 0, eq: 0 }, 'bonds are clamped down when cash grows');
  assert.equal(el('assumptionError').textContent, '');

  // ---- (d) childCount toggles the child2/child3 visibility classes ----
  drag('childCount', 0);
  assert.equal(app.run("document.body.classList.contains('child2')"), false);
  assert.equal(app.run("document.body.classList.contains('child3')"), false);
  drag('childCount', 2);
  assert.equal(app.run("document.body.classList.contains('child2')"), true, 'childCount 2 shows the 2nd child controls');
  assert.equal(app.run("document.body.classList.contains('child3')"), false);
  drag('childCount', 3);
  assert.equal(app.run("document.body.classList.contains('child2')"), true);
  assert.equal(app.run("document.body.classList.contains('child3')"), true, 'childCount 3 also shows the 3rd child controls');
  drag('childCount', 1);
  assert.equal(app.run("document.body.classList.contains('child2')"), false, 'dropping back to 1 hides the 2nd/3rd child controls again');
  assert.equal(app.run("document.body.classList.contains('child3')"), false);
  await quiesce();
  assert.equal(el('assumptionError').textContent, '', 'no child-age error after dragging');

  // ---- (f) loadScenario reports values that had to be snapped or clamped ----
  // Emulate the browser: range inputs clamp assigned values into [min,max] (the fake DOM stores as given).
  for (const id of ranges.keys()) {
    const control = el(id); if (!control) continue;
    let stored = String(control.value);
    Object.defineProperty(control, 'value', {
      get: () => stored,
      set: raw => { const n = Number(raw); stored = Number.isFinite(n) ? String(Math.min(Number(control.max), Math.max(Number(control.min), n))) : String(raw); }
    });
  }
  const load = params => { app.context.__p = params; app.run("savedScenarios.push({id:'t1',params:__p});"); app.run("loadScenario('t1')"); app.run('savedScenarios.length=0'); };
  el('reset').fire('click'); await quiesce();
  const clean = JSON.parse(JSON.stringify(app.run('readParams()')));
  load(clean); await quiesce();
  assert.equal(el('scenarioMsg').textContent, '', 'no message when nothing is adjusted');
  load({ ...clean, pensionAnnual: 100000, pensionStartAge: 30 }); await quiesce();
  assert.match(el('scenarioMsg').textContent, /^Valores ajustados al rango actual: /);
  assert.match(el('scenarioMsg').textContent, /pensionAnnual/); assert.match(el('scenarioMsg').textContent, /pensionStartAge/);
  assert.doesNotMatch(el('scenarioMsg').textContent, /gasto|swr/, 'only adjusted controls are named');
  assert.equal(el('pensionAnnual').value, '60000'); assert.equal(el('pensionStartAge').value, '55');
  load(clean); await quiesce();
  assert.equal(el('scenarioMsg').textContent, '', 'a following clean load clears the message');

  // pure helper: list is capped
  assert.equal(app.run("describeAdjustedValues({a:1,b:2},{a:'1',b:'2'})"), '');
  assert.equal(app.run("describeAdjustedValues({a:1,b:2},{a:'1',b:'3'})"), 'Valores ajustados al rango actual: b.');
  const many = app.run("describeAdjustedValues({a:1,b:1,c:1,d:1,e:1,f:1,g:1,h:1},{a:'2',b:'2',c:'2',d:'2',e:'2',f:'2',g:'2',h:'2'})");
  assert.match(many, /^Valores ajustados al rango actual: a, b, c, d, e, f y 2 más\.$/);

  console.log('slider-ranges: ok');
})().catch(error => { console.error(error); process.exit(1); });
