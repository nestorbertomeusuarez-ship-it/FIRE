// Emirates contract (Candidate Information - Pilots, 6.1): on leaving you receive EITHER the
// Provident company contributions OR the EOSB, whichever is higher, PLUS your own member
// contributions, subject to vesting by length of scheme membership:
//   < 1 year: no EOSB; 1-3 years: EOSB + member; 3-5 years: 75 % of company (or EOSB if higher)
//   + member; 5+ years: 100 % of company (or EOSB if higher) + member.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const core = require('../simulation-core.js');

const base = { basicAED: 30000, fx: 0.25, provOn: true };
// gratuity for 2 years = 42 days of basic = 42 * 1000 AED * 0.25 = 10,500 EUR
test('endOfServiceSettlement: under 3 years the company contributions are forfeited, EOSB paid', () => {
  assert.deepEqual(core.endOfServiceSettlement({ ...base, years: 2, provCompany: 40000 }), { cash: 10500, forfeit: 40000 });
  assert.deepEqual(core.endOfServiceSettlement({ ...base, years: 0.5, provCompany: 5000 }), { cash: 0, forfeit: 5000 }, 'under 1 year: no EOSB either');
});
test('endOfServiceSettlement: 3-5 years vests 75 % of the company part, or the EOSB if higher', () => {
  // 4 years: 84 days = 21,000 EUR of EOSB
  assert.deepEqual(core.endOfServiceSettlement({ ...base, years: 4, provCompany: 100000 }), { cash: 0, forfeit: 25000 });
  assert.deepEqual(core.endOfServiceSettlement({ ...base, years: 4, provCompany: 20000 }), { cash: 6000, forfeit: 5000 }, 'EOSB 21,000 > 75 % of 20,000');
});
test('endOfServiceSettlement: from 5 years the full company part vests; only an EOSB shortfall is added', () => {
  // 6 years: 105 + 30 = 135 days = 33,750 EUR
  assert.deepEqual(core.endOfServiceSettlement({ ...base, years: 6, provCompany: 200000 }), { cash: 0, forfeit: 0 });
  assert.deepEqual(core.endOfServiceSettlement({ ...base, years: 6, provCompany: 30000 }), { cash: 3750, forfeit: 0 });
});
test('endOfServiceSettlement: without the Provident modelled, the full EOSB is paid', () => {
  assert.deepEqual(core.endOfServiceSettlement({ ...base, years: 6, provCompany: 0, provOn: false }), { cash: 33750, forfeit: 0 });
});

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const source = inline.slice(0, inline.indexOf('// Renderer shared by the inline chart')) + '\nglobalThis.__t={simulate,DEFAULTS};';
const context = { console, Math, Float64Array, Int32Array, Uint8Array, Date, Infinity, NavlogCore: core, document: { getElementById: () => null }, globalThis: null };
context.globalThis = context; vm.createContext(context); vm.runInContext(source, context, { timeout: 5000 });
const { simulate, DEFAULTS } = context.__t;

test('leaving Emirates after ~2 years forfeits the company contributions: the company rate no longer matters', () => {
  // Mandatory exit at 55 with ageNow 52 and a June 2027 career start: about 2.25 years of service.
  const early = { ...DEFAULTS, seed: 4, ageNow: 52, horizonAge: 70, startDelay: 0, startEq: 1200000, mandatoryRetireOn: true, mandatoryRetireAge: 55, profitShareWeeks: 0, childCount: 0 };
  const last = r => r.series[r.series.length - 1].p50;
  assert.equal(last(simulate({ ...early, provCo: 12 }, 200)), last(simulate({ ...early, provCo: 0 }, 200)));
});
