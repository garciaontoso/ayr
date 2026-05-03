# A&R — Personal Dividend Portfolio Tracker

App personal para gestión de cartera de dividendos, opciones cubiertas y
análisis fundamental. Built solo, run solo, hosted on Cloudflare ($0
infra/mes — los costes son las APIs de datos y de IA, no el hosting).

> Proyecto privado. No se vende y no se acepta contribuciones externas.
> Este README existe para que cualquier sesión Claude futura (o un yo del
> futuro con poco contexto) pueda orientarse rápido.

---

## Stack

- **Frontend**: Vite 8 + React 19 + TypeScript progresivo + Zustand 5 +
  Vitest + Playwright. Hosted en Cloudflare Pages en `ayr.onto-so.com`.
- **Backend**: Cloudflare Worker (`api/src/worker.js`, ~28.7k líneas, ES
  modules) + D1 SQLite + R2 (`ayr-earnings-archive`). 3 cron schedules
  activos (sync IB Flex, news refresh, data audit).
- **Data sources**: FMP Premium (USD $69/mo) + Yahoo Finance (free) +
  Interactive Brokers Flex Web Service + IB Gateway via NAS bridge
  (`ib.onto-so.com`) + Tastytrade NAS bridge (`ttapi.onto-so.com`) +
  GuruFocus Premium Plus (USD ~$108/mo).
- **AI**: Claude API (Opus + Haiku) para 11 agentes — earnings, dividend
  safety, risk, macro, insider flow, postmortem, Elite Desk personas, etc.
  Crons LLM en pausa desde 2026-04-19; ejecución on-demand.

---

## Architecture

Diagrama detallado en [docs/architecture.md](docs/architecture.md).

```
                          ┌──────────────────────────┐
                          │  ayr.onto-so.com         │  Cloudflare Pages
                          │  React 19 SPA (Vite)     │  ~150 KB initial JS
                          └────────────┬─────────────┘
                                       │ HTTPS + X-AYR-Auth
                                       ▼
                          ┌──────────────────────────┐
                          │  api.onto-so.com         │  Cloudflare Worker
                          │  worker.js (~28.7k L)    │  ES modules
                          │   ├── lib/cors.js        │
                          │   ├── lib/auth.js        │
                          │   ├── lib/telegram.js    │
                          │   ├── lib/migrations.js  │
                          │   ├── lib/fmp.js         │
                          │   ├── lib/agents/        │
                          │   ├── lib/research-agent │
                          │   ├── lib/ticker-memory  │
                          │   └── ~73 endpoints      │
                          └─┬────────┬─────────┬─────┘
                            │        │         │
                            ▼        ▼         ▼
                       ┌────────┐ ┌─────┐ ┌──────────┐
                       │   D1   │ │ R2  │ │  FMP /   │
                       │ ~30    │ │earn-│ │ Yahoo /  │
                       │ tables │ │ ings│ │ Claude   │
                       └────────┘ └─────┘ └──────────┘

         Off-cloud:  NAS Synology DS423+ corre ib-gateway + bridges
                     `ib.onto-so.com` (IBKR live) + `ttapi.onto-so.com`
                     (Tastytrade), expuestos vía Cloudflare Tunnel.
```

---

## Quick start

```bash
git clone https://github.com/garciaontoso/ayr.git
cd ayr
npm install                    # root scripts solamente

cd frontend && npm install
npm run dev                    # http://localhost:5173
```

Variables que el frontend espera en `frontend/.env.local`:

- `VITE_AYR_TOKEN` — token compartido con `AYR_WORKER_TOKEN` del Worker
  (auth gate de los endpoints sensibles).

