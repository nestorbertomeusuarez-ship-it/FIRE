# Navlog FIRE

Navlog FIRE is a browser-based Monte Carlo retirement-planning model. It is a
scenario exploration tool, not a financial, investment, tax, or legal adviser.

## Run locally

- Canonical entry point: `index.html` (loads `simulation-core.js`).
- Open `index.html` directly in a current browser, or serve this directory with
  any static HTTP server. No build step or package installation is required.
- Regression tests: `node --test test/post-fix-regressions.test.js test/simulation-core.test.js test/simulation-integration.test.js`.

## Deploy

The project is static and can be hosted from the repository root with GitHub
Pages or another static host. Publish `index.html`, `simulation-core.js`, and
the referenced assets together. Do not publish from `index-publico.html`; that
file is retained as a historical comparison and is not the canonical app.

## Model assumptions and limitations

- The Monte Carlo model works in real euros and samples monthly returns from
  the configured means and volatilities. Historical-market mode bootstraps the
  annual S&amp;P 500 real-return series embedded in `index.html`.
- “Renta variable inicial” is modeled as 100% equity. There is no separate
  cash allocation, bond allocation, or rebalancing strategy for that balance.
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
  returns. The sequential backtest excludes taxes, fees, and trading frictions.
- Monte Carlo results are sensitive to the user's assumptions, model structure,
  path count, and random seed. They are estimates, not guarantees.

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
