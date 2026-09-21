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
    // Preserve every unsigned 32-bit seed, including zero. Empty/non-numeric
    // values are not valid deterministic seeds and should be handled as random
    // upstream rather than silently aliased to a constant sequence.
    if (seed === '' || seed == null || !Number.isFinite(Number(seed))) throw new TypeError('Seed must be a finite number');
    let state = Number(seed) >>> 0;
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
  function marginalSavingsTaxRate(gainFraction, ytdGain) {
    const fraction = Math.max(0, Math.min(1, Number(gainFraction) || 0));
    const base = Math.max(0, Number(ytdGain) || 0);
    const bracket = SAVINGS_BRACKETS.find(item => base < item.upTo) || SAVINGS_BRACKETS[SAVINGS_BRACKETS.length - 1];
    return bracket.rate * fraction * 100;
  }
  function historicalWithdrawalBacktest(realAnnualReturns, capital, annualSpend, years) {
    if (!Array.isArray(realAnnualReturns) || !Number.isFinite(capital) || !Number.isFinite(annualSpend) || !Number.isInteger(years) || years < 1) return [];
    const result = [];
    for (let start = 0; start + years <= realAnnualReturns.length; start++) {
      let balance = capital;
      for (let year = 0; year < years && balance > 0; year++) {
        const annualReturn = realAnnualReturns[start + year];
        if (!Number.isFinite(annualReturn) || annualReturn <= -1) { balance = 0; break; }
        const monthlyReturn = Math.pow(1 + annualReturn, 1 / 12) - 1;
        for (let month = 0; month < 12; month++) {
          balance = balance * (1 + monthlyReturn) - annualSpend / 12;
          if (balance <= 0) { balance = 0; break; }
        }
      }
      result.push({ startIndex: start, finalBalance: balance, ruined: balance <= 0 });
    }
    return result;
  }
  function retirementCohortCounts(result, pathsUsed) {
    const counts = { voluntary: 0, voluntaryRuined: 0, forced: 0, licenseLoss: 0 };
    for (let i = 0; i < pathsUsed; i++) {
      if (result.fireMonthAll[i] < 0) continue;
      if (result.licenseLossOut[i]) counts.licenseLoss++;
      else if (result.forcedOut[i]) counts.forced++;
      else {
        counts.voluntary++;
        if (result.ruined[i]) counts.voluntaryRuined++;
      }
    }
    return counts;
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
  function validScenario(value, allowedKeys, colors) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const finiteSeries = Array.isArray(value.series) && value.series.length > 0 && value.series.length <= 100 && value.series.every(point => point && Number.isFinite(point.year) && Number.isFinite(point.p50) && Number.isFinite(point.p10) && Number.isFinite(point.p90));
    const paramsValid = value.params && typeof value.params === 'object' && !Array.isArray(value.params)
      && Object.entries(value.params).every(([key, parameter]) => allowedKeys.includes(key)
        && (typeof parameter === 'boolean' || Number.isFinite(parameter) || (key === 'seed' && parameter === null)
          || (key === 'lumpSums' && typeof parameter === 'string' && parameter.length <= 12000 && (() => { try { validateLumpSums(JSON.parse(parameter)); return true; } catch (_) { return false; } })())));
    return typeof value.id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value.id)
      && typeof value.name === 'string' && value.name.length <= 60
      && colors.includes(value.color) && typeof value.visible === 'boolean'
      && Number.isFinite(value.target) && value.target >= 0 && Number.isFinite(value.successRate) && value.successRate >= 0 && value.successRate <= 1
      && typeof value.ageMed === 'string' && finiteSeries
      && paramsValid;
  }
  function normalizeScenarios(raw, allowedKeys, colors, max = 4) {
    if (!Array.isArray(raw)) return [];
    const ids = new Set();
    return raw.filter(item => validScenario(item, allowedKeys, colors) && !ids.has(item.id) && ids.add(item.id)).slice(0, max);
  }
  function sameParameterSnapshot(a, b) {
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
    try { return canonicalParameterFingerprint(a) === canonicalParameterFingerprint(b); } catch (_) { return false; }
  }
  // Parameter snapshots cross the DOM boundary on every run.  Schedules are
  // reconstructed from JSON there, so identity equality would make an unchanged
  // array look stale.  Stable value serialization deliberately sorts object keys
  // while preserving array order (payment order is meaningful to the user).
  function canonicalParameterFingerprint(value) {
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new TypeError('Parameters must be finite');
      return Object.is(value, -0) ? '0' : String(value);
    }
    if (Array.isArray(value)) return '[' + value.map(canonicalParameterFingerprint).join(',') + ']';
    if (typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalParameterFingerprint(value[key])).join(',') + '}';
    throw new TypeError('Unsupported parameter value');
  }
  function wealthTaxBase(liquidWealth, propertyValue, propertyOwned) {
    return Math.max(0, Number(liquidWealth) || 0) + (propertyOwned ? Math.max(0, Number(propertyValue) || 0) : 0);
  }
  function validateAllocation(allocation) {
    const keys = ['cash', 'bonds', 'equities'];
    if (!allocation || typeof allocation !== 'object' || Array.isArray(allocation)) throw new TypeError('Allocation must be an object');
    for (const key of keys) if (!Number.isFinite(allocation[key]) || allocation[key] < 0) throw new RangeError('Allocation values must be finite and nonnegative');
    if (Math.abs(keys.reduce((sum, key) => sum + allocation[key], 0) - 100) > 0.01) throw new RangeError('Allocation must total 100%');
    return { cash: allocation.cash, bonds: allocation.bonds, equities: allocation.equities };
  }
  function validateHorizon({ currentAge, endAge, startAge }) {
    if (![currentAge, endAge, startAge].every(Number.isFinite) || currentAge < 18 || endAge > 110 || endAge <= currentAge || startAge < currentAge || startAge > endAge) throw new RangeError('Invalid horizon or age; horizon must be positive and no longer than 80 years');
    const years = endAge - currentAge;
    if (years > 80) throw new RangeError('Invalid horizon or age; horizon must be positive and no longer than 80 years');
    return { currentAge, endAge, startAge, years };
  }
  function monthlyRetirementCashflow({ age, year, month, child, recurringIncome = [], healthcare = [], lumpSums = [] }) {
    if (![age, year, month].every(Number.isFinite) || month < 1 || month > 12) throw new RangeError('Invalid cash-flow date');
    const intervalApplies = item => age >= item.startAge && age < item.endAge;
    let monthly = 0;
    if (child && intervalApplies(child)) monthly -= child.monthlyCost;
    for (const item of recurringIncome) if (intervalApplies(item)) monthly += item.amount / 12;
    for (const item of healthcare) if (intervalApplies(item)) monthly -= item.amount / 12;
    for (const item of lumpSums) if (year === item.year && month === item.month) monthly += item.amount;
    return monthly;
  }
  function exportScenarioJson(scenarios) {
    if (!Array.isArray(scenarios) || scenarios.length > 4) throw new TypeError('Expected up to four scenarios');
    return JSON.stringify({ version: 1, scenarios });
  }
  function validateLumpSums(entries) {
    if (!Array.isArray(entries) || entries.length > 100) throw new RangeError('Use a list of at most 100 payments');
    return entries.map(entry => {
      if (!entry || typeof entry !== 'object' || !Number.isInteger(entry.year) || entry.year < 2026 || entry.year > 2106
        || !Number.isInteger(entry.month) || entry.month < 1 || entry.month > 12
        || !Number.isFinite(entry.amount) || Math.abs(entry.amount) > 10000000) throw new RangeError('Each payment needs a year (2026–2106), month (1–12), and amount within €10,000,000');
      return { year: entry.year, month: entry.month, amount: entry.amount };
    });
  }
  function importScenarioJson(text, allowedKeys, colors, max = 4) {
    if (typeof text !== 'string' || text.length > 2_000_000) return [];
    try {
      const parsed = JSON.parse(text);
      const scenarios = Array.isArray(parsed) ? parsed : parsed && parsed.version === 1 ? parsed.scenarios : null;
      return normalizeScenarios(scenarios, allowedKeys, colors, max);
    } catch (_) { return []; }
  }
  function providentFirst(providentRate, savingsBuckets, ytdGain) {
    const availableRates = (savingsBuckets || []).filter(bucket => bucket && bucket.balance > 0).map(bucket => {
      const gainFraction = Math.max(0, Math.min(1, 1 - bucket.basis / bucket.balance));
      return NavlogCore.marginalSavingsTaxRate(gainFraction, ytdGain);
    });
    return availableRates.length > 0 && providentRate < Math.min(...availableRates);
  }
  function beckhamApplies(active, residentMonth, currentMonth, years) {
    return Boolean(active && residentMonth >= 0 && currentMonth >= residentMonth && currentMonth - residentMonth < years * 12);
  }
  return { SAVINGS_BRACKETS, seededRandom, progressiveSavingsTax, netAfterSavingsTax, marginalSavingsTaxRate, providentFirst, beckhamApplies, grossForNetSavings, boundedPair, standardErrorProportion, historicalWithdrawalBacktest, retirementCohortCounts, wealthTaxBase, validScenario, normalizeScenarios, sameParameterSnapshot, canonicalParameterFingerprint, validateAllocation, validateHorizon, validateLumpSums, monthlyRetirementCashflow, exportScenarioJson, importScenarioJson };
});