El Worker NO se corre en local; las llamadas en `dev` apuntan a
`api.onto-so.com` directamente. Para deploy ver [Deploy](#deploy).

---

## Project layout

```
AyR/
├── api/                       # Cloudflare Worker
│   ├── src/
│   │   ├── worker.js          # ~28.7k L, ~73 endpoints
│   │   ├── lib/               # cors, auth, telegram, fmp, migrations,
│   │   │                      # agents/, research-agent, ticker-memory
│   │   └── data/              # JSON helpers
│   └── wrangler.toml          # 1 D1 binding + 1 R2 + 3 crons
│
├── frontend/                  # Vite + React 19 SPA
│   ├── src/
│   │   ├── App.jsx            # 2,774 L (siendo desmontado a stores)
│   │   ├── main.jsx           # auth fetch monkey-patch
│   │   ├── AuthGate.jsx
│   │   ├── components/
│   │   │   ├── views/HomeView.jsx
│   │   │   ├── home/          # ~30 tabs principales
│   │   │   ├── analysis/      # ~30 tabs de análisis por ticker
│   │   │   └── ui/
│   │   ├── context/           # AnalysisContext, HomeContext, CostBasisContext
│   │   ├── hooks/             # useAnalysisMetrics, useFireMetrics, …
│   │   ├── state/             # themeStore.ts (Zustand)
│   │   ├── calculators/       # altmanZ, piotroski, wacc,
│   │   │                      # dividendAnalysis, growthRate (TypeScript)
│   │   ├── validators/        # index.ts + schemas.ts (Zod)
│   │   ├── utils/             # formatters.ts, sharesAggr.ts, …
│   │   ├── types/             # index.ts (Position, Trade, …)
│   │   └── api/               # data.js, fmp.js
│   ├── e2e/                   # 5 specs Playwright
│   ├── tests/                 # regression suite (calculators + utils)
│   ├── PERF.md                # bundle budgets + Lighthouse
│   └── package.json           # size-limit array vive aquí
│
├── docs/
│   ├── architecture.md        # diagramas detallados (Mermaid)
│   ├── ROADMAP-PRO.md         # plan 12 semanas
│   ├── bug-patterns.md        # 11 bugs recurrentes catalogados
│   ├── adr/                   # Architecture Decision Records
│   └── …
│
├── scripts/
│   ├── pre-deploy-check.sh    # audit guard (DELTA_RED > 0 → block)
│   ├── sync-flex.sh           # cron Mac (legacy; Worker cron lo sustituye)
│   └── …
│
├── nas-deploy/                # docker-compose para ib-stack en NAS
├── ib-bridge/                 # Express bridge IBKR (corre en NAS)
├── tastytrade-bridge/         # bridge Tastytrade (corre en NAS)
├── data/flex-csvs/            # CSVs IB Flex permanentes (4 cuentas, 2021-2026)
├── CLAUDE.md                  # reglas duras + historial v3 → v4.5
├── AGENTS.md                  # docs de los 11 agentes IA
└── package.json               # scripts: test, audit, deploy:safe, smoke
```

---

## Roadmap profesionalización

Plan 12 semanas — fuente de verdad: [docs/ROADMAP-PRO.md](docs/ROADMAP-PRO.md).

| Semana | Tema | Estado |
|---|---|---|
| 1-2 | Visibilidad + gates (errors_log, Zod, Vitest, CI básico) | ✅ DONE |
| 3-6 | TypeScript progresivo (calculators, utils, validators, types) | ✅ DONE |
| 7-9 | Refactor monolitos (worker.js, App.jsx) | 🚧 IN PROGRESS |
| 10 | Playwright E2E (5 flujos críticos) | ✅ DONE |
| 11 | Lighthouse CI + bundle size budget | ✅ DONE |
| 12 | ADR + README + diagrama de arquitectura | ✅ DONE |

Estado real al cierre 2026-05-03:

- 432 vitest tests passing (25 archivos).
- 5 specs Playwright en `frontend/e2e/`.
- 0 issues 🔴 / 333 🟡 en `/api/audit/full` (baseline preservado).
- `worker.js` 28,691 líneas. Helpers extraídos: `cors`, `auth`,
  `telegram`, `migrations`, `fmp`, `agents/`, `research-agent`,
  `ticker-memory`. Aún monolito en cuanto a routing.
- `App.jsx` 2,774 líneas. `state/themeStore.ts` (Zustand) live como piloto;
  el resto de stores aún pendiente.
- 11 ADRs indexados en [docs/adr/README.md](docs/adr/README.md). Los
  ficheros individuales `0001-…0011-*.md` están listados en el índice
  pero todavía hay que materializarlos (TODO de Semana 12).

---

## Documentation

- [Architecture diagram](docs/architecture.md) — flujo de datos, mapa de
  módulos frontend, rutas del worker, crons, reglas de integridad.
- [Bug patterns catalog](docs/bug-patterns.md) — 11 bugs recurrentes con
  causa raíz + fix + prevención. **Léelo antes de tocar nada.**
- [ADRs](docs/adr/) — Architecture Decision Records.
- [Roadmap](docs/ROADMAP-PRO.md) — plan 12 semanas, qué está hecho y qué no.
- [CLAUDE.md](CLAUDE.md) — reglas duras del proyecto + historial v3 → v4.5.
- [AGENTS.md](AGENTS.md) — docs de los 11 agentes IA.
- [Performance](frontend/PERF.md) — bundle budgets + Lighthouse.

---

## Testing

```bash
npm run test                   # vitest (432 tests, 25 files)
cd frontend && npm run typecheck      # tsc --noEmit
cd frontend && npm run e2e            # Playwright (5 specs vs dev server)
cd frontend && npm run size           # size-limit budget
cd frontend && npm run lhci           # Lighthouse CI
```

GitHub Actions corre los gates en cada PR; branch protection requiere
verde para mergear a `main`.

Pirámide de tests:

```
            ▲
            |  E2E Playwright (5 specs)         ← UI flows críticos
            |
            |  Integration / regression (vitest)
            |  ─ calculators (DCF, ROE, Altman, Piotroski, WACC, AFFO)
            |  ─ utils (formatters, sharesAggr)
            |  ─ validators (Zod + manual)
            |  ─ api shape, constants, tabs structure
            |
            |  Unit (sin boundary)
            ▼
```

---

## Deploy

```bash
npm run deploy:safe            # audit guard + tests + build + worker + frontend
# Si necesitas saltarte la regresión (riesgo asumido):
npm run deploy:safe:force      # ALLOW_REGRESSION=1 internamente
```

Pre-deploy guard (`scripts/pre-deploy-check.sh`):

1. Llama `/api/audit/full` y compara con `.audit-baseline.json`.
2. Si `red_count > baseline.red` → BLOCK deploy.
3. Solo entonces: tests + build + `wrangler deploy` (worker) +
   `wrangler pages deploy dist` (frontend).

Smoke test rápido post-deploy:

```bash
npm run smoke                  # HEAD a frontend + /api/audit/full
```

Worker se despliega solo (`npm run deploy:worker`) o frontend solo
(`npm run deploy:frontend`) si solo cambia uno.

---

## Costs

| Item | Mensual (USD) |
|---|---|
| Cloudflare Workers + Pages + D1 + R2 | $0 (free tier) |
| FMP Premium | $69 |
| GuruFocus Premium Plus | ~$108 ($1,299/yr prorrateado) |
| Claude API (on-demand desde 2026-04-19) | variable, hist. ~$30-45 |
| Telegram Bot, Cloudflare Tunnel | $0 |
| NAS Synology DS423+ | one-shot hardware (no recurrente) |
| **Total recurrente** | **~$200-225 / mes** |

---

## Status (2026-05-03)

- 432 vitest tests passing.
- 5 Playwright E2E specs en `frontend/e2e/`.
- 0 🔴 / 333 🟡 en `/api/audit/full` (matches `.audit-baseline.json`).
- Worker: 28,691 líneas (`api/src/worker.js`). Helpers en `api/src/lib/`.
- App.jsx: 2,774 líneas. Zustand `themeStore.ts` activo.
- 11 ADRs indexados en `docs/adr/README.md` (ficheros pendientes materializar).
- Lighthouse local + size budget activos en `frontend/PERF.md`.
- 4 cuentas IBKR vía Flex + IB Gateway live, NAV ~$1.38M reconciliado.

---

## License

Personal use only. No license granted to redistribute or fork.
