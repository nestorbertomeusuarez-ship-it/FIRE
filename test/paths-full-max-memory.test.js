// pathsFullMaxFor caps the number of full-precision paths purely by wall-clock
// time budget, ignoring memory: simulate() allocates 3 Float64Array(paths) per
// ANNUAL SNAPSHOT (snapVals/contribVals/feeVals), so at long horizons (e.g. 80
// years, ~68 snapshots) a 500,000-path cap allocates ~816 MB. The cap must
// scale down as the number of annual snapshots grows, so 3*snapshots*paths*8
// bytes never exceeds ~250 MB, while never dropping below PATHS_FULL_MIN.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const source = inline.slice(0, inline.indexOf('// Renderer shared by the inline chart'))
  + '\nglobalThis.__t={pathsFullMaxFor,PATHS_FULL_MIN,PATHS_FULL_MAX,FULL_TIME_BUDGET_MS};';
const context = { console, Math, Float64Array, Int32Array, Uint8Array, Date, Infinity, document: { getElementById: () => null }, globalThis: null };
context.globalThis = context; vm.createContext(context); vm.runInContext(source, context, { timeout: 5000 });
const { pathsFullMaxFor, PATHS_FULL_MIN, FULL_TIME_BUDGET_MS } = context.__t;

const BYTES_PER_PATH_PER_SNAPSHOT = 3 * 8; // 3 Float64Arrays, 8 bytes/entry
const MEMORY_BUDGET_BYTES = 250e6;

// A big time budget alone used to be able to reach the unconditional 500,000 cap.
const hugeTimeBudgetMs = FULL_TIME_BUDGET_MS * 200;

// Short horizon (few snapshots): memory is not the binding constraint.
{
  const paths = pathsFullMaxFor(hugeTimeBudgetMs, 3);
  assert.ok(paths <= 500000, 'still bounded by the absolute ceiling');
  assert.ok(paths * 3 * BYTES_PER_PATH_PER_SNAPSHOT <= MEMORY_BUDGET_BYTES + 1, 'stays within the memory budget even for few snapshots');
}

// Long horizon (80 years ~ 68 annual snapshots): memory must bind well under 500,000.
{
  const snapshots = 68;
  const paths = pathsFullMaxFor(hugeTimeBudgetMs, snapshots);
  assert.ok(paths < 500000, 'a long horizon must be capped below the old unconditional ceiling');
  const totalBytes = paths * snapshots * BYTES_PER_PATH_PER_SNAPSHOT;
  assert.ok(totalBytes <= MEMORY_BUDGET_BYTES, '3*snapshots*paths*8 bytes must stay within ~250 MB, got ' + (totalBytes / 1e6).toFixed(1) + ' MB');
  assert.equal(paths, Math.floor(MEMORY_BUDGET_BYTES / (24 * snapshots)), 'matches the documented paths <= 250e6/(24*snapshots) formula');
}

// The cap never drops below PATHS_FULL_MIN even for extreme snapshot counts.
{
  const paths = pathsFullMaxFor(hugeTimeBudgetMs, 100000);
  assert.equal(paths, PATHS_FULL_MIN, 'never caps below PATHS_FULL_MIN');
}

// A tiny time budget still yields the smaller of the two bounds (time still applies).
{
  const paths = pathsFullMaxFor(FULL_TIME_BUDGET_MS, 5);
  assert.ok(paths >= PATHS_FULL_MIN);
}

console.log('pathsFullMaxFor memory scaling: OK');
