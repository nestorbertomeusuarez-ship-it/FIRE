(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.NavlogCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const SAVINGS_BRACKETS = [
    { upTo: 6000, rate: 0.19 }, { upTo: 50000, rate: 0.21 }, { upTo: 200000, rate: 0.23 },
    { upTo: 300000, rate: 0.27 }, { upTo: Infinity, rate: 0.30 }
  ];
  // 2025 IRPF general scales. This is deliberately an individual, no-deductions
  // estimate: the caller supplies the taxable general base, not a full return.
  const GENERAL_STATE_BRACKETS = [
    { upTo: 12450, rate: 0.095 }, { upTo: 20200, rate: 0.12 }, { upTo: 35200, rate: 0.15 },
    { upTo: 60000, rate: 0.185 }, { upTo: 300000, rate: 0.225 }, { upTo: Infinity, rate: 0.245 }
  ];
  const GENERAL_REGIONAL_BRACKETS = {
    catalonia: [{ upTo: 12500, rate: 0.095 }, { upTo: 22000, rate: 0.125 }, { upTo: 33000, rate: 0.16 }, { upTo: 53000, rate: 0.19 }, { upTo: 90000, rate: 0.215 }, { upTo: 120000, rate: 0.235 }, { upTo: 175000, rate: 0.245 }, { upTo: Infinity, rate: 0.255 }],
    'valencian-community': [{ upTo: 12000, rate: 0.09 }, { upTo: 22000, rate: 0.12 }, { upTo: 32000, rate: 0.15 }, { upTo: 42000, rate: 0.175 }, { upTo: 52000, rate: 0.20 }, { upTo: 62000, rate: 0.225 }, { upTo: 72000, rate: 0.25 }, { upTo: 100000, rate: 0.265 }, { upTo: 150000, rate: 0.275 }, { upTo: 200000, rate: 0.285 }, { upTo: Infinity, rate: 0.295 }]
  };
  function progressiveTax(base, brackets) {
    let tax = 0, lower = 0;
    for (const bracket of brackets) { tax += Math.max(0, Math.min(Math.max(0, Number(base) || 0), bracket.upTo) - lower) * bracket.rate; lower = bracket.upTo; if (base <= bracket.upTo) break; }
    return tax;
  }
  function netMonthlyReturn(grossMonthlyReturn, annualFeePct) {
    const fee = Math.max(0, Number(annualFeePct) || 0) / 100;
    if (fee === 0) return grossMonthlyReturn;
    return (1 + grossMonthlyReturn) * Math.pow(1 - fee, 1 / 12) - 1;
  }
  function generalIncomeTax(base, region) {
    const regional = GENERAL_REGIONAL_BRACKETS[region];
    if (!regional) throw new RangeError('Unsupported IRPF region');
    return progressiveTax(base, GENERAL_STATE_BRACKETS) + progressiveTax(base, regional);
  }
  function netAfterGeneralIncomeTax(gross, ytdIncome, region) {
    const income = Math.max(0, Number(gross) || 0), ytd = Math.max(0, Number(ytdIncome) || 0);
    return income - (generalIncomeTax(ytd + income, region) - generalIncomeTax(ytd, region));
  }
  function grossForNetGeneralIncome(needNet, ytdIncome, region, maxGross) {
    if (needNet <= 0 || maxGross <= 0) return 0;
    let low = 0, high = maxGross;
    for (let i = 0; i < 60; i++) { const mid = (low + high) / 2; if (netAfterGeneralIncomeTax(mid, ytdIncome, region) >= needNet) high = mid; else low = mid; }
    return high;
  }
  // Single gate for every seed source (UI text, saved scenarios, sensitivity pairs).
  // Returns null (= random, not reproducible) for anything that is not an unsigned
  // 32-bit number; otherwise the truncated integer. Zero is a valid seed.
  function normalizeSeed(raw) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'string' && raw.trim() === '') return null;
    if (typeof raw !== 'number' && typeof raw !== 'string') return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 4294967295) return null;
    return Math.trunc(value);
  }
  // Seed for a derived run (sensitivity pair, stress test): always a valid uint32.
  function deriveSeed(baseSeed, offset) {
    const base = normalizeSeed(baseSeed);
    return ((base === null ? 20260921 : base) + (Number(offset) || 0)) >>> 0;
  }
  function seededRandom(seed) {
    // Preserve every unsigned 32-bit seed, including zero. Empty/non-numeric
    // values are not valid deterministic seeds and should be handled as random
    // upstream rather than silently aliased to a constant sequence.
    if (seed === '' || seed == null || !Number.isFinite(Number(seed))) throw new TypeError('Seed must be a finite number');
    let state = Number(seed) >>> 0;
    return function() { state += 0x6D2B79F5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  // Independent generator per (seed, path, stream). Path i therefore draws the same
  // numbers whatever the total path count is and whatever other paths consume, which
  // keeps paired comparisons (same seed, one parameter changed) on common random
  // numbers. The generator is sfc32 (128-bit state) whose four words are derived independently from the full triple:
  // a 32-bit state would make every stream a window on one 2^32 cycle, so different
  // paths could replay time-shifted copies of each other's shocks.
  // Self-contained so it can be embedded in the worker via toString().
  function pathRandom(seed, pathIndex, stream) {
    if (seed === '' || seed == null || !Number.isFinite(Number(seed))) throw new TypeError('Seed must be a finite number');
    const fmix32 = function(h) {
      h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
      return h >>> 0;
    };
    // Each of the four state words absorbs the FULL (seed, path, stream) triple through its own
    // chain of bijective steps (different start value and odd multipliers per word), so two distinct
    // triples collide on the whole 128-bit state only if all four independent chains collide.
    const seedWord = Number(seed) >>> 0, pathWord = pathIndex | 0, streamWord = stream | 0;
    const derive = function(start, m1, m2, m3) {
      let h = fmix32((start ^ Math.imul(seedWord, m1)) >>> 0);
      h = fmix32((h + 0x9e3779b9 + Math.imul(pathWord + 1, m2)) >>> 0);
      h = fmix32((h ^ Math.imul(streamWord + 1, m3)) >>> 0);
      return h;
    };
    let a = derive(0x243f6a88, 0x9e3779b1, 0x85ebca77, 0xc2b2ae3d);
    let b = derive(0x85a308d3, 0x27d4eb2f, 0x165667b1, 0xd3a2646d);
    let c = derive(0x13198a2e, 0x7feb352d, 0x846ca68b, 0xa136aaad);
    let d = derive(0x03707344, 0x2c1b3c6d, 0x297a2d39, 0x68e31da5);
    const next = function() {
      const t = (a + b + d) >>> 0;
      d = (d + 1) >>> 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) >>> 0;
      c = ((c << 21) | (c >>> 11)) >>> 0;
      c = (c + t) >>> 0;
      return t;
    };
    for (let i = 0; i < 15; i++) next(); // warm-up decorrelates similar seeds
    return function() { return next() / 4294967296; };
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
    // Mutually exclusive and exhaustive: voluntary + forced + licenseLoss + preFireRuin + noRetirement === pathsUsed.
    // voluntaryRuined is a subset of voluntary (ruin AFTER a voluntary FIRE), not a separate category.
    const counts = { voluntary: 0, voluntaryRuined: 0, forced: 0, licenseLoss: 0, preFireRuin: 0, noRetirement: 0 };
    for (let i = 0; i < pathsUsed; i++) {
      if (result.fireMonthAll[i] < 0) {
        if (result.ruined[i]) counts.preFireRuin++; else counts.noRetirement++;
        continue;
      }
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
    // A missing bound means "unbounded on that side" (Math.max(undefined, x) is NaN).
    const lower = Number.isFinite(min) ? min : -Infinity, upper = Number.isFinite(max) ? max : Infinity;
    // Clamp EACH endpoint into [lower,upper] independently (not just low up to
    // lower and high down to upper): if the whole raw interval sits below lower
    // (or above upper), a one-sided clamp would leave the other endpoint
    // outside the bound. Both endpoints collapsing to the same value is the
    // correct "already at the limit" outcome, not a bug.
    const low = Math.min(Math.max(lower, value - delta), upper);
    const high = Math.max(Math.min(upper, value + delta), lower);
    return { low, high, changed: low !== high };
  }
  function standardErrorProportion(p, n) { return n > 0 ? Math.sqrt(Math.max(0, p * (1 - p)) / n) : null; }
  // allowedKeys is either a list of names (legacy: every name is numeric, except `seed` and
  // `lumpSums`) or a map name -> 'number' | 'boolean' | 'seed' | 'lumpSums'.
  function parameterType(allowedKeys, key) {
    if (Array.isArray(allowedKeys)) return allowedKeys.includes(key) ? (key === 'seed' ? 'seed' : key === 'lumpSums' ? 'lumpSums' : 'number') : null;
    return allowedKeys && Object.prototype.hasOwnProperty.call(allowedKeys, key) ? allowedKeys[key] : null;
  }
  function validParameter(type, parameter) {
    switch (type) {
      case 'number': return Number.isFinite(parameter);
      case 'boolean': return typeof parameter === 'boolean';
      case 'seed': return parameter === null || (Number.isInteger(parameter) && normalizeSeed(parameter) === parameter);
      case 'lumpSums':
        try {
          if (typeof parameter === 'string') { if (parameter.length > 12000) return false; validateLumpSums(JSON.parse(parameter)); return true; }
          if (Array.isArray(parameter)) { validateLumpSums(parameter); return true; }
        } catch (_) { return false; }
        return false;
      default: return false;
    }
  }
  const SERIES_REQUIRED = ['year', 'p10', 'p50', 'p90'];
  const SERIES_OPTIONAL = ['p25', 'p75', 'idx', 'contrib50'];
  function validScenario(value, allowedKeys, colors) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const finiteSeries = Array.isArray(value.series) && value.series.length > 0 && value.series.length <= 100
      && value.series.every(point => point && typeof point === 'object' && SERIES_REQUIRED.every(key => Number.isFinite(point[key]))
        && SERIES_OPTIONAL.every(key => point[key] === undefined || Number.isFinite(point[key])));
    const paramsValid = value.params && typeof value.params === 'object' && !Array.isArray(value.params)
      && Object.entries(value.params).every(([key, parameter]) => key !== '__proto__' && validParameter(parameterType(allowedKeys, key), parameter));
    return typeof value.id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value.id)
      && typeof value.name === 'string' && value.name.length <= 60
      && colors.includes(value.color) && typeof value.visible === 'boolean'
      && Number.isFinite(value.target) && value.target >= 0 && Number.isFinite(value.successRate) && value.successRate >= 0 && value.successRate <= 1
      && typeof value.ageMed === 'string' && value.ageMed.length <= 16 && finiteSeries
      && paramsValid;
  }
  // Untrusted scenarios (localStorage, imported files) are never used as-is: the caller
  // gets a fresh object holding only whitelisted, validated fields.
  function sanitizeScenario(value) {
    const params = {};
    for (const [key, parameter] of Object.entries(value.params)) params[key] = Array.isArray(parameter) ? parameter.map(entry => ({ year: entry.year, month: entry.month, amount: entry.amount })) : parameter;
    return {
      id: value.id, name: value.name, color: value.color, visible: value.visible,
      target: value.target, successRate: value.successRate, ageMed: value.ageMed,
      series: value.series.map(point => {
        const copy = {};
        for (const key of SERIES_REQUIRED.concat(SERIES_OPTIONAL)) if (point[key] !== undefined) copy[key] = point[key];
        return copy;
      }),
      params
    };
  }
  function normalizeScenarios(raw, allowedKeys, colors, max = 4) {
    if (!Array.isArray(raw)) return [];
    const ids = new Set();
    // Legacy keys are migrated here so every caller (localStorage, file import, future paths) gets it.
    const migrated = raw.slice(0, 1000).map(item => item && typeof item === 'object' && !Array.isArray(item) && item.params && typeof item.params === 'object'
      ? { ...item, params: migrateLegacyParams(item.params) } : item);
    return migrated.filter(item => validScenario(item, allowedKeys, colors) && !ids.has(item.id) && ids.add(item.id)).slice(0, max).map(sanitizeScenario);
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
    if (Number.isFinite(currentAge) && currentAge < 18) throw new RangeError('Current age must be at least 18');
    if (![currentAge, endAge, startAge].every(Number.isFinite) || endAge > 110 || endAge <= currentAge || startAge < currentAge || startAge > endAge) throw new RangeError('Invalid horizon or age; horizon must be positive and no longer than 80 years');
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
  // Backward compatibility for scenarios saved before the standalone `nur` (nursery-per-child,
  // €/año, fixed calendar years) control was folded into the generic age-based child cost
  // (childAnnual/childStartAge/childEndAge). Drops the legacy key either way, so an unknown
  // `nur` never fails validScenario/import; when the scenario has no childAnnual of its own,
  // its value and the equivalent default ages are carried over instead of being silently lost.
  // UAE end-of-service gratuity (Federal Decree-Law 33/2021): 21 days of basic pay per year for
  // the first 5 years, 30 days per year after that, nothing under 1 year, capped at 2 years' pay.
  function gratuityDays(years) {
    if (!(years >= 1)) return 0;
    return Math.min(Math.min(years, 5) * 21 + Math.max(0, years - 5) * 30, 730);
  }
  // Emirates pays the end-of-service gratuity OR the Provident Scheme balance, whichever is
  // higher. The Provident balance is already in the portfolio, so only the shortfall is added.
  function endOfServiceTopUp({ years, basicAED, fx, provBalance, provOn }) {
    const gratuityEUR = gratuityDays(years) * (basicAED / 30) * fx;
    return provOn ? Math.max(0, gratuityEUR - provBalance) : gratuityEUR;
  }
  // Scenarios saved before `gratuityYears` was replaced by the automatic gratuity-vs-Provident
  // comparison: the key is dropped so it neither fails validation nor double-counts.
  // Also folds the removed life-expectancy control into the end age: it only took effect in
  // PRO mode, and then the simulation effectively ended at the lower of the two ages.
  const LEGACY_KEYS = ['gratuityYears', 'lifeExpOn', 'lifeExp'];
  function migrateLegacyParams(params) {
    const child = migrateLegacyChildParams(params);
    if (!child || typeof child !== 'object' || Array.isArray(child) || !LEGACY_KEYS.some(key => key in child)) return child;
    const migrated = {};
    for (const [key, value] of Object.entries(child)) if (!LEGACY_KEYS.includes(key)) migrated[key] = value;
    if (child.proMode === true && child.lifeExpOn === true && Number.isFinite(child.lifeExp) && Number.isFinite(child.horizonAge)) migrated.horizonAge = Math.min(child.horizonAge, child.lifeExp);
    return migrated;
  }
  function migrateLegacyChildParams(params) {
    if (!params || typeof params !== 'object' || Array.isArray(params) || !('nur' in params)) return params;
    const migrated = {};
    for (const [key, value] of Object.entries(params)) if (key !== 'nur') migrated[key] = value;
    if (!('childAnnual' in migrated)) { migrated.childAnnual = params.nur; migrated.childStartAge = 29; migrated.childEndAge = 32; }
    return migrated;
  }
  return { gratuityDays, endOfServiceTopUp, migrateLegacyParams, SAVINGS_BRACKETS, GENERAL_STATE_BRACKETS, GENERAL_REGIONAL_BRACKETS, normalizeSeed, deriveSeed, seededRandom, pathRandom, progressiveTax, netMonthlyReturn, generalIncomeTax, netAfterGeneralIncomeTax, grossForNetGeneralIncome, progressiveSavingsTax, netAfterSavingsTax, marginalSavingsTaxRate, providentFirst, beckhamApplies, grossForNetSavings, boundedPair, standardErrorProportion, historicalWithdrawalBacktest, retirementCohortCounts, wealthTaxBase, validScenario, normalizeScenarios, sameParameterSnapshot, canonicalParameterFingerprint, validateAllocation, validateHorizon, validateLumpSums, monthlyRetirementCashflow, exportScenarioJson, importScenarioJson, migrateLegacyChildParams };
});
