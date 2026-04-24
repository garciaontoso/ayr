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

- [x] **T1. ETF empty-state** — DONE `1457fa1`. Banner azul + empty-states en Trends/Scorecard. Verificado con SCHD.

- [ ] **T2. Cross-ticker QA** — for each tab (Summary/Trends/Forecasting/Historical/Scorecard), load these tickers and verify no errors: DEO, KO, MO, JNJ, AAPL, HSBC, O (REIT), SCHD (ETF), BRK.B (no dividend). Document any console errors in OVERNIGHT_LOG.md.

- [x] **T3. Quarterly table broken?** — VERIFIED ok con PEP: 20 filas, headers correctos, trimestres 2022-2026 con eps_est/eps_act/surprise/beat.

- [x] **T4. Hover tooltip overflow** — VERIFIED ok en viewport 900px: tooltip se mantiene dentro del chart thanks al Math.min cap.

## P1 — Rendering & UX polish

- [x] **P1. Tooltip histórico vs proyectado label** — DONE `7b38499`. Tag 📊/🔮 + borde cambia de gold a cyan.

- [x] **P2. Tooltip delta vs current** — DONE `7b38499`. Fila "vs HOY: ±X%" verde/rojo.

- [x] **P3. Tooltip show trade markers** — DONE `2b83280`. Fila ▲/▼ N @$X agregado cuando hay trades en ±30d.

- [x] **P4. Loading skeleton** — DONE `dc5ccfd`. Placeholder pulsante 40+480px mientras carga.

- [x] **P5. Trends tab: tooltip on spark hover** — DONE `dc5ccfd`. Readout year+value + crosshair + dot ampliado.

- [x] **P6. Buy Zone pulsing border** — DONE `dc5ccfd`. Keyframes fastBuyPulse 1.8s cuando inBuyZone.

## P2 — New features (medium effort)

- [x] **N1. Compare mode** — DONE `c2f5057`. Input 'vs TICKER' → ghost polyline morado dashed, normalizado.

- [x] **N2. Target P/E personal** — DONE `ebd76a2`. Botón ⭐/☆ P/E personal, persist localStorage, pre-carga al montar ticker.

- [x] **N3. Backtest mini-widget** — DONE `eb505af`. Card sidebar con dropdown 5y/10y/15y/20y + divs acum + CAGR + total.

- [x] **N4. Export chart as PNG** — DONE `033578c`. Botón ⬇ PNG → canvas 2x retina + fondo crema + auto-download.

- [ ] **N5. Dark mode chart variant** — tab FAST actualmente forza light theme. Add a toggle that respects the user's ThemeContext (dark → #141726 bg, white lines, etc.).

## P3 — Backend features (higher effort)

- [x] **B1. Piotroski F-Score** — DONE `cb6cb72`. 9 tests binarios + card Scorecard tab con componentes breakdown.

- [x] **B2. Altman Z-Score** — DONE `cb6cb72`. Z-Score + rating safe/grey/distress + 5 componentes desglosados.

- [x] **B3. Shares outstanding series** — DONE `7fa6973`. Fetch income-statement, 5º sparkline hiIsBad (↓=buybacks bueno).

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
