// Glide path anchored to the real FIRE: the risky share follows progress toward the FIRE target
// (not a fixed calendar year), holds the floor once retired, and can climb back afterwards.
const assert = require('node:assert/strict');
const test = require('node:test');
const core = require('../simulation-core.js');

const { glideRiskyShare } = core;
const base = { anchor: 'fire', floor: 0.5, startPct: 0.8, riseYears: 0, riseTo: 0.75 };

test('calendar anchor keeps the original linear ramp', () => {
  const p = { anchor: 'year', startYears: 10, floor: 0.5 };
  assert.equal(glideRiskyShare({ ...p, yearsToTarget: 12 }), 1);
  assert.equal(glideRiskyShare({ ...p, yearsToTarget: 5 }), 0.75);
  assert.equal(glideRiskyShare({ ...p, yearsToTarget: 0 }), 0.5);
  assert.equal(glideRiskyShare({ ...p, yearsToTarget: -3 }), 0.5);
});

test('fire anchor: fully risky until progress reaches the start threshold', () => {
  assert.equal(glideRiskyShare({ ...base, retired: false, progress: 0.3 }), 1);
  assert.equal(glideRiskyShare({ ...base, retired: false, progress: 0.8 }), 1);
});

test('fire anchor: ramps linearly to the floor as progress goes from start to 100 %', () => {
  assert.ok(Math.abs(glideRiskyShare({ ...base, retired: false, progress: 0.9 }) - 0.75) < 1e-12);
  assert.equal(glideRiskyShare({ ...base, retired: false, progress: 1 }), 0.5);
  assert.equal(glideRiskyShare({ ...base, retired: false, progress: 1.4 }), 0.5);
});

test('fire anchor: a path that never nears the target is never de-risked', () => {
  assert.equal(glideRiskyShare({ ...base, retired: false, progress: 0 }), 1);
  assert.equal(glideRiskyShare({ ...base, retired: false, progress: -0.2 }), 1);
});

test('fire anchor: stays at the floor after FIRE when there is no rise', () => {
  for (const yearsSinceFire of [0, 5, 40]) assert.equal(glideRiskyShare({ ...base, retired: true, yearsSinceFire }), 0.5);
});

test('fire anchor: climbs from the floor to the rise target over the rise years, then holds', () => {
  const p = { ...base, retired: true, riseYears: 10 };
  assert.equal(glideRiskyShare({ ...p, yearsSinceFire: 0 }), 0.5);
  assert.ok(Math.abs(glideRiskyShare({ ...p, yearsSinceFire: 5 }) - 0.625) < 1e-12);
  assert.equal(glideRiskyShare({ ...p, yearsSinceFire: 10 }), 0.75);
  assert.equal(glideRiskyShare({ ...p, yearsSinceFire: 30 }), 0.75);
});

test('fire anchor: a rise target below the floor never pushes the share under the floor', () => {
  assert.equal(glideRiskyShare({ ...base, retired: true, riseYears: 10, riseTo: 0.3, yearsSinceFire: 10 }), 0.5);
});

test('fire anchor: degenerate start threshold of 100 % still yields a valid share', () => {
  const s = glideRiskyShare({ ...base, startPct: 1, retired: false, progress: 1 });
  assert.equal(s, 0.5);
  assert.equal(glideRiskyShare({ ...base, startPct: 1, retired: false, progress: 0.99 }), 1);
});
