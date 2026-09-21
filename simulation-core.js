(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.NavlogCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const SAVINGS_BRACKETS = [
    { upTo: 6000, rate: 0.19 }, { upTo: 50000, rate: 0.21 }, { upTo: 200000, rate: 0.23 },
    { upTo: 300000, rate: 0.27 }, { upTo: Infinity, rate: 0.30 }
  ];
  function seededRandom(seed) {
    let state = (Number(seed) >>> 0) || 0x9e3779b9;
    return function() { state += 0x6D2B79F5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function progressiveSavingsTax(totalGain) {
    let tax = 0, lower = 0;
    for (const bracket of SAVINGS_BRACKETS) {
      const taxable = Math.max(0, Math.min(totalGain, bracket.upTo) - lower);
      tax += taxable * bracket.rate;
      lower = bracket.upTo;
      if (totalGain <= bracket.upTo) break;
    }
    return tax;
  }
  function netAfterSavingsTax(gross, gainFraction, ytdGain) {
    const gain = Math.max(0, gross * Math.max(0, Math.min(1, gainFraction)));
    return gross - (progressiveSavingsTax(ytdGain + gain) - progressiveSavingsTax(ytdGain));
  }
  function grossForNetSavings(needNet, gainFraction, ytdGain, maxGross) {
    if (needNet <= 0 || maxGross <= 0) return 0;
    let low = 0, high = maxGross;
    for (let i = 0; i < 60; i++) { const mid = (low + high) / 2; if (netAfterSavingsTax(mid, gainFraction, ytdGain) >= needNet) high = mid; else low = mid; }
    return high;
  }
  function boundedPair(value, delta, min, max) {
    const low = Math.max(min, value - delta), high = Math.min(max, value + delta);
    return { low, high, changed: low !== high };
  }
  function standardErrorProportion(p, n) { return n > 0 ? Math.sqrt(Math.max(0, p * (1 - p)) / n) : null; }
  return { SAVINGS_BRACKETS, seededRandom, progressiveSavingsTax, netAfterSavingsTax, grossForNetSavings, boundedPair, standardErrorProportion };
});