// The FIRE target must fund everything the household still has to pay after retiring, not
// only the configured retirement spend: healthcare is permanent (it joins the spend divided
// by the SWR), while children and the mortgage end, so their remaining real payments are
// added on top. Without this the model retired too early (42.7 % post-FIRE ruin by default).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const core = require('../simulation-core.js');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const source = inline.slice(0, inline.indexOf('// Renderer shared by the inline chart')) + '\nglobalThis.__t={simulate,DEFAULTS,MONTH_DATES,monthIndex,CAREER_MONTH};';
const context = { console, Math, Float64Array, Int32Array, Uint8Array, Date, Infinity, NavlogCore: core, document: { getElementById: () => null }, globalThis: null };
context.globalThis = context; vm.createContext(context); vm.runInContext(source, context, { timeout: 5000 });
const { simulate, DEFAULTS, MONTH_DATES, monthIndex, CAREER_MONTH } = context.__t;

test('default SWR is 3 %', () => assert.equal(DEFAULTS.swr, 3));

test('with no commitments the target is still spend / SWR', () => {
  const r = simulate({ ...DEFAULTS, seed: 1, childCount: 0, healthcareAnnual: 0, hip: 0 }, 5);
  assert.equal(r.target, DEFAULTS.gasto / (DEFAULTS.swr / 100));
});

test('the reported target adds healthcare to the spend and the remaining child and mortgage payments (mortgage from the career start)', () => {
  const p = { ...DEFAULTS, seed: 1, horizonAge: 80 };
  const months = Math.floor((p.horizonAge - p.ageNow) * 12) + 1;
  const costs = { cost0to2: p.childCost0to2, cost3to17: p.childCost3to17, cost18to22: p.childCost18to22, schoolCost: p.childSchoolCost, fs1Cost: p.childFS1Cost };
  const birth = monthIndex(p.child1BirthYear, p.child1BirthMonth), careerStart = monthIndex(p.careerYear, CAREER_MONTH);
  let committed = 0;
  for (let i = 0; i < months; i++) {
    committed += core.childMonthlyCost(i - birth, costs, false, 0);
    const d = MONTH_DATES[i];
    if (i >= careerStart && (d.y < p.hipEnd || (d.y === p.hipEnd && d.m <= 12))) committed += p.hip;
  }
  const expected = (p.gasto + p.healthcareAnnual) / (p.swr / 100) + committed;
  assert.ok(Math.abs(simulate(p, 5).target - expected) < 1e-6);
});

test('children are funded before retiring: three children no longer push post-FIRE ruin far above none', () => {
  const ruin = o => { const r = simulate({ ...DEFAULTS, seed: 11, ...o }, 1500); return Array.from(r.ruined).filter(x => x).length / 1500; };
  assert.ok(ruin({ childCount: 3 }) <= ruin({ childCount: 0 }) + 0.05);
});
