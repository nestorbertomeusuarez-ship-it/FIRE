// U1: PRO · Estrategia de retirada shows only the sub-section that matches the selected
// wdStrategy (its sliders are the only ones that affect that strategy's result). The REAL
// inline script runs against the fake DOM (test/helpers/fake-app.js); nothing here greps
// the script source.
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/fake-app.js');

(async () => {
  const app = await loadApp();
  const { el, env } = app;
  // Read the current hidden state of every wdPhase wrapper, keyed by its data-wd value.
  const hiddenByStrategy = () => {
    const map = {};
    for (const node of env.document.querySelectorAll('.wdPhase')) map[node.getAttribute('data-wd')] = node.hidden;
    return map;
  };

  assert.ok(env.document.querySelectorAll('.wdPhase').length >= 5, 'the five strategy-specific sub-sections exist');

  for (const strat of ['1', '2', '3', '4', '5']) {
    el('wdStrategy').value = strat;
    el('wdStrategy').fire('input');
    const state = hiddenByStrategy();
    for (const [wd, hidden] of Object.entries(state)) {
      assert.equal(hidden, wd !== strat, `wdStrategy=${strat}: sub-section data-wd="${wd}" hidden=${hidden}`);
    }
  }

  // "SWR fijo" (0) has no sub-section of its own: every strategy-specific block is hidden.
  el('wdStrategy').value = '0';
  el('wdStrategy').fire('input');
  const allHiddenAtZero = Object.values(hiddenByStrategy());
  assert.ok(allHiddenAtZero.length > 0 && allHiddenAtZero.every(Boolean), 'wdStrategy=0 hides every strategy-specific sub-section');

  // loadScenario re-syncs visibility too, not just the wdStrategy "input" event.
  el('wdStrategy').value = '4';
  el('wdStrategy').fire('input');
  const scenario = { id: 'x', name: 'x', params: { ...app.run('DEFAULTS'), wdStrategy: 5 } };
  app.run('savedScenarios').push(scenario);
  app.run("loadScenario('x')");
  assert.equal(hiddenByStrategy()['5'], false, 'loadScenario re-syncs wdPhase visibility to the loaded strategy');
  assert.equal(hiddenByStrategy()['4'], true);

  // Resetting also re-syncs visibility back to the default strategy (1, Guyton-Klinger): only
  // its own sub-section is shown.
  el('wdStrategy').value = '3';
  el('wdStrategy').fire('input');
  el('reset').fire('click');
  assert.equal(app.run('DEFAULTS.wdStrategy'), 1);
  const afterReset = hiddenByStrategy();
  assert.equal(afterReset['1'], false, 'reset shows the default Guyton-Klinger sub-section');
  assert.ok(Object.entries(afterReset).filter(([wd]) => wd !== '1').every(([, hidden]) => hidden), 'and hides every other strategy sub-section');

  console.log('wd-strategy-visibility: OK');
})().catch(error => { console.error(error); process.exit(1); });
