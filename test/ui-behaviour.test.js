// Behavioural UI tests: the REAL inline script of index.html runs against a minimal fake
// DOM (test/helpers/fake-app.js). Nothing here greps the script source.
// The fake DOM has no Worker, so the page runs its synchronous fallback here; the worker path
// (generated worker source, tax brackets, validation) is covered by test/worker-parity.test.js.
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/fake-app.js');

(async () => {
  const app = await loadApp();
  const { el, env } = app;
  const call = expression => app.run(expression);
  const setValue = (id, value) => { el(id).value = value; };
  // Run every scheduled timer and let the calculations they start finish (which may schedule announcements).
  const quiesce = async () => { for (let round = 0; round < 4; round++) { env.flushTimers(); await app.settle(); } };

  await quiesce(); // the page's own start-up run leaves a pending announcement

  // ---- manual calculation mode: no control schedules a run by itself any more; only "Calcular" does ----
  assert.deepEqual(Object.keys(el('seed').listeners).sort(), ['change', 'keydown'], 'the seed control listens to change (and Enter), never input');
  assert.equal(env.pendingTimers(), 0);
  setValue('seed', '4');
  el('seed').fire('input');
  assert.equal(env.pendingTimers(), 0, 'the seed field has no "input" listener at all');
  el('seed').fire('change');
  assert.equal(env.pendingTimers(), 0, 'committing (change) the seed no longer schedules any calculation by itself');
  assert.match(el('staleNotice').style.display, /block/, 'committing a new seed marks the result stale');
  const announcedAtStart = el('calcAnnounce').textHistory.length;
  await call("safeRun('full')");                  // pressing "Calcular"
  assert.equal(env.pendingTimers(), 1, 'a finished full run leaves one debounced announcement pending');
  assert.equal(el('calcAnnounce').textHistory.length, announcedAtStart, 'the announcement is not immediate');
  env.flushTimers();
  assert.equal(el('calcAnnounce').textHistory.length, announcedAtStart + 1, 'the final result is announced once');
  assert.match(el('calcAnnounce').textContent, /^Cálculo completo: .*5000 rutas\.$/);
  const seededSeries = JSON.stringify(call('lastSeries'));
  assert.match(el('simulationContext').textContent, /Semilla 4 \(reproducible/, 'a committed seed is shown');
  assert.match(el('calc').textContent, /5000 rutas/, 'a seeded full run always uses the fixed path count');
  // controls that used to auto-run now only repaint/mark stale, never schedule anything themselves
  assert.deepEqual(Object.keys(el('gasto').listeners).sort(), ['change', 'input'], 'range sliders still listen on input+change (for label/constraint repaint), just not to run anything');
  el('gasto').fire('input');
  assert.equal(env.pendingTimers(), 0, 'a slider drag no longer schedules any run'); env.clearAllTimers();
  el('taxOn').fire('input');
  assert.equal(env.pendingTimers(), 0, 'checkboxes no longer trigger a run either'); env.clearAllTimers();
  await call("safeRun('full')"); await quiesce(); // restore a fresh, non-stale result for the assertions below

  // ---- an invalid seed is refused visibly, never silently randomised ----
  for (const text of ['-3', '7.9', '99999999999']) {
    setValue('seed', text); el('seed').fire('change'); await quiesce();
    assert.match(el('assumptionError').textContent, /semilla/i, 'invalid seed "' + text + '" shows a Spanish error');
  }
  setValue('seed', ''); await call("safeRun('preview')");
  assert.equal(el('assumptionError').textContent, '', 'an empty seed is valid (random run) and clears the error');
  assert.match(el('simulationContext').textContent, /aleatoria \(no reproducible/, 'empty seed is announced as random');
  assert.doesNotMatch(el('simulationContext').textContent, /NaN|null|undefined/);
  setValue('seed', '0'); await call("safeRun('preview')");
  assert.match(el('simulationContext').textContent, /Semilla 0 \(/, 'seed zero is a real seed');

  // ---- seeded full runs do not depend on wall-clock calibration ----
  app.context.__pretend = ms => async (params, paths, opts) => ({ result: call('({fireMonths:new Int32Array(0)})'), ms: ms(paths) });
  const originalRequest = call('requestSimulation');
  app.context.requestSimulation = app.context.__pretend(paths => paths * 0.05);
  const fastSeeded = await call('calibratePathsFull({seed:5})');
  app.context.requestSimulation = app.context.__pretend(paths => paths * 40);
  const slowSeeded = await call('calibratePathsFull({seed:5})');
  const zeroSeeded = await call('calibratePathsFull({seed:0})');
  assert.equal(fastSeeded, 5000); assert.equal(slowSeeded, 5000); assert.equal(zeroSeeded, 5000, 'seed zero is seeded too');
  app.context.requestSimulation = app.context.__pretend(paths => paths * 0.05);
  assert.equal(await call("calibratePathsFull({seed:5},'sensitivity')"), 2000, 'seeded sensitivity / stress runs use a smaller fixed count');
  app.context.requestSimulation = app.context.__pretend(paths => paths * 40);
  assert.equal(await call("calibratePathsFull({seed:5},'sensitivity')"), 2000, 'independent of device speed');
  app.context.requestSimulation = app.context.__pretend(paths => paths * 0.05);
  const fastRandom = await call('calibratePathsFull({seed:null})');
  app.context.requestSimulation = app.context.__pretend(paths => paths * 4);
  const slowRandom = await call('calibratePathsFull({seed:null})');
  assert.ok(fastRandom > slowRandom, 'unseeded runs still adapt to the device speed (' + fastRandom + ' vs ' + slowRandom + ')');
  app.context.requestSimulation = originalRequest;
  // A second real seeded full run under different simulated timing gives identical aggregates.
  setValue('seed', '4');
  app.context.performance.now = () => Number(process.hrtime.bigint() / 1000n) / 1000 * 3 + 977;
  const second = await call('runFullPrecision(readParams())');
  assert.equal(second.result.fireMonthAll.length, 5000);
  assert.equal(JSON.stringify(second.result.series), seededSeries, 'same seed + different timing => identical percentile series (and success/ruin data behind it)');
  setValue('seed', ''); env.clearAllTimers();

  // ---- accessibility: a live region for FINAL results only ----
  assert.equal(el('calc').getAttribute('aria-live'), null, '#calc (rewritten on every slider tick) is not a live region');
  assert.equal(el('calc').getAttribute('role'), null);
  assert.equal(el('outcomeSummary').getAttribute('aria-live'), null, 'outcome summary refreshes during previews and is not live');
  assert.equal(el('calcAnnounce').getAttribute('role'), 'status');
  assert.equal(el('calcAnnounce').getAttribute('aria-live'), 'polite');
  env.flushTimers();
  const announcedBefore = el('calcAnnounce').textHistory.length;
  await call("safeRun('preview')");
  assert.equal(env.pendingTimers(), 0, 'a preview never schedules an announcement');
  env.flushTimers();
  assert.equal(el('calcAnnounce').textHistory.length, announcedBefore, 'previews are not announced');
  call("announceResult('primero'); announceResult('segundo')");
  assert.equal(env.pendingTimers(), 1, 'two quick announcements leave ONE pending timer (debounced)');
  assert.equal(el('calcAnnounce').textHistory.length, announcedBefore, 'nothing is announced before the debounce elapses');
  env.flushTimers();
  assert.equal(el('calcAnnounce').textHistory.length, announcedBefore + 1, 'exactly one announcement after the debounce');
  assert.equal(el('calcAnnounce').textContent, 'segundo', 'only the last announcement survives');

  // ---- contribution chart text alternative is written after each run ----
  assert.equal(el('contribChart').getAttribute('aria-describedby'), 'contribSummary');
  assert.ok(el('contribSummary'), 'the summary element exists');
  assert.ok(el('contribSummary').classList.contains('srOnly'), 'the summary is visually hidden');
  assert.doesNotMatch(el('contribChart').getAttribute('aria-label'), /resumen/i, 'the label promises nothing that is not written');
  const summaryWrites = el('contribSummary').textHistory.length;
  await call("safeRun('preview')");
  assert.equal(el('contribSummary').textHistory.length, summaryWrites + 1, 'each run rewrites the summary');
  assert.match(el('contribSummary').textContent, /^Ruta mediana en \d{4}: patrimonio total €[\d.,]+[kM]?/);
  assert.doesNotMatch(el('contribSummary').textContent, /NaN|undefined/);
  assert.equal(call('summarizeContribution([])'), 'Sin datos de aportaciones todavía.');
  assert.equal(el('chartModalCanvas').getAttribute('role'), 'img');
  assert.ok(el('chartModalCanvas').getAttribute('aria-label').length > 10, 'modal canvas is labelled');

  // ---- outcome categories: exclusive, exhaustive, accurately labelled ----
  const rows = []; const list = el('outcomeSummary').children[0].children;
  for (let i = 0; i < list.length; i += 2) rows.push({ label: list[i].textContent, count: Number(list[i + 1].textContent.split(' rutas')[0].replace(/\./g, '')) });
  assert.equal(rows.length, 7);
  assert.match(rows[1].label, /incluida en la fila anterior/, 'voluntary ruin is shown as a subset');
  assert.match(rows[4].label, /Ruina antes de llegar al FIRE/);
  assert.match(rows[5].label, /sin ruina/, 'the no-retirement row excludes ruined paths');
  const paths = Number(/muestra ([\d.]+) rutas/.exec(el('simulationContext').textContent)[1].replace(/\./g, ''));
  const exclusive = [0, 2, 3, 4, 5].reduce((sum, index) => sum + rows[index].count, 0);
  assert.equal(exclusive, paths, 'the five exclusive categories add up to the number of paths');
  assert.equal(rows[6].count, paths, 'the total row equals N');

  // A household that cannot cover its costs goes broke BEFORE reaching FIRE: that is its own category, not "no retirement".
  for (const [id, value] of [['startEq', '0'], ['vida', '7000'], ['hip', '1400'], ['salFO', '280000'], ['salCA', '420000'], ['gasto', '130000']]) setValue(id, value);
  setValue('seed', '1'); el('proMode').checked = false;
  await call("safeRun('preview')");
  const brokeRows = []; const brokeList = el('outcomeSummary').children[0].children;
  for (let i = 0; i < brokeList.length; i += 2) brokeRows.push(Number(brokeList[i + 1].textContent.split(' rutas')[0].replace(/\./g, '')));
  assert.equal(brokeRows[6], 250, 'preview sample size');
  assert.ok(brokeRows[4] > 200, 'nearly every path is ruined before FIRE (got ' + brokeRows[4] + ')');
  assert.equal(brokeRows[5], 0, 'and none is mislabelled as "no retirement"');
  assert.equal(brokeRows[0] + brokeRows[2] + brokeRows[3] + brokeRows[4] + brokeRows[5], 250);

  // ---- print / PDF report ----
  assert.ok(el('printAssumptions').classList.contains('printOnly'), 'the print block is print-only');
  assert.ok(el('printAssumptionsList').children.length >= 20, 'key assumptions are listed after each calculation');
  const printedLabels = el('printAssumptionsList').children.filter((_, i) => i % 2 === 0).map(node => node.textContent);
  for (const label of ['Semilla', 'Rutas simuladas', 'Gasto anual al jubilarte', 'Tasa de retiro']) assert.ok(printedLabels.includes(label), 'print block lists ' + label);
  const limitTexts = list => list.children.map(item => item.textContent);
  const screenLimits = limitTexts(el('limitsList')), printLimits = limitTexts(el('printLimitsList'));
  assert.ok(screenLimits.length >= 9, 'the limits are listed (' + screenLimits.length + ')');
  assert.deepEqual(printLimits, screenLimits, 'the on-screen and the printed limits lists are identical');
  assert.ok(el('assumptionsLimits').classList.contains('screenOnly'), 'the on-screen copy is hidden when printing (the print copy replaces it)');
  const limitsText = screenLimits.join(' | ');
  for (const phrase of [/no asesoramiento/, /simulación/, /solo se aplican a las retiradas/, /dividendos, intereses y alquileres/, /libres de impuestos y cotizaciones/,
    /nominales 2024\/2025/, /control nur/, /2027 a 2030/, /FS1/, /10\.400/, /solo mientras trabajas/, /sin IRPF ni cotizaciones/, /5000 rutas fijas/, /2000 rutas/, /mismo navegador y dispositivo/, /diferencias mínimas/])
    assert.match(limitsText, phrase, 'limits mention ' + phrase);
  assert.doesNotMatch(limitsText, /nur\)? (y|están|está) .*fijad|fijados en el modelo|no cambian con el gasto por hijo/, 'nur is a slider: it must not be described as hard-coded');
  assert.doesNotMatch(app.html, /exactamente reproducibles|idénticos en cualquier dispositivo/, 'no over-claim anywhere in the page text');

  // ---- simulation context text ----
  const contextText = (seed, paths, se) => call('describeSimulationContext(' + JSON.stringify(seed) + ',' + paths + ',' + JSON.stringify(se) + ')');
  assert.match(contextText(null, 12345, .4), /aleatoria \(no reproducible/);
  assert.match(contextText(42, 12345, .4), /Semilla 42 \(reproducible en este navegador y dispositivo: .*5000 rutas fijas/);
  assert.match(contextText(42, 12345, .4), /diferencias mínimas/, 'cross-browser rounding differences are admitted');
  assert.doesNotMatch(contextText(42, 12345, .4), /exactamente|idénticos en cualquier dispositivo/, 'no over-claim of bit-exact reproducibility');
  assert.match(contextText(42, 12345, .4), /12\.345 rutas/, 'the sample size stays visible');
  assert.match(contextText(42, 12345, .004), /±0\.8 puntos/, 'the Monte Carlo standard error stays visible');
  assert.doesNotMatch(contextText(42, 5000, null), /NaN/);

  // ---- CSV export ----
  const csv = value => call('csvCell(' + JSON.stringify(value) + ')');
  assert.equal(csv('plain'), '"plain"');
  assert.equal(csv('say "hi"'), '"say ""hi"""', 'quotes are doubled');
  assert.equal(csv('a,b\nc'), '"a,b\nc"', 'commas/newlines stay inside the quoted cell');
  for (const dangerous of ['=SUM(A1)', '+1+1', '-2+3', '@SUM(1)', '\t=1', '\r=1']) assert.ok(csv(dangerous).startsWith('"\''), 'formula text is neutralised: ' + JSON.stringify(dangerous));
  assert.equal(csv('=HYPERLINK("http://x","y")'), '"\'=HYPERLINK(""http://x"",""y"")"');
  assert.equal(csv(-30), '"-30"', 'genuine negative numbers are exported unchanged');
  assert.equal(csv(null), '""'); assert.equal(call('csvCell(NaN)'), '""'); assert.equal(call('csvCell(Infinity)'), '""');
  assert.equal(csv('safe text - with dash'), '"safe text - with dash"');

  // ---- run summary describes bracket mode separately from the flat rate ----
  setValue('seed', '2'); el('proMode').checked = true; el('taxOn').checked = true; el('useIrpfBrackets').checked = true; setValue('taxRateProv', '5');
  await call("safeRun('preview')");
  assert.match(el('calc').textContent, /tramos progresivos del ahorro 19-30 %/);
  assert.match(el('calc').textContent, /Provident \(5\.0%\)/);
  assert.doesNotMatch(el('calc').textContent, /tipo medio 19/, 'bracket mode never reports the unused flat rate');
  el('useIrpfBrackets').checked = false; setValue('taxRateProv', '9');
  await call("safeRun('preview')");
  assert.match(el('calc').textContent, /tipo medio 19\.0%/);
  assert.match(el('calc').textContent, /Provident antes que la cartera/);

  // ---- sensitivity / stress buttons surface input errors instead of rejecting silently ----
  for (const [button, loading] of [['runSensitivity', 'sensLoading'], ['runSrrStress', 'srrLoading']]) {
    setValue('seed', '-3'); el('assumptionError').textContent = '';
    await el(button).fireAsync('click');
    assert.match(el('assumptionError').textContent, /semilla/i, button + ' shows the invalid-seed error in the visible error area');
    assert.equal(el(button).disabled, false, button + ' is re-enabled after the error');
    assert.equal(el(loading).style.display, 'none', button + ' hides its loading indicator');
  }
  setValue('seed', '');

  // ---- an unparsable number input (badInput, whose .value reads as '') must not become a random run ----
  el('seed').validity.badInput = true; setValue('seed', '');
  await call("safeRun('preview')");
  assert.match(el('assumptionError').textContent, /semilla/i, 'badInput with an empty value is refused');
  el('seed').validity.badInput = false;
  await call("safeRun('preview')");
  assert.equal(el('assumptionError').textContent, '', 'a genuinely empty field is still a random run');

  // ---- ruin table only reports years the simulated horizon actually reaches ----
  setValue('seed', '1'); setValue('ageNow', '28'); setValue('horizonAge', '40');
  for (const [id, value] of [['startEq', '400000'], ['vida', '1800'], ['hip', '0'], ['gasto', '25000'], ['salFO', '500000'], ['salCA', '750000']]) setValue(id, value);
  await call("safeRun('preview')");
  const shortTable = el('ruinTable').innerHTML;
  assert.match(shortTable, /15 años<\/td><td class="na">muestra insuficiente/, 'year 15 is beyond a 12-year horizon');
  assert.match(shortTable, /30 años<\/td><td class="na">muestra insuficiente/);
  setValue('horizonAge', '90');
  await call("safeRun('preview')");
  assert.doesNotMatch(el('ruinTable').innerHTML, /15 años<\/td><td class="na">/, 'a 62-year horizon does cover year 15');

  // ---- CSV for Spanish Excel: semicolon delimiter, decimal comma, UTF-8 BOM ----
  const report = call('buildReportCsv({seed:null, gasto:60000, srrShockPct:-30, ret:5.5, lumpSums:[{year:2030,month:1,amount:-500.5}], name:"a;b"}, [{year:2030,p10:1.5,p50:2500.25,p90:3}], 1800000.5)');
  assert.equal(report.charCodeAt(0), 0xfeff, 'the file starts with a UTF-8 BOM');
  const lines = report.slice(1).split('\n');
  assert.equal(lines[0], '"kind";"year";"p10";"p50";"p90";"target"', 'semicolon-delimited header');
  assert.ok(lines.includes('"assumption";"ret";"5,5";"";"";""'), 'decimal comma in numeric cells');
  assert.ok(lines.includes('"assumption";"srrShockPct";"-30";"";"";""'), 'negative numbers stay numbers');
  assert.ok(lines.includes('"assumption";"name";"a;b";"";"";""'), 'a semicolon inside a value stays inside its quoted cell');
  assert.ok(lines.includes('"projection";"2030";"1,5";"2500,25";"3";"1800000,5"'), 'projection rows use decimal commas');
  assert.ok(lines.some(line => line.startsWith('"assumption";"lumpSums";"[{""year"":2030')), 'JSON cells keep their doubled quotes');
  assert.equal(call('csvCell(1234.5)'), '"1234,5"');
  assert.equal(call('csvCell("1234.5")'), '"1234.5"', 'text that merely looks numeric is not reformatted');
  assert.equal(call('csvCell("a;b")'), '"a;b"');
  assert.equal(call('csvCell("=1;2")'), '"\'=1;2"');

  // ---- saving to localStorage must not fail silently ----
  const originalSetItem = app.context.localStorage.setItem;
  app.context.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  el('scenarioMsg').textContent = '';
  assert.equal(call('persistScenarios()'), false, 'persistScenarios reports failure');
  assert.match(el('scenarioMsg').textContent, /No se pudo guardar.*navegador/, 'the user is told the scenarios were not persisted');
  assert.equal(el('scenarioMsg').style.display, 'block');
  app.context.localStorage.setItem = originalSetItem;
  el('scenarioMsg').textContent = '';
  assert.equal(call('persistScenarios()'), true, 'persistScenarios reports success');
  assert.equal(el('scenarioMsg').textContent, '', 'and stays quiet');

  // ---- text integrity: no lost accents (literal "?") and no mojibake ----
  assert.doesNotMatch(app.html, /P\?rdida|jubilaci\?n|precisi\?n|l\?mite|v\?lidos| rutas \? /, 'accented letters were replaced by "?"');
  assert.equal(app.html.includes(String.fromCharCode(0xfffd)) || app.html.includes(String.fromCharCode(0xc3, 0xa9)) || app.html.includes(String.fromCharCode(0xe2, 0x201a, 0xac)), false, 'no mojibake');
  assert.ok(app.html.includes('P' + String.fromCharCode(0xe9) + 'rdida de licencia') && app.html.includes(String.fromCharCode(0x20ac)), 'accents and the euro sign are intact');
  console.log('ui behaviour: OK');
})().catch(error => { console.error(error); process.exit(1); });
