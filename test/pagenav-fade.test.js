// Mobile sticky nav (.pageNav) scrolls horizontally with a hidden scrollbar and no affordance
// that more links exist off-screen. A trailing fade cue must exist, scoped to mobile only (the
// desktop layout, where .pageNav never overflows, must stay unchanged).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
assert.ok(styleMatch, 'inline <style> block found');
const css = styleMatch[1];

// The fade must be defined only inside a max-width mobile media query.
const mobileBlocks = [...css.matchAll(/@media\s*\(max-width:\s*640px\)\s*\{([\s\S]*?)\}\s*\}/g)];
assert.ok(mobileBlocks.length > 0, 'a max-width:640px media query exists');
const mobileCss = mobileBlocks.map(m => m[0]).join('\n');
assert.match(mobileCss, /\.pageNav::after\s*\{/, 'a trailing fade pseudo-element for .pageNav exists in the mobile media query');
assert.match(mobileCss, /background:\s*linear-gradient/, 'the cue is a gradient fade');
assert.match(mobileCss, /pointer-events:\s*none/, 'the fade must not intercept taps on the nav links underneath');

// Outside any media query, .pageNav::after must not be defined (desktop stays unchanged).
const withoutMediaBlocks = css.replace(/@media[^{]*\{[\s\S]*?\}\s*\}/g, '');
assert.doesNotMatch(withoutMediaBlocks, /\.pageNav::after/, 'the fade is mobile-only; desktop must be untouched');

console.log('pageNav fade: OK');
