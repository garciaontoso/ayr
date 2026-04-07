# Ideas FMP Global — Pipeline de mejoras

> Generado 2026-04-07. Lista viva — ampliar en cada sesión.
> Estado: BRAINSTORM. Nada implementado. No tocar código hasta merge de la rama paralela.

---

## Prioridad propuesta (impacto / esfuerzo)

| # | Idea | Impacto | Esfuerzo | Notas |
|---|------|---------|----------|-------|
| 1 | Pestaña Fondos / Smart Money (US + España) | 🔥🔥🔥 | M-L | Diseño v2 completo en `fondos-tab-design.md` — 18 fondos, sistema notificaciones 4 capas |
| 2 | Forward dividend yield real | 🔥🔥 | S | Reemplaza TTM por estimado próximos 4Q |
| 3 | Reemplazar FMP_MAP por endpoints internacionales nativos | 🔥🔥 | M | Elimina hack histórico, BME/HKG/LSE nativo |
| 4 | Price target consensus en CompanyRow | 🔥 | S | Badge ±% vs precio actual |
| 5 | Insider activity icon en Portfolio | 🔥 | S | 🟢 buy / 🔴 sell últimos 90d |
| 6 | Earnings Intelligence (pre + post) | 🔥🔥🔥 | M-L | Diseño completo en `earnings-intelligence-design.md` — two-track (auto + Opus selectivo), ~$10/mes |
| 7 | Dividend Safety Score 2.0 (FCF-based) | 🔥🔥🔥 | M | Diseño completo en `quality-safety-score-design.md` — combinado con Quality Score |
| 8 | Quality Score propio | 🔥🔥🔥 | M | Diseño completo en `quality-safety-score-design.md` — 6 componentes 0-100 |
| 9 | International Dividend Aristocrats universe | 🔥 | M | UK/Canada/Japan dividend kings |
| 10 | Sector relative valuation | 🔥 | S | Ticker P/E vs sector vs histórico |
| 11 | Currency exposure dashboard | 🔥 | M | % real USD/EUR/HKD/CNY por revenue geo |
| 12 | Tesis + Journal + Checklist módulo | 🔥🔥🔥 | L | Diseño completo en `proceso-module-design.md` v1 |
| 13 | Pestaña Senate/House Trading | 🔥🔥 | M | Integrado en `fondos-tab-design.md` como Sub-tab 7 + Fase 6 |
| 14 | Módulo Cartas de los Sabios | 🔥🔥🔥 | L | Diseño completo en `cartas-sabios-design.md` — 25 sources, Opus pipeline, ~$5/mes |
| 15 | Discovery Engine — Watchlist Intelligence | 🔥🔥🔥 | M | Diseño completo en `discovery-engine-design.md` — 13 sources, composite scoring, $0 LLM |
| 16 | News Agent — Filtered Pipeline | 🔥🔥 | M | Diseño completo en `news-agent-design.md` — Haiku classifier, ~$2/mes |
| 17 | Daily Briefing Agent ⭐ | 🔥🔥🔥🔥 | M | Diseño completo en `daily-briefing-agent-design.md` — sintetizador del sistema, ~$15/mes |
| 18 | Macro Calendar Layer | 🔥🔥 | S | Diseño completo en `macro-calendar-design.md` — eventos cruzados con tu exposición sectorial |
| 19 | Currency Exposure Dashboard | 🔥🔥 | S | Diseño completo en `currency-exposure-design.md` — exposición real por moneda via revenue geo |
| 20 | Reading List & Education Library | 🔥 | M | Diseño completo en `reading-list-design.md` — 50 esenciales curados, conexiones a tesis |
| — | **IMPLEMENTATION ROADMAP** | — | — | **`implementation-roadmap.md`** — orden óptimo en 9 fases, ~50 días total |

---

## Categorías

### A. Datos nuevos disponibles con FMP Global

**Cobertura internacional real**
- BME (España), HKG, LSE, TSE, Euronext nativos → adiós hack FMP_MAP
- DPS local + USD automático
- Dividend calendar real para foráneas

**Estimates & Analyst data**
- `/analyst-estimates` → EPS/Revenue forward 5y
- Price targets consensus (high/low/median) + nº analistas
- Upgrades/downgrades en tiempo real
- Surprise history (beat/miss últimos 8Q)

**Insider & Institutional**
- Form 4 insider trading
- 13F holdings (superinvestors)
- Institutional ownership % + cambios QoQ
- Senate trading disclosures

**Earnings transcripts**
- Transcripts completos por quarter
- Histórico 10+ años

