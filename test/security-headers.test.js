const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

// index-publico.html is not the canonical app, but GitHub Pages serves it from
// the repository root too, so it must carry the same policy.
for (const file of ['index.html', 'index-publico.html']) test(`${file}: a Content-Security-Policy forbids network exfiltration and foreign scripts`, () => {
  const html = fs.readFileSync(file, 'utf8');
  const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
  assert.ok(m, 'CSP meta must exist');
  const csp = m[1];
  assert.match(csp, /connect-src 'none'/, 'no fetch/XHR/beacon: financial data never leaves the browser');
  assert.match(csp, /script-src 'self' 'unsafe-inline'(;|$)/, 'only same-origin and the inline app script');
  assert.match(csp, /worker-src blob:/, 'the simulation worker is built from a Blob');
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'none'/);
  assert.match(html, /<meta name="referrer" content="no-referrer">/);
});

test('CI actions are pinned to commit SHAs', () => {
  const wf = fs.readFileSync('.github/workflows/test.yml', 'utf8');
  for (const line of wf.split('\n').filter(l => /uses:/.test(l))) assert.match(line, /@[0-9a-f]{40}\b/, line.trim());
});
