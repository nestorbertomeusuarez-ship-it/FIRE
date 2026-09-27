// Nominal tax thresholds (IRPF savings/general brackets, wealth-tax exemption, solidarity
// exemption/brackets) erode in real terms every year because Spanish law does not index them
// to inflation. Every progressive-tax helper in simulation-core.js accepts an optional
// trailing `scale` (default 1, so every pre-existing call/test keeps working unchanged):
// scaling every bracket boundary by `scale` is the correct way to shrink/grow thresholds in
// real terms while keeping the same marginal-rate structure.
const assert = require('node:assert/strict');
const test = require('node:test');
const core = require('../simulation-core.js');

test('progressiveTax: scale=1 is identical to the unscaled brackets (default, backward compatible)', () => {
  const brackets = [{ upTo: 1000, rate: 0.1 }, { upTo: 5000, rate: 0.2 }, { upTo: Infinity, rate: 0.3 }];
  for (const base of [0, 500, 1000, 3000, 5000, 20000]) {
    assert.equal(core.progressiveTax(base, brackets, 1), core.progressiveTax(base, brackets));
  }
});

test('progressiveTax: scale=0.5 halves every bracket boundary (thresholds erode in real terms)', () => {
  const brackets = [{ upTo: 1000, rate: 0.1 }, { upTo: 5000, rate: 0.2 }, { upTo: Infinity, rate: 0.3 }];
  // Hand-computed against boundaries halved to [500, 2500, Infinity]:
  // base=2000 -> 500*0.1 + 1500*0.2 = 50+300 = 350
  assert.ok(Math.abs(core.progressiveTax(2000, brackets, 0.5) - 350) < 1e-9);
  // base=3000 -> 500*0.1 + 2000*0.2 + 500*0.3 = 50+400+150 = 600
  assert.ok(Math.abs(core.progressiveTax(3000, brackets, 0.5) - 600) < 1e-9);
});

test('progressiveTax: an invalid scale (non-finite, zero, negative) falls back to 1', () => {
  const brackets = [{ upTo: 1000, rate: 0.1 }, { upTo: Infinity, rate: 0.3 }];
  const unscaled = core.progressiveTax(2000, brackets);
  for (const bad of [0, -1, NaN, Infinity, -Infinity, undefined, null, 'x']) {
    assert.equal(core.progressiveTax(2000, brackets, bad), unscaled, `scale=${bad} should fall back to 1`);
  }
});

test('progressiveSavingsTax: scale halves the ahorro bracket boundaries', () => {
  const unscaled = core.progressiveSavingsTax(12000);
  assert.equal(core.progressiveSavingsTax(12000, 1), unscaled);
  // boundaries halved: [3000, 25000, 100000, 150000, Infinity]
  // 12000 -> 3000*0.19 + 9000*0.21 = 570 + 1890 = 2460
  assert.ok(Math.abs(core.progressiveSavingsTax(12000, 0.5) - 2460) < 1e-9);
});

// generalIncomeTax (and its scale threading) was removed with the Provident cash-payout fix:
// it only existed to tax the Provident Scheme as regional general income, and the Provident
// is now paid out in cash while still a UAE resident, so Spain never taxes it that way.

test('solidarityWealthTax: scale applies to both the exemption and the bracket boundaries', () => {
  const unscaled = core.solidarityWealthTax(4700000);
  assert.equal(core.solidarityWealthTax(4700000, 1), unscaled);
  // exemption halved to 350000, brackets halved: [1500000, 2673999.015, 5347998.03, Infinity]
  // netWealth 4700000 -> base 4350000 -> 1500000*0 + 1173999.015*0.017 + (4350000-2673999.015)*0.021
  const base = 4700000 - 350000;
  const b1 = 3000000 * 0.5, b2 = 5347998.03 * 0.5, b3 = 10695996.06 * 0.5;
  let tax = 0, lower = 0;
  for (const [upTo, rate] of [[b1, 0], [b2, 0.017], [b3, 0.021], [Infinity, 0.035]]) {
    tax += Math.max(0, Math.min(base, upTo) - lower) * rate; lower = upTo; if (base <= upTo) break;
  }
  assert.ok(Math.abs(core.solidarityWealthTax(4700000, 0.5) - tax) < 1e-6);
  assert.ok(core.solidarityWealthTax(4700000, 0.5) > unscaled, 'a smaller real exemption/brackets means more tax on the same wealth');
});

test('marginalSavingsTaxRate: scale shifts which bracket a given ytdGain falls into', () => {
  // ytdGain=40000 sits in the 21% bracket unscaled (6000-50000), but in the halved-bracket
  // scale (3000-25000) it falls past 25000, into the 23% bracket (50000-200000 halved).
  const unscaled = core.marginalSavingsTaxRate(1, 40000);
  const scaled = core.marginalSavingsTaxRate(1, 40000, 0.5);
  assert.ok(Math.abs(unscaled - 21) < 1e-9);
  assert.ok(Math.abs(scaled - 23) < 1e-9);
});

// grossForNetGeneralIncome / netAfterGeneralIncomeTax were removed for the same reason.

test('grossForNetSavings / netAfterSavingsTax: round-trip inverse holds with scale != 1', () => {
  const needNet = 20000, gainFraction = 0.6, ytdGain = 10000, maxGross = 500000, scale = 0.4;
  const gross = core.grossForNetSavings(needNet, gainFraction, ytdGain, maxGross, scale);
  const net = core.netAfterSavingsTax(gross, gainFraction, ytdGain, scale);
  assert.ok(Math.abs(net - needNet) < 1, `round-trip net (${net}) should match needNet (${needNet})`);
});

// providentFireTaxRate was removed too: the Provident no longer has a FIRE-target haircut
// to scale (see test/provident-payout.test.js).
