// Minimal fake DOM + fake timers that run the REAL inline script of index.html in node:vm.
// (jsdom is not a dependency of this project.) Elements are created lazily from the
// attributes found in the HTML, so ids, types, min/max, aria-* etc. are the real ones.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../../simulation-core.js');

const HTML_PATH = path.join(__dirname, '..', '..', 'index.html');

function parseTags(html) {
  const tags = new Map();
  const all = [];
  for (const match of html.matchAll(/<(input|select|textarea|canvas|p|div|span|output|button|label|details|summary|table|tbody|thead|ul|dl|section|a|dialog|h2|li|b|i)\b([^>]*)>/g)) {
    const attrs = {};
    for (const attr of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attrs[attr[1]] = attr[2] === undefined ? '' : attr[2];
    const info = { tag: match[1], attrs, classes: (attrs.class || '').split(/\s+/).filter(Boolean), index: all.length };
    all.push(info);
    if (attrs.id && !tags.has(attrs.id)) tags.set(attrs.id, info);
  }
  return { tags, all };
}

function createEnvironment(html) {
  const { tags, all } = parseTags(html);
  const timers = []; let timerId = 0;
  const byIndex = new Map();
  const env = {
    tags, all, timers,
    setTimeout(fn, delay) { const id = ++timerId; timers.push({ id, fn, delay: delay || 0 }); return id; },
    clearTimeout(id) { const index = timers.findIndex(t => t.id === id); if (index >= 0) timers.splice(index, 1); },
    pendingTimers() { return timers.length; },
    clearAllTimers() { timers.length = 0; },
    // Run every pending timer (in creation order), including timers scheduled meanwhile.
    flushTimers() { let guard = 0; while (timers.length && guard++ < 1000) { const t = timers.shift(); t.fn(); } },
    elements: new Map(), created: []
  };
  const noopCtx = new Proxy(function() {}, {
    get: (target, name) => name === 'measureText' ? () => ({ width: 0 }) : name === 'createLinearGradient' ? () => ({ addColorStop() {} }) : name === 'canvas' ? {} : () => {},
    set: () => true
  });
  function makeElement(tagName, info) {
    const attrs = info ? { ...info.attrs } : {};
    const listeners = {}; const history = []; let text = '';
    const element = {
      id: attrs.id || '', tagName: String(tagName).toUpperCase(), attrs, listeners, children: [], style: { setProperty() {}, removeProperty() {} }, dataset: {},
      className: attrs.class || '', disabled: false, open: false, hidden: false, checked: attrs.checked !== undefined, value: attrs.value !== undefined ? attrs.value : '',
      min: attrs.min !== undefined ? attrs.min : '', max: attrs.max !== undefined ? attrs.max : '', step: attrs.step || '', validity: { badInput: false },
      classList: { add() {}, remove() {}, toggle() {}, contains: name => (attrs.class || '').split(/\s+/).includes(name) },
      get type() { return attrs.type || (tagName === 'textarea' ? 'textarea' : tagName === 'select' ? 'select-one' : tagName === 'input' ? 'text' : ''); },
      get textContent() { return text; },
      set textContent(value) { text = String(value); history.push(text); },
      get textHistory() { return history; },
      innerHTML: '',
      addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
      removeEventListener() {},
      dispatchEvent(event) { (listeners[event.type] || []).forEach(fn => fn(event)); return true; },
      // Like fire(), but resolves when every (possibly async) listener has finished; rejects if one rejects.
      fireAsync(type, extra) { return Promise.all((listeners[type] || []).map(fn => fn({ type, target: this, currentTarget: this, preventDefault() {}, ...extra }))); },
      fire(type, extra) { this.dispatchEvent({ type, target: this, currentTarget: this, preventDefault() {}, ...extra }); },
      appendChild(child) { this.children.push(child); return child; },
      append(...nodes) { this.children.push(...nodes); },
      replaceChildren(...nodes) { this.children = nodes; },
      remove() {}, focus() {}, click() {}, showModal() { this.open = true; }, close() { this.open = false; },
      setAttribute(name, value) { attrs[name] = String(value); }, getAttribute(name) { return attrs[name] === undefined ? null : attrs[name]; },
      hasAttribute(name) { return attrs[name] !== undefined; },
      parentElement: { clientWidth: 800, clientHeight: 400 },
      querySelector: () => null, querySelectorAll: () => [], closest: () => null,
      getContext: () => noopCtx, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 400 }),
      setPointerCapture() {}, releasePointerCapture() {}, clientWidth: 800, clientHeight: 400, offsetWidth: 800
    };
    return element;
  }
  // Cached element for a parsed tag `info`, keyed by id when it has one (so it's the
  // very same instance getElementById would hand out), or by its document-order index.
  function elementFor(info) {
    const key = info.attrs.id || null;
    if (key) {
      if (!env.elements.has(key)) env.elements.set(key, makeElement(info.tag, info));
      return env.elements.get(key);
    }
    if (!byIndex.has(info.index)) byIndex.set(info.index, makeElement(info.tag, info));
    return byIndex.get(info.index);
  }
  // Minimal selector support: only a single class selector (".foo"), which is all the
  // real inline script ever queries document-wide (e.g. syncWdStrategy's '.wdPhase').
  function queryAll(selector) {
    const match = /^\.([\w-]+)$/.exec(String(selector || '').trim());
    if (!match) return [];
    const className = match[1];
    return all.filter(info => info.classes.includes(className)).map(elementFor);
  }
  const document = {
    getElementById(id) {
      if (!tags.has(id)) return null;
      return elementFor(tags.get(id));
    },
    createElement(tag) { const element = makeElement(tag, null); env.created.push(element); return element; },
    createTextNode(text) { return { nodeType: 3, textContent: String(text) }; },
    querySelector: selector => queryAll(selector)[0] || null, querySelectorAll: queryAll, addEventListener() {}, removeEventListener() {},
    body: null, documentElement: null
  };
  document.body = makeElement('body', null); document.documentElement = makeElement('html', null);
  env.document = document;
  return env;
}

