# Navlog FIRE

Navlog FIRE is a browser-based Monte Carlo retirement-planning model. It is a
scenario exploration tool, not a financial, investment, tax, or legal adviser.

## Run locally

- Canonical entry point: `index.html` (loads `simulation-core.js`).
- Open `index.html` directly in a current browser, or serve this directory with
  any static HTTP server. No build step or package installation is required.
- Regression tests: every `test/*.test.js` file is a standalone `node --test`
  entry point (shared helpers live in `test/helpers/` and are not tests).
  Run them all with `node --test test/*.test.js` (this is what CI runs on
  Linux). On Windows PowerShell, run each file individually:
  `Get-ChildItem test/*.test.js | ForEach-Object { node --test $_.FullName }`.

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
  annual costs apply to cash, bonds, equities, BTC, gold, and the Provident balance
  while still employed at Emirates (the Provident fee stops applying once it is paid
  out and invested at exit, see below); their median cumulative effect is included as
  `fee50` in the CSV projection rows.
- Tax modeling is intentionally approximate. Wealth tax is the larger of the regional tax (flat average rate after the regional bonus) and the state solidarity tax on large fortunes (ITSGF: 700 k€ exemption, 0 % on the first 3 M€ of base, then 1.7 / 2.1 / 3.5 %). The 60 % joint IRPF/wealth-tax limit (Ley 19/1991 art. 31, extended to the ITSGF by Ley 38/2022 art. 3) is modeled: each of the regional wealth tax and the state solidarity tax is capped so that it plus the IRPF actually charged that year (realized capital gains only — the Provident is a cash lump sum received while still a UAE resident, never Spanish income) never exceeds 60 % of the IRPF taxable base, with the wealth-tax cuota reduction itself capped at 80 % (so at least 20 % of it is always paid). As a conservative simplification, the law excludes gains on assets held over a year from that base; this model has no per-lot holding-period tracking, so every realized gain counts regardless of how long it was held, which makes the limit bind less than it should (a possible overstatement of wealth tax paid). The savings-income bracket values
  embedded in `simulation-core.js` are labeled in `index.html` as
  illustrative 2024/2025 assumptions (documentation reviewed 2026-09-21); they
  are not automatically updated and have not been independently verified here.
  Spanish law does not index
  any of these nominal thresholds (IRPF savings brackets, the wealth-tax
  exemption, and the solidarity-tax exemption/brackets) to inflation, so their
  real value erodes every year; the `taxThresholdDrift` control (default 2 %/año,
  configurable 0–5 %) models that erosion by shrinking every threshold in real
  terms at a compounding annual rate, applied at the point each tax is computed
  (0 % reproduces the previous assumption that thresholds are fully indexed to
  inflation).
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
- The default withdrawal plan is Guyton-Klinger with Prime Harvesting: on the default household it lowered post-FIRE ruin from about 19.5 % (fixed SWR) to about 1.6 %, at the cost of spending cuts in bad years (in 1 of 10 simulations the discretionary spend drops to about 43 % at some point). Only the retirement spend adjusts; healthcare, children and the mortgage are always paid in full.
- The FIRE target funds every known post-retirement outflow: (retirement spend + healthcare) ÷ SWR (default 3 %), plus the child costs (post-Emirates age bands and school) and mortgage payments still due from that month to the horizon, undiscounted in real euros. The reported target (chart line, CSV) is the one at the start of the simulation, the most demanding.
- With Spanish taxation on, `preRepatStepUp` (default on) resets the cost basis of cash, bonds, equities, gold and BTC to market value when Spanish tax residency starts, modelling a sale and repurchase while still a UAE resident; Spain-located real estate is excluded. In practice the sale must happen in the calendar year before the move, since Spain has no split-year residency.
- Profit sharing is paid in May: paying and non-paying years follow a two-state Markov chain (long-run skip share and persistence), and each year's draw is tied to the airline's April-March fiscal-year equity return through a Gaussian copula (`profitShareMarketCorr`, default 50 %, an estimate), so skipped years cluster after bad market years without changing their long-run share.
- With the random AED→EUR rate enabled, the contract's Exchange Rate Protection applies while working at Emirates (toggle `erpOn`, on by default): when the month's rate is below the threshold (the rolling five-year average, reset every January, with pre-simulation months assumed at the base rate), Emirates pays the shortfall on 50 % of basic pay, for a move of up to 15 % of the threshold. With a fixed rate it has no effect.
- Leaving Emirates (voluntary FIRE, mandatory exit, or Loss of Licence) follows the contract's end-of-service table: you always keep your own 5 % Provident contributions, plus the higher of the end-of-service gratuity and the vested company contributions. The company part vests by length of service: nothing under 3 years (gratuity only, and no gratuity under 1 year), 75 % from 3 to 5 years, 100 % from 5 years. The model tracks the member part separately so the unvested company money is removed at exit and the FIRE target check uses the post-settlement value. Per the contract (Candidate Information - Pilots, 6.0: "Members receive a cash lump sum upon leaving service"), the remaining vested Provident balance is then paid out in cash — while still a UAE resident, so Spain never taxes it as income — and invested that same month across cash/bonds/equities using the configured allocation, same as any other surplus cash; from then on it is ordinary invested money like the rest of the portfolio.
- Child costs are modeled per child (0-3 configurable), each with its own birth year/month, instead of a single flat "annual cost, valid between two ages" control. Each child's monthly cost is age-banded in real EUR: 0-2 years (before school, when nursery applies), 3-17 years (school fees are separate), 18-22 years (an own estimate for university tuition plus living costs, not sourced from the study below), and nothing from age 23. The 0-2 and 3-17 defaults come from Save the Children's "El coste de la crianza en España" (2026 update; national average ≈758 €/month, ≈609 €/month for ages 0-3, ≈692-812 €/month for ages 4-17); the 0-2 default additionally substitutes the study's near-full-time nursery assumption with a part-time (2-3 days/week) Dubai nursery estimate derived from a Numbeo full-day private-preschool price (Sep-2026 snapshot, 1,738 data points). A separate school-fee slider (Numbeo Valencia international-primary-school price, Sep-2026 snapshot) applies for ages 3-17 only in months the household is NOT working at Emirates (Emirates pays schooling from age 4 to the 19th birthday while employed); a per-child FS1 slider covers the age-3 school year specifically while still working at Emirates, since that year falls outside Emirates' own age-4-to-19 education allowance. An Emirates per-child medical-insurance-premium slider (AED/year, converted at the model's FX rate) applies only while working at Emirates and before the child's 19th birthday. Healthcare cost (a single family-wide annual figure) starts the month the household stops working at Emirates — a voluntary FIRE, a Loss-of-License exit, mandatory retirement, or the barista/partial-FIRE phase all count — not at a configured age, since Emirates' own medical cover applies while employed.
- The outcome dashboard separates FIRE voluntario (including its post-FIRE ruin sub-rate, i.e. paths that reached the target but later went broke), salida forzosa (forced retirement at the mandatory age), pérdida de licencia, and two routes that "nunca llega al FIRE": one that ends the horizon still in deuda (pre-FIRE debt never repaid), and one with no retirement in the selected horizon and no debt.
- Every advanced section (Spanish taxation, Loss-of-License risk, stochastic inflation/FX, withdrawal strategy, additional assets/glide path, and partial FIRE) is always visible and always active through its own toggle; there is no separate all-or-nothing advanced-mode switch anymore. Spanish taxation (IRPF on portfolio withdrawals, the Burriana sale tax, wealth/solidarity tax, and Ley Beckham — never the Provident, which is a cash payout received while still a UAE resident) is additionally gated behind a single "Aplicar fiscalidad española" switch, off by default, so the simulation focuses on the FIRE concept unless you opt into modeling a return to Spanish tax residency. Portfolio costs (TER for cash, bonds, equities, BTC, gold, and the Provident balance while still employed at Emirates) always apply, with their own group.
- The app offers six mutually exclusive withdrawal strategies (SWR fijo, Guyton-Klinger, go-go/slow-go/no-go phases, VPW/Bogleheads, floor & ceiling/Bengen, and Yield Shield), plus an independent Prime Harvesting toggle that can combine with any of them and applies the same way whether retirement is voluntary, mandatory, or a Loss-of-License forced exit.
- Sliders/inputs no longer recalculate in real time: they only repaint labels and mark the result stale (visible notice + dimmed results). Press "Calcular" to run the full-precision simulation, with a precision selector ("Rápida" ~4s default, "Alta" ~12s, "Máxima" ~30s, or a custom 5-120s target) that trades wait time for more simulated paths. Reset and loading a saved scenario still recalculate immediately, as does the initial page load.
- The yearly percentile series (chart, CSV, Hitos table) always includes the run's own final month as its last point, even when that month is not December (an integer-age horizon starting in September rarely lands there); wealth tax, the glide-path rebalance, and the Prime Harvesting sweep also apply in that final partial year when active.
- "Calcular sensibilidad" shows live progress ("Calculando… X de N simulaciones") as each parameter's paired low/high run finishes, instead of a static message for the ~30-60s the full sweep can take.
- Save up to four local scenarios. They can be exported/imported as validated JSON. A CSV report contains the current full-precision assumptions and percentile series; printing the page can be saved as PDF by the browser (the interactive parameters section is hidden in the printed/PDF output in favor of the printed assumptions summary).
- Current embedded-data review date: 2026-09-21. Source attributions in the app are informational only. Before relying on any tax, pension, salary, healthcare, or market figure, replace it with a current, personally verified source.

## Privacy and saved scenarios

Simulation runs execute in the browser; the app has no backend account or
database. Compared scenarios are stored in this browser's `localStorage` and
remain on this device/browser profile until deleted or browser storage is
cleared. Do not use a shared browser profile for sensitive financial inputs.
Scenarios saved by a version of the app prior to the removal of the old
all-or-nothing advanced-mode switch are incompatible and discarded
automatically (the storage key was bumped, and the old key is cleared) — save
new scenarios after updating.

## Disclaimer

This software is provided for educational and illustrative purposes only. It
does not provide investment, financial, tax, pension, or legal advice. No
projection or historical result guarantees future outcomes. Consult qualified
professionals and independently verify assumptions before acting.
