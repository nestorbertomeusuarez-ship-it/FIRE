# Navlog FIRE

Navlog FIRE is a browser-based Monte Carlo retirement-planning model. It is a
scenario exploration tool, not a financial, investment, tax, or legal adviser.

## Run locally

- Canonical entry point: `index.html` (loads `simulation-core.js`).
- Open `index.html` directly in a current browser, or serve this directory with
  any static HTTP server. No build step or package installation is required.
- Regression tests: each file under `test/` is a standalone `node --test` entry
  point (no shared fixtures across files). `node --test test/` runs the whole
  directory on Linux/macOS, but fails on Windows in this repo (Node resolves
  the bare directory as a module path, not a test glob), so on Windows run
  each file individually instead, e.g. from PowerShell:
  `Get-ChildItem test/*.test.js | ForEach-Object { node --test $_.FullName }`.
  Current files: `end-of-service.test.js`, `engine-audit-fixes.test.js`,
  `feature-audit.test.js`, `index-publico-sensitivity.test.js`,
  `index-sensitivity-bounds.test.js`, `input-validation.test.js`,
  `label-painting.test.js`, `lol-emirates.test.js`, `manual-calc.test.js`,
  `page-structure.test.js`, `param-unification.test.js`,
  `post-fix-regressions.test.js`, `remaining-audit-fixes.test.js`,
  `reproducibility.test.js`, `simulation-core.test.js`,
  `simulation-integration.test.js`, `simulation-jobs.test.js`,
  `slider-ranges.test.js`, `tax-accumulation.test.js`, `ui-behaviour.test.js`,
  `worker-parity.test.js`.

## Deploy

The project is static and can be hosted from the repository root with GitHub
Pages or another static host. Publish `index.html`, `simulation-core.js`, and
the referenced assets together. Do not publish from `index-publico.html`; that
file is retained as a historical comparison and is not the canonical app.

## Model assumptions and limitations

- The Monte Carlo model works in real euros and samples monthly returns from
  the configured means and volatilities. Historical-market mode bootstraps the
  annual S&amp;P 500 real-return series embedded in `index.html`.
- The starting liquid portfolio and new investable contributions are allocated across
  cash, bonds, and equities by the user-selected percentages. The model keeps that
  target allocation for new money; it does not model periodic selling-based rebalancing
  or asset-specific tax lots beyond its simplified gain-basis buckets. Configurable
  annual costs apply to cash, bonds, equities, BTC, gold, and the Provident balance;
  their median cumulative effect is included as `fee50` in the CSV projection rows.
- Tax modeling is intentionally approximate. The savings-income bracket values
  embedded in `simulation-core.js` are labeled in `index.html` as
  illustrative 2024/2025 assumptions (documentation reviewed 2026-09-21); they
  are not automatically updated and have not been independently verified here.
  Existing source comments attribute return-series inputs to Damodaran/NYU Stern
  and officialdata.org; these attributions were not independently audited in
  this work. The model does not implement complete
  Spanish tax law, regional rules, deductions, or personalized advice. Verify
  current rules with a qualified professional before making decisions.
- Historical returns are backward-looking, US-based, and do not predict future
  returns. The sequential backtest applies the configured equity cost, but excludes
  taxes and trading frictions.
- Monte Carlo results are sensitive to the user's assumptions, model structure,
  path count, and random seed. They are estimates, not guarantees.

## Features and data provenance

- Additional assumptions include an editable current age and end age. The end age is dynamically constrained to at most 80 years after the current age, never above 110; this maps the fixed September 2026 simulation start to the supported calendar through September 2106. Career start is constrained to that same window. Cash/bond/equity allocation, recurring retirement income, health costs, child costs, and dated one-off cash flows are user inputs, not forecasts.
- The outcome dashboard separates voluntary FIRE, post-FIRE ruin, forced retirement, loss of licence, and routes that do not retire in the selected horizon.
- Sliders/inputs no longer recalculate in real time: they only repaint labels and mark the result stale (visible notice + dimmed results). Press "Calcular" to run the full-precision simulation, with a precision selector ("Rápida" ~4s default, "Alta" ~12s, "Máxima" ~30s, or a custom 5-120s target) that trades wait time for more simulated paths. Reset and loading a saved scenario still recalculate immediately, as does the initial page load.
- Save up to four local scenarios. They can be exported/imported as validated JSON. A CSV report contains the current full-precision assumptions and percentile series; printing the page can be saved as PDF by the browser.
- Current embedded-data review date: 2026-09-21. Source attributions in the app are informational only. Before relying on any tax, pension, salary, healthcare, or market figure, replace it with a current, personally verified source.

## Privacy and saved scenarios

Simulation runs execute in the browser; the app has no backend account or
database. Compared scenarios are stored in this browser's `localStorage` and
remain on this device/browser profile until deleted or browser storage is
cleared. Do not use a shared browser profile for sensitive financial inputs.

## Disclaimer

This software is provided for educational and illustrative purposes only. It
does not provide investment, financial, tax, pension, or legal advice. No
projection or historical result guarantees future outcomes. Consult qualified
professionals and independently verify assumptions before acting.
