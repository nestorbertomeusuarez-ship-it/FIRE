// The sensitivity analysis must cover the assumptions that move the FIRE date most in this
// model: retirement spend, profit sharing (size and how often it is skipped) and children.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const block = html.slice(html.indexOf('const SENSITIVITY_PARAMS = ['), html.indexOf('];', html.indexOf('const SENSITIVITY_PARAMS = [')));

test('sensitivity covers spend, profit sharing and children', () => {
  for (const key of ['gasto', 'profitShareWeeks', 'profitShareSkipPct', 'childCount', 'swr']) assert.match(block, new RegExp("key:'" + key + "'"), key);
  assert.equal((block.match(/\{key:'/g) || []).length, 18);
});
