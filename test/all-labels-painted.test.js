// Every parameter slider has an <output id="<key>_o"> that shows its current value. A control
// added without its paintLabels() line renders an empty value (childFS1Cost shipped that way),
// so after the real start-up run no such output may be empty.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./helpers/fake-app.js');

(async () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const app = await loadApp();
  const { el, env } = app;
  for (let round = 0; round < 4; round++) { env.flushTimers(); await app.settle(); }
  const outputIds = [...html.matchAll(/<output id="([A-Za-z0-9]+)_o"/g)].map(m => m[1]);
  assert.ok(outputIds.length > 50, 'found the parameter outputs');
  const empty = outputIds.filter(id => !String(el(id + '_o').textContent || '').trim());
  assert.deepEqual(empty, [], 'every parameter output shows a value after start-up');
  console.log('all parameter labels painted: OK (' + outputIds.length + ')');
})().catch(err => { console.error(err); process.exit(1); });