**Macro & Calendar**
- FOMC, CPI, NFP fechas + consensus
- Treasury yields curve histórica
- Commodities (oil, gold, copper)

**ETF & Funds**
- ETF holdings, sector/country weightings, AUM, expense ratio
- Mutual fund holdings (Vanguard, Fidelity, etc.)
- Fund performance histórico

---

### B. Features nuevas en la app

**B1. Smart Money Tab** (ver `fondos-tab-design.md`)

**B2. Earnings Intelligence**
- Pre-earnings: estimate vs whisper, IV crush esperado, surprise histórico
- Post-earnings: Opus resume transcript (guidance, tone, Q&A risks)
- Alerta beat/miss > X std dev

**B3. Forward Yield real**
- DPS estimado próximos 4Q (no TTM)
- Yield forward más preciso para decisiones de entrada
- Columna nueva en Portfolio: "Fwd Yield"

**B4. Quality Score propio**
- Combinación: ROIC + FCF margin + debt/EBITDA + DGR 5y
- Ranking interno watchlist
- Score 0-100 visible en CompanyRow

**B5. Dividend Safety Score 2.0**
- Payout vs FCF (no earnings)
- Debt trends 5y
- FCF coverage ratio
- Históricos cuts del sector
- Score 0-100, traffic light

**B6. International Dividend Aristocrats**
- Universo expandido: UK, Canada, Japan dividend kings/aristocrats
- Filtros equivalentes a US (25y+ raises)
- Tab en watchlist

**B7. Sector relative valuation**
- P/E, EV/EBITDA del ticker vs media sectorial vs histórico propio
- Z-score "caro/barato vs sector"
- En CompanyRow: badge sector valuation

**B8. Currency exposure dashboard**
- % real de patrimonio en USD/EUR/HKD/CNY
- Hedge implícito por revenue geográfico (KO 60% non-US, etc.)
- Panel en Analytics

**B9. Módulo Proceso (Tesis + Journal + Checklist)**
- Tesis 3-líneas obligatoria por posición (por qué, qué te haría vender, target weight)
- Checklist criterios entrada (yield mín, payout máx, debt techo, sector cap)
- Journal de decisiones (compra/venta + razón) → aprender de errores
- D1 nuevo: `theses`, `journal_entries`, `entry_criteria`

---

### C. Agentes nuevos posibles

| Agente | Modelo | Frecuencia | Trigger |
|--------|--------|------------|---------|
| Smart Money | Haiku | Semanal post-13F | Nueva entrada/salida superinvestor en tus tickers |
| Analyst Revisions | Haiku | Diario | ≥2 analistas suben/bajan target en 7d |
| Insider Cluster | Haiku | Diario | ≥2 insiders compran en 30d |
| Transcript Summary | Opus | Post-earnings | Nuevo transcript disponible |
| 13F Tracker | No-LLM | Trimestral | Diff de superinvestors |
| Macro Calendar | No-LLM | Semanal | Eventos próximos 7d con impacto esperado |

---

### D. Quick wins (S effort, alto impacto inmediato)

1. Reemplazar FMP_MAP hack por endpoints internacionales nativos
2. Forward dividend yield columna en Portfolio
3. Price target consensus badge en cada CompanyRow
4. Insider activity icon en Portfolio
5. Earnings surprise streak en alertas

---

## Discusión 2026-04-07: Proceso > Información

**Diagnóstico**: el cuello de botella NO es información (ya hay 89 posiciones, 11 agentes, FMP Global, GuruFocus, IB live). Es **proceso**.

**Lo que falta para sentirse "gran inversor"**:
1. Tesis escrita 3-líneas por posición
2. Criterios de entrada/salida explícitos
3. Revisión concentración vs diversificación (89 posiciones, $15k media — ¿convicción real?)
4. Journal de decisiones

**Recomendación**: priorizar B9 (Módulo Proceso) por encima de features nuevas de datos. Los datos sin proceso son ruido.

---

## Notas de coste

- FMP Global plan: cubre todo lo anterior, sin queries premium adicionales
- 13F holdings cachean trimestralmente → 1 refresh/semana basta
- Earnings transcripts pesados → cachear post-call, no re-llamar
- Estimates: refresh diario 1x post-market

## Notas de riesgo

- **NO tocar `worker.js` ni `App.jsx`** mientras la otra pestaña esté activa
- Diseñar e investigar en `docs/` y `experiments/` (carpetas no tocadas por la rama paralela)
- Implementar todo de golpe cuando merge la otra rama, en orden de prioridad de la tabla
