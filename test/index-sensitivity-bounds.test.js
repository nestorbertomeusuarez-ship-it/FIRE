// index.html's runSensitivity() perturbs SENSITIVITY_PARAMS entries with
// NavlogCore.boundedPair(base, delta, def.min, def.max), using whatever the
// live sliders (baseParams) currently hold as `base`. A native reliability
// review flagged this call site as unguarded: nothing proved that, for every
// entry defined in index.html, boundedPair never returns an inverted pair
// (low > high) when clamping around DEFAULTS. This mirrors the extraction
// technique used by test/worker-parity.test.js and
// test/index-publico-sensitivity.test.js (regex-extract the inline <script>,
// evaluate the pure prefix in node:vm) to reach the REAL SENSITIVITY_PARAMS
// table and DEFAULTS, rather than a hand-copied duplicate that could drift.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../simulation-core.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');

const marker = 'const SENSITIVITY_PARAMS = [';
const markerIdx = inline.indexOf(marker);
assert.ok(markerIdx >= 0, 'index.html must still define SENSITIVITY_PARAMS');
const arrayEnd = inline.indexOf('\n];', markerIdx);
assert.ok(arrayEnd >= 0, 'SENSITIVITY_PARAMS array must close with "];"');
// DEFAULTS is defined earlier in the same inline script; slice from the top
// through the end of SENSITIVITY_PARAMS so both are in scope.
const prefixSource = inline.slice(0, arrayEnd + 3)
  + '\nglobalThis.__sens = { DEFAULTS, SENSITIVITY_PARAMS };';

const sandbox = { console, Math, Date, NavlogCore: core, document: { getElementById: () => null } };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(prefixSource, sandbox, { timeout: 5000 });

const { DEFAULTS, SENSITIVITY_PARAMS } = sandbox.__sens;
assert.ok(Array.isArray(SENSITIVITY_PARAMS) && SENSITIVITY_PARAMS.length > 0, 'SENSITIVITY_PARAMS must be a non-empty array');

// The exact case the native review flagged as unguarded: run every
// SENSITIVITY_PARAMS entry through NavlogCore.boundedPair exactly as
// runSensitivity() does, using DEFAULTS as baseParams, and prove no entry
// ever yields an inverted pair (low > high) or a NaN endpoint.
for (const def of SENSITIVITY_PARAMS) {
  const delta = typeof def.delta === 'function' ? def.delta(DEFAULTS) : def.delta;
  const base = DEFAULTS[def.key];
  assert.ok(Number.isFinite(base), def.key + ' must have a finite default value');
  const pair = core.boundedPair(base, delta, def.min, def.max);
  assert.ok(Number.isFinite(pair.low) && Number.isFinite(pair.high), def.key + ' boundedPair must never yield NaN/Infinity endpoints');
  assert.ok(pair.low <= pair.high, def.key + ' boundedPair must never invert (got low=' + pair.low + ', high=' + pair.high + ')');
  if (Number.isFinite(def.min)) assert.ok(pair.low >= def.min, def.key + ' low must respect its own min');
  if (Number.isFinite(def.max)) assert.ok(pair.high <= def.max, def.key + ' high must respect its own max');
}
console.log('index.html sensitivity bounds: OK');