// Load the real page script. Returns { context, env, run(source), settle() }.
async function loadApp(options = {}) {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
  const env = createEnvironment(html);
  const storage = new Map();
  const sandbox = {
    console: options.console || { log() {}, warn() {}, error() {}, info() {} },
    Math, Number, String, JSON, Array, Object, Set, Map, Date, Promise, Float64Array, Int32Array, Uint8Array, Infinity, NaN, isFinite, parseFloat, parseInt,
    NavlogCore: core, document: env.document,
    setTimeout: env.setTimeout, clearTimeout: env.clearTimeout,
    performance: { now: options.now || (() => Number(process.hrtime.bigint() / 1000n) / 1000) },
    localStorage: { getItem: key => storage.has(key) ? storage.get(key) : null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    window: { confirm: () => true, print() {}, addEventListener() {}, devicePixelRatio: 1, innerWidth: 1000, matchMedia: () => ({ matches: false, addEventListener() {} }) },
    requestAnimationFrame: fn => env.setTimeout(fn, 0), ResizeObserver: class { observe() {} disconnect() {} },
    globalThis: null
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const app = {
    context: sandbox, env, html, inline,
    run: source => vm.runInContext(source, sandbox),
    // Wait until no calculation is in flight (the page starts one at load).
    async settle() { for (let i = 0; i < 20000; i++) { if (vm.runInContext('activeRunsPending', sandbox) === 0) return; await new Promise(resolve => setImmediate(resolve)); } throw new Error('calculation never settled'); },
    el: id => env.document.getElementById(id)
  };
  vm.runInContext(inline, sandbox, { filename: 'index.html.inline.js', timeout: 120000 });
  await app.settle();
  return app;
}

module.exports = { loadApp, parseTags, HTML_PATH };
