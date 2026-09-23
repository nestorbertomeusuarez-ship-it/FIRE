// Structure audit for index.html (Phase 2: section order, nav, grouped parameters).
// Only markup moved: every id survives exactly once and the inline script is byte-identical to HEAD.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
// Baseline: HEAD. Phase 2 is uncommitted while this runs, so HEAD is the Phase 1 commit and the script must not differ
// from it. (After the change is committed the comparison is trivially true; EXPECTED_IDS keeps guarding the markup.)
let baselineHtml = null;
try {
  baselineHtml = execFileSync('git', ['show', 'HEAD:index.html'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
} catch (error) {
  baselineHtml = null; // not a git checkout: the script comparison is skipped below
}

// Every id present in the HTML body at the Phase 1 commit (except the dissolved #extendedAssumptions).
const EXPECTED_IDS = [
  'main-content', 'ageMed', 'yearMed', 'ageP10', 'yearP10', 'targetCap', 'targetNote', 'wpts',
  'ruinTable', 'zoomReset', 'expandChart', 'chart', 'chartTip', 'legend', 'accessibleSeries', 'zoomResetContrib',
  'contribChart', 'contribSummary', 'contribChartTip', 'accessibleContrib', 'zoomResetRuin', 'ruinChartCanvas', 'ruinChartTip', 'chartModal',
  'zoomResetModal', 'closeChartModal', 'chartModalCanvas', 'chartTipModal', 'legendModal', 'historicalBacktest', 'btCapitalValue', 'btCapital',
  'btSpendValue', 'btSpend', 'btYearsValue', 'btYears', 'btResults', 'ageNow_o', 'ageNow', 'horizonAge_o',
  'horizonAge', 'careerYear_o', 'careerYear', 'allocCash_o', 'allocCash', 'allocBonds_o', 'allocBonds', 'allocEquities_o',
  'allocEquities', 'cashRet_o', 'cashRet', 'cashVol_o', 'cashVol', 'childAnnual_o', 'childAnnual', 'childStartAge_o',
  'childStartAge', 'childEndAge_o', 'childEndAge', 'pensionAnnual_o', 'pensionAnnual', 'pensionStartAge_o', 'pensionStartAge', 'healthcareAnnual_o',
  'healthcareAnnual', 'healthcareStartAge_o', 'healthcareStartAge', 'lumpSums', 'lumpSumHelp', 'assumptionError', 'outcomesDashboard', 'outcomeSummary',
  'scenarioName', 'saveScenario', 'deleteAllScenarios', 'exportScenarios', 'importScenariosFile', 'scenarioMsg', 'scenarioList', 'reports',
  'exportCsv', 'printReport', 'printAssumptions', 'printAssumptionsList', 'printLimitsList', 'assumptionsLimits', 'limitsList', 'runSensitivity',
  'sensLoading', 'sensList', 'srrShockPct_o', 'srrShockPct', 'srrShockMonths_o', 'srrShockMonths', 'runSrrStress', 'srrLoading',
  'srrResult', 'proMode', 'fx_o', 'fx', 'salFO_o', 'salFO', 'salCA_o', 'salCA',
  'captY_o', 'captY', 'captDelay_o', 'captDelay', 'startDelay_o', 'startDelay', 'salG_o', 'salG',
  'profitShareWeeks_o', 'profitShareWeeks', 'mandatoryRetireOn', 'mandatoryRetireAge_o', 'mandatoryRetireAge', 'ret_o', 'ret', 'vol_o',
  'vol', 'histMarketOn', 'vida_o', 'vida', 'vidaG_o', 'vidaG', 'hip_o', 'hip',
  'hipEnd_o', 'hipEnd', 'nur_o', 'nur', 'burr_o', 'burr', 'brOn', 'brNet_o',
  'brNet', 'brStart_o', 'brStart', 'brYears_o', 'brYears', 'startEq_o', 'startEq', 'startBtc_o',
  'startBtc', 'btcRet_o', 'btcRet', 'btcVol_o', 'btcVol', 'btcRho_o', 'btcRho', 'btcAporte_o',
  'btcAporte', 'provOn', 'basicFO_o', 'basicFO', 'basicCA_o', 'basicCA', 'provCo_o', 'provCo',
  'gratuityYears_o', 'gratuityYears', 'taxOn', 'useIrpfBrackets', 'taxRate_o', 'taxRate', 'taxRateProv_o', 'taxRateProv',
  'burrTaxRate_o', 'burrTaxRate', 'taxRepatDelay_o', 'taxRepatDelay', 'beckhamOn', 'beckhamYears_o', 'beckhamYears', 'wealthTaxOn',
  'ccaaPreset_o', 'ccaaPreset', 'wealthExempt_o', 'wealthExempt', 'wealthRate_o', 'wealthRate', 'wealthBonusPct_o', 'wealthBonusPct',
  'mortgageBalance_o', 'mortgageBalance', 'lolOn', 'lolAnnualProb_o', 'lolAnnualProb', 'lolPremiumMonthly_o', 'lolPremiumMonthly', 'lolPayoutMode_o',
  'lolPayoutMode', 'lolPayout_o', 'lolPayout', 'lolReplacePct_o', 'lolReplacePct', 'lolReplaceYears_o', 'lolReplaceYears', 'fxVolOn',
  'fxVol_o', 'fxVol', 'fxMeanRevert_o', 'fxMeanRevert', 'inflOn', 'inflVol_o', 'inflVol', 'wdStrategy_o',
  'wdStrategy', 'gkGuard_o', 'gkGuard', 'gkCut_o', 'gkCut', 'gkRaise_o', 'gkRaise', 'gkFreq_o',
  'gkFreq', 'goGoMult_o', 'goGoMult', 'goGoYears_o', 'goGoYears', 'slowGoMult_o', 'slowGoMult', 'slowGoYears_o',
  'slowGoYears', 'noGoMult_o', 'noGoMult', 'startGold_o', 'startGold', 'goldRet_o', 'goldRet', 'goldVol_o',
  'goldVol', 'goldRho_o', 'goldRho', 'goldAporte_o', 'goldAporte', 'reOn', 'reValue_o', 'reValue',
  'reYield_o', 'reYield', 'reAppr_o', 'reAppr', 'reCountsFire', 'glideOn', 'glideTargetYear_o', 'glideTargetYear',
  'glideStartYears_o', 'glideStartYears', 'glideEqFloor_o', 'glideEqFloor', 'consRet_o', 'consRet', 'consVol_o', 'consVol',
  'lifeExpOn', 'lifeExp_o', 'lifeExp', 'baristaOn', 'baristaIncome_o', 'baristaIncome', 'baristaYears_o', 'baristaYears',
  'gasto_o', 'gasto', 'swr_o', 'swr', 'reset', 'seed', 'calc', 'calcAnnounce',
  'simulationContext', 'calcLoading',
];
const NEW_IDS = ['resultados', 'parametros', 'analisis', 'escenarios', 'notas'];

const bodyOf = (source) => source.slice(0, source.indexOf('<script src="simulation-core.js">'));
const body = bodyOf(html);
const markup = body.slice(body.indexOf('</style>'));
const inlineScript = (source) => source.slice(source.indexOf('<script>') + '<script>'.length, source.lastIndexOf('</script>'));
const at = (needle, from = 0) => {
  const index = body.indexOf(needle, from);
  assert.notEqual(index, -1, 'missing marker: ' + needle);
  return index;
};
const idAt = (id) => at('id="' + id + '"');
const collectIds = (source) => Array.from(source.matchAll(/\sid="([^"]+)"/g), (m) => m[1]);

function assertAscending(markers, label) {
  let previous = -1;
  for (const [name, index] of markers) {
    assert.ok(index > previous, label + ': "' + name + '" is out of order');
    previous = index;
  }
}

test('every id survives exactly once and none is duplicated', () => {
  const ids = collectIds(body);
  const counts = new Map();
  for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);
  const duplicated = [...counts].filter(([, n]) => n > 1).map(([id]) => id);
  assert.deepEqual(duplicated, [], 'no duplicate ids: ' + duplicated.join(', '));
  for (const id of EXPECTED_IDS) assert.equal(counts.get(id), 1, 'id "' + id + '" must exist exactly once');
  for (const id of NEW_IDS) assert.equal(counts.get(id), 1, 'new id "' + id + '" must exist exactly once');
  assert.equal(counts.has('extendedAssumptions'), false, '#extendedAssumptions is dissolved');
  const unexpected = ids.filter((id) => !EXPECTED_IDS.includes(id) && !NEW_IDS.includes(id));
  assert.deepEqual(unexpected, [], 'no unplanned ids');
});

test('one inline script, byte-identical to the Phase 1 script', (t) => {
  assert.equal((html.match(/<script\b/g) || []).length, 2, 'external script + exactly one inline script');
  assert.ok(html.indexOf('<script src="simulation-core.js">') < html.indexOf('<script>'), 'the external script precedes the inline one');
  if (baselineHtml === null) return t.skip('git history unavailable');
  assert.equal(inlineScript(html), inlineScript(baselineHtml), 'inline script is unchanged');
});

test('parts appear in the agreed order', () => {
  assertAscending([
    ['readout', at('class="readout"')], ['#calc', idAt('calc')], ['#simulationContext', idAt('simulationContext')],
    ['#calcLoading', idAt('calcLoading')], ['#resultados', idAt('resultados')],
    ['#outcomesDashboard', idAt('outcomesDashboard')], ['#parametros', idAt('parametros')],
    ['#analisis', idAt('analisis')], ['#escenarios', idAt('escenarios')], ['#notas', idAt('notas')],
  ], 'part order');
  assert.ok(at('</header>') < at('<nav class="pageNav"'), 'nav sits below the header');
  assert.ok(at('<nav class="pageNav"') < at('class="readout"'), 'nav sits above the readout');
  assert.ok(idAt('calcAnnounce') < idAt('resultados'), 'status block is above Resultados');

  assertAscending([
    ['#resultados', idAt('resultados')], ['Waypoints', at('<h2>Hitos de patrimonio</h2>')], ['#wpts', idAt('wpts')],
    ['Riesgo de ruina', at('<h2>Riesgo de ruina tras el FIRE</h2>')], ['#ruinTable', idAt('ruinTable')],
    ['#chart', idAt('chart')], ['#contribChart', idAt('contribChart')], ['#ruinChartCanvas', idAt('ruinChartCanvas')],
    ['#chartModal', idAt('chartModal')], ['#outcomesDashboard', idAt('outcomesDashboard')], ['#parametros', idAt('parametros')],
  ], 'Resultados order');

  assertAscending([
    ['#analisis', idAt('analisis')], ['Sensibilidad', at('<h2>Sensibilidad</h2>')],
    ['Riesgo de secuencia', at('<h2>Riesgo de secuencia al jubilarte</h2>')],
    ['#historicalBacktest', idAt('historicalBacktest')], ['#escenarios', idAt('escenarios')],
  ], 'Analisis order');
  assertAscending([
    ['#escenarios', idAt('escenarios')], ['Comparar', at('<h2>Comparar escenarios</h2>')], ['#reports', idAt('reports')],
    ['#notas', idAt('notas')], ['#printAssumptions', idAt('printAssumptions')], ['#assumptionsLimits', idAt('assumptionsLimits')],
  ], 'Escenarios and Documentacion order');
  assert.match(body, /<section id="printAssumptions" class="printOnly">/);
  assert.match(body, /<section id="assumptionsLimits" class="screenOnly">/);
});

test('Parametros is one section with the groups in the agreed order', () => {
  const section = body.slice(idAt('parametros'), idAt('analisis'));
  const h3 = Array.from(section.matchAll(/<h3>([^<]+)<\/h3>/g), (m) => m[1]);
  assert.deepEqual(h3, [
    'Objetivo', 'Tú y el horizonte', 'Carrera', 'Gastos', 'Ingresos en jubilación', 'Reparto de la cartera básica',
    'Cartera hoy', 'Liquidaciones', 'Fondo de previsión', 'Mercado',
    'PRO · Fiscalidad España', 'PRO · Riesgo de pérdida de licencia (LOL)', 'PRO · Inflación y FX estocásticos',
    'PRO · Estrategia de retirada', 'PRO · Activos y allocation adicionales', 'PRO · Esperanza de vida y FIRE parcial',
  ], 'h3 order in Parametros');
  assert.equal((section.match(/<h2>/g) || []).length, 1, 'one h2 in Parametros');
  assert.equal((section.match(/class="group pro-only"/g) || []).length, 6);
  assert.equal(/<details\b/.test(section), false, 'no <details> inside Parametros');
  assert.equal(/<details\b/.test(body.slice(idAt('parametros'))), false, 'no <details> after Parametros starts');

  const groupStart = (title) => section.indexOf('<h3>' + title + '</h3>');
  const expectGroup = (title, ids) => {
    const index = h3.indexOf(title);
    const from = groupStart(title);
    const to = index + 1 < h3.length ? groupStart(h3[index + 1]) : section.length;
    for (const id of ids) {
      const position = section.indexOf('id="' + id + '"');
      assert.ok(position >= from && position < to, '#' + id + ' belongs to the "' + title + '" group');
    }
  };
  expectGroup('Objetivo', ['gasto', 'swr']);
  expectGroup('Tú y el horizonte', ['ageNow', 'horizonAge', 'careerYear']);
  expectGroup('Carrera', ['fx', 'salFO', 'salCA', 'captY', 'mandatoryRetireAge']);
  expectGroup('Gastos', ['vida', 'vidaG', 'hip', 'hipEnd', 'nur', 'childAnnual', 'childStartAge', 'childEndAge', 'healthcareAnnual', 'healthcareStartAge']);
  assertAscending([
    ['nur', section.indexOf('id="nur"')], ['childAnnual', section.indexOf('id="childAnnual"')],
    ['healthcareAnnual', section.indexOf('id="healthcareAnnual"')],
  ], 'family controls follow the existing Gastos controls');
  expectGroup('Ingresos en jubilación', ['pensionAnnual', 'pensionStartAge', 'lumpSums', 'lumpSumHelp']);
  expectGroup('Reparto de la cartera básica', ['allocCash', 'allocBonds', 'allocEquities', 'cashRet', 'cashVol']);

  const proRow = section.indexOf('class="proRow"');
  assert.ok(proRow > groupStart('Mercado') && proRow < groupStart('PRO · Fiscalidad España'), 'PRO switch sits right before the PRO groups');
  assert.ok(section.indexOf('id="proMode"') > proRow);
  const errorAt = section.indexOf('id="assumptionError"');
  assert.ok(errorAt > -1 && errorAt < groupStart('Objetivo'), 'validation error sits at the top of the controls');
  assert.match(section, /id="assumptionError" role="alert" aria-live="assertive"/);

  const actionsAt = section.indexOf('<div class="actions">');
  const actions = section.slice(actionsAt);
  assert.ok(actionsAt > groupStart('PRO · Esperanza de vida y FIRE parcial'), 'actions come last');
  assert.ok(actions.indexOf('id="reset"') > -1 && actions.indexOf('id="seed"') > actions.indexOf('id="reset"'));
  for (const id of ['calc', 'calcAnnounce', 'simulationContext', 'calcLoading']) {
    assert.equal(actions.includes('id="' + id + '"'), false, '#' + id + ' left the actions row');
  }
  assert.match(body, /id="seed"[^>]*aria-describedby="simulationContext"/);
  assert.match(body, /<p class="calc" id="calc">/);
  assert.match(body, /<p class="srOnly" id="calcAnnounce" role="status" aria-live="polite">/);
  assert.match(body, /<p class="calcLoading" id="calcLoading" style="display:none">/);
});

test('nav, part bands and styling', () => {
  const navs = markup.match(/<nav\b[^>]*>/g) || [];
  assert.equal(navs.length, 1, 'exactly one nav');
  assert.match(navs[0], /class="pageNav"/);
  assert.match(navs[0], /aria-label="Secciones"/);
  const navHtml = markup.slice(markup.indexOf('<nav'), markup.indexOf('</nav>'));
  const links = Array.from(navHtml.matchAll(/<a\b[^>]*href="#([^"]+)"[^>]*>([^<]+)<\/a>/g), (m) => [m[1], m[2].trim()]);
  assert.deepEqual(links, [
    ['resultados', 'Resultados'], ['parametros', 'Parámetros'], ['analisis', 'Análisis avanzado'],
    ['escenarios', 'Escenarios e informe'], ['notas', 'Notas'],
  ]);
  const ids = new Set(collectIds(body));
  for (const [target] of links) assert.ok(ids.has(target), 'nav target #' + target + ' exists');

  const css = html.slice(0, html.indexOf('</style>'));
  assert.match(css, /\.pageNav\s*\{[^}]*position:\s*sticky[^}]*top:\s*0/, 'nav is sticky at the top');
  assert.match(css, /\.pageNav\s*\{[^}]*background:\s*var\(--paper\)/, 'nav has an opaque themed background');
  assert.match(css, /\.pageNav\s*\{[^}]*z-index:\s*\d+/);
  assert.match(css, /scroll-margin-top/, 'anchor targets clear the sticky nav');
  const printBlocks = css.match(/@media print\s*\{[^@]*\}/g) || [];
  assert.ok(printBlocks.some((block) => /\.pageNav/.test(block) && /display:\s*none/.test(block)), 'nav is hidden when printing');
  assert.match(css, /\.group\s*>\s*h3\s*\{[^}]*font-size:\s*1[3-9]px/, 'group headings are bigger');
  assert.match(css, /\.group\s*>\s*h3\s*\{[^}]*color:\s*var\(--ink\)/, 'group headings use the darker ink');

  const bands = markup.match(/<div class="partBand" aria-hidden="true">[^<]+<\/div>/g) || [];
  assert.deepEqual(bands.map((band) => band.replace(/<[^>]+>/g, '')),
    ['Resultados', 'Parámetros', 'Análisis avanzado', 'Escenarios e informe', 'Documentación']);
});

test('canvases stay directly inside their .chartbox', () => {
  for (const id of ['chart', 'contribChart', 'ruinChartCanvas', 'chartModalCanvas']) {
    assert.match(body, new RegExp('<div class="chartbox">\\s*<canvas id="' + id + '"'), 'canvas #' + id + ' is directly inside its .chartbox');
  }
  const dialog = body.slice(idAt('chartModal'), body.indexOf('</dialog>'));
  assert.ok(dialog.includes('id="chartModalCanvas"'), 'the modal canvas stays in the dialog');
});

test('no position-dependent wording remains in the rendered markup', () => {
  const forbidden = [
    /\barriba\b/i, /\babajo\b/i, /tabla (anterior|siguiente)/i, /fila (anterior|siguiente)/i,
    /gr[áa]fico (anterior|siguiente)/i, /secci[óo]n (anterior|siguiente)/i,
  ];
  for (const pattern of forbidden) {
    const hit = markup.match(new RegExp('.{0,40}' + pattern.source + '.{0,20}', pattern.flags));
    assert.equal(hit, null, 'position-dependent wording remains: ' + (hit && hit[0]));
  }
});
