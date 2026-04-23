# FAST Tab + A&R overall — Improvements Backlog

Working file for overnight loop (2026-04-23 → 2026-04-24). Each iteration should:
1. Read this file
2. Pick the next `[ ]` task (top-down within priority)
3. Implement + commit + deploy if relevant
4. Mark `[x]` and add commit hash
5. Append to `OVERNIGHT_LOG.md`

If a task proves too large for 1 iteration, split into subtasks marked with `[SPLIT]`.

---

## P0 — Critical correctness / regressions

- [ ] **T1. ETF empty-state** — SCHD (ETF) returns empty ratios/estimates/fg_scores. FastTab renders but tabs like Trends/Forecasting/Scorecard show blank or broken content. Add empty-state messages per tab when ratios_by_year / estimates_by_year / fg_scores are empty. Point user to a different tab. Verify with SCHD.

- [ ] **T2. Cross-ticker QA** — for each tab (Summary/Trends/Forecasting/Historical/Scorecard), load these tickers and verify no errors: DEO, KO, MO, JNJ, AAPL, HSBC, O (REIT), SCHD (ETF), BRK.B (no dividend). Document any console errors in OVERNIGHT_LOG.md.

- [ ] **T3. Quarterly table broken?** — Historical tab has quarterly toggle but logic uses `earnings_scorecard.quarters`. Verify it renders with a ticker that has 20+ quarters (AAPL, KO). If empty, check why.

- [ ] **T4. Hover tooltip overflow** — on narrow viewports, tooltip goes off-screen. Already has `Math.min(hover.svgX + 12, W - PADR - 170)` but may fail. Test at viewport 800px.

## P1 — Rendering & UX polish

- [ ] **P1. Tooltip histórico vs proyectado label** — when hover is on a year >= lastHistY+1, tag it "🔮 Proyectado" in the tooltip header. Else "📊 Histórico". Makes clear what's real vs estimated.

- [ ] **P2. Tooltip delta vs current** — show "vs HOY: +X%" comparing that point's price to `cfg.price`. Useful for "¿cuánto ha subido desde ese punto?".

- [ ] **P3. Tooltip show trade markers** — if hover is near a user trade (within 30 days), show "Tu compra $X × Y shares" in tooltip.

- [ ] **P4. Loading skeleton** — instead of "Cargando histórico de precio…", show a pulsing skeleton of the chart area.

- [ ] **P5. Trends tab: tooltip on spark hover** — currently no hover state on sparklines. Add year+value readout on mouse move.

- [ ] **P6. Buy Zone pulsing border** — when `inBuyZone` is true, subtle pulsing animation on the badge (1.5s cycle). Alerta visual.

## P2 — New features (medium effort)

- [ ] **N1. Compare mode** — in the header, a "Comparar con…" dropdown that loads a second ticker's fair value line as ghost overlay (gray dashed). Useful for "KO vs PEP".

- [ ] **N2. Target P/E personal** — button "Guardar P/E" que persiste en localStorage key `fast-pe-${ticker}`. Next time opens ticker, pre-loads that P/E instead of default. Small "⭐" indicator when custom.

- [ ] **N3. Backtest mini-widget** — small card below Summary: "Si hubiste comprado hace X años → realizaría +Y%/año". Dropdown 5y/10y/15y. Compute from monthly_prices + dividends.

- [ ] **N4. Export chart as PNG** — button in header that serializes the SVG + rasterizes to PNG using a canvas. For sharing / presentation.

- [ ] **N5. Dark mode chart variant** — tab FAST actualmente forza light theme. Add a toggle that respects the user's ThemeContext (dark → #141726 bg, white lines, etc.).

## P3 — Backend features (higher effort)

- [ ] **B1. Piotroski F-Score** — add computation in worker.js fg-history endpoint. Requires balance + income + cash-flow statement (can fetch `/stable/balance-sheet-statement` + `/stable/cash-flow-statement` in parallel with existing). ~80 lines. Expose as `piotroski_score` (0-9) + component breakdown. Frontend: card in Scorecard tab.

- [ ] **B2. Altman Z-Score** — requires WC, retained earnings, EBIT, MV equity, sales, total assets. Derive from balance + income. Expose as `altman_z` (number) + rating (safe/grey/distress). ~40 lines. Frontend: card in Scorecard tab.

- [ ] **B3. Shares outstanding series** — currently not in fg-history. Fetch /stable/income-statement, extract `weightedAverageShsOut` per year. Expose as `shares_out_series`. Frontend: 5th sparkline in Trends.

- [ ] **B4. Beneish M-Score** — earnings manipulation indicator (8 variables). Complex (~120 lines). Expose as `beneish_m` + "likely manipulator" flag.

## P4 — Documentation / housekeeping

- [ ] **D1. Update CLAUDE.md** — document the new FAST tab features (tabs, sparklines, forecasting panel, smooth toggle).

- [ ] **D2. Update memory** — refresh `project_wave6_*.md` (or create `project_wave7_*.md`) summarizing the FAST tab overhaul.

- [ ] **D3. Add unit tests** — `frontend/src/utils/` has helpers. Write tests for the rolling-median EPS logic to prevent regressions.

- [ ] **D4. TypeScript types** — or at least JSDoc for the FastTab internal functions (SparkCard, ForecastingPanel, MetricRow).

## P5 — Other tabs (scope creep, only if P0-P3 done)

- [ ] **O1. Dividend calendar** — already exists? Verify the recent + upcoming dividends merge works correctly.

- [ ] **O2. Daily Briefing regression** — touched SmartMoney/News/Briefing in the big commit. Verify they still render correctly on prod.

- [ ] **O3. Smart Money overlap** — the `/api/funds/overlap` endpoint was added. Verify the UI consumes it and displays correctly.

---

## How to pick a task
1. Do P0 first, always.
2. Within a priority, top-down.
3. If a task requires > 1h, split: complete first subtask, mark `[SPLIT]`, move on.
4. After 3 consecutive failed iterations (deploy/tests broken), STOP and wait.

## Constraints
- Never push to origin without user. Local commits only.
- Deploy backend with `cd api && npx wrangler deploy` (always invalidate `price_cache` after if schema changed).
- Deploy frontend with `cd frontend && npm run build && npx wrangler pages deploy dist --project-name=ayr --branch=production --commit-dirty=true`.
- Verify in preview server (`preview_screenshot`) after UI changes.
- Each commit ends with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
