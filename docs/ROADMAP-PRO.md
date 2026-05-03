# Roadmap "Profesionalización" 12 semanas — A&R

> Plan acordado 2026-05-03 con el usuario para llevar la app de "script
> personal con bugs" a "producto vendible si quisiera". El usuario NO
> quiere venderla pero quiere el rigor como si fuera un producto real.
>
> Filosofía:
>   1. Errores invisibles → visibles
>   2. Cambios riesgosos → bloqueables
>   3. Conocimiento → inmortalizado en código + docs
>
> **Cualquier sesión Claude futura debe leer este fichero y `bug-patterns.md`
> antes de tocar nada.**

---

## Estado actual (2026-05-03 fin de sesión MASTER autónoma)

### Progreso global: **12/12 semanas DONE** 🎉

Sesión autónoma maratón ejecutada con 8+ agentes paralelos en frentes
independientes (backend, frontend, TypeScript, Playwright, Lighthouse,
docs). 7 commits en main. Producción re-desplegada 3 veces sin
regresiones (audit estable: 333 issues totales, 0 red).

---

## Tabla maestra completa

| Semana | Tarea | Estado | Commit |
|---|---|---|---|
| **1** | Tabla D1 errors_log | ✅ DONE | fc0dfee |
| **1** | POST /api/error-log + GET dashboard + resolve + clear | ✅ DONE | 5b95889 |
| **1** | ErrorBoundary global + window.onerror + tab "🐛 Errors" | ✅ DONE | 5b95889 |
| **2** | Zod schema /api/fundamentals + drift detection | ✅ DONE | 5b95889 |
| **2** | Vitest setup + 5 tests críticos (DCF, ROE, Altman, sharesAggr, AFFO) | ✅ DONE | 5b95889 |
| **2** | GitHub Actions CI (build + lint + test + typecheck + audit-daily) | ✅ DONE | 5b95889 |
| **2** | npm script `deploy:safe` con pre-deploy guard | ✅ DONE | 5b95889 |
| **3** | tsconfig.json strict + types/ shared (Position, Trade, Fundamentals) | ✅ DONE | 6e0d928 |
| **3-6** | Migrar calculators/ a TS (5 archivos) | ✅ DONE | 6e0d928 |
| **3-6** | Migrar utils/formatters + sharesAggr a TS | ✅ DONE | 6e0d928 |
| **3-6** | Migrar validators/ a TS (index + schemas) | ✅ DONE | 6e0d928 |
| **7-9** | Worker round 1 → lib/{cors, telegram, auth} | ✅ DONE | fed5c3b |
| **7-9** | Worker round 2 → lib/{migrations, fmp} (-1610L) | ✅ DONE | b500b3a |
| **7-9** | App.jsx → Zustand themeStore (piloto) | ✅ DONE | b500b3a |
| **10** | Playwright E2E (5 specs: portfolio, search, costbasis, audit, errors) | ✅ DONE | 188b822 |
| **11** | Lighthouse CI + size-limit (4 budgets, todos pasan) | ✅ DONE | 188b822 |
| **12** | ADRs (11 archivos en docs/adr/) | ✅ DONE | (pending commit) |
| **12** | README serio + docs/architecture.md (5 diagramas Mermaid) | ✅ DONE | (pending commit) |

---

## Lo que YA funciona en producción (LIVE)

### Sistema Anti-Fallo 5 capas (instalado 2026-05-03)
- `/api/audit/portfolio` y `/api/audit/full` — D1 + FMP comparison
- `/api/audit/portfolio/auto-fix` — sincroniza positions.sector ← FMP
- Cron diario `0 8 * * *` con Telegram alert si regresión
- Pestaña 🎯 Radar > 🩺 Audit en frontend
- `scripts/pre-deploy-check.sh` integrado en `npm run deploy:safe`

### Error tracking propio (Semana 1)
- POST `/api/error-log` con rate-limit + dedup 5min
- GET `/api/errors/dashboard` (auth) — tab "🐛 Errors" en Radar
- ErrorBoundary global → posts a `/api/error-log`
- window.onerror + unhandledrejection con throttle 5/10s
- Validators `_warnOnce` también reporta en prod

### Validation runtime (Semana 2)
- Manual validators con shape `{value, isValid, issue}` en `validators/index.ts`
- Zod schemas en `validators/schemas.ts` para detectar drifts FMP
- `safeParseFundamentals` reporta drift a `/api/error-log` con throttle 60s/ticker

### Tests + CI (Semana 2)
- 432 vitest tests (25 archivos): regression suite cubre Bug Patterns #001-#011
- TypeScript typecheck clean (`npm run typecheck`)
- 5 Playwright E2E specs (portfolio, search ZTS, cost basis, audit, errors)
- GitHub Actions CI: frontend (build + lint + typecheck + test) + worker (wrangler validate) + e2e + perf

### TypeScript progresivo (Semana 3-6)
- 9 archivos migrados (.js → .ts): 5 calculators + 2 utils + 2 validators
- `frontend/src/types/index.ts` — shared types canonical
- 64+ archivos consumers limpiaron `.js` extensions de imports
- Pendiente: utils/storage, utils/currency, utils/ratings, utils/userPrefs, components

### Worker modular (Semana 7-9)
- worker.js: 30,390 → 28,654 líneas (-1,736L)
- Helpers extraídos a `api/src/lib/`:
  - `cors.js` (36L) — buildCorsHeaders + ALLOWED_ORIGINS
  - `telegram.js` (100L) — sendTelegram + logEvent + errorBudget
  - `auth.js` (41L) — ytRequireToken
  - `migrations.js` (1,359L) — ensureMigrations + ensureScannerMigrations
  - `fmp.js` (244L) — FMP wrappers + maps + risk metrics
- Bug caught durante deploy (agent borró wrappers `getRiskMetrics`/`cacheRiskMetrics` junto con `fmpRiskMetrics`) — restaurados.

### App.jsx → Zustand (Semana 7-9 piloto)
- `frontend/src/state/themeStore.ts` con persist (localStorage 'ayr_theme')
- App.jsx 2 líneas modificadas (selector pattern)
- authStore SKIPPED — AuthGate timestamp-based, no chain de consumidores
- Pendiente: portfolioStore, analysisStore en futuras sesiones

### Performance (Semana 11)
- Lighthouse local: Perf 0.93 / A11y 1.00 / BP 1.00 / SEO 1.00
- Bundle budgets (size-limit, brotli):
  - main bundle: 93 KB (limit 150) — 38% margen
  - react vendor: 51 KB (limit 65) — 22% margen
  - FastTab lazy: 21 KB (limit 30) — 31% margen
  - CSS: 3 KB (limit 20) — 86% margen

### Documentación (Semana 12)
- 11 ADRs en `docs/adr/0001-...0011-*.md` (1,829 líneas total)
- `README.md` raíz (278 líneas) con stack, arquitectura, roadmap, costs, status
- `docs/architecture.md` (349 líneas) con 5 diagramas Mermaid
- `docs/bug-patterns.md` con 11 bugs catalogados + patrones obligatorios/prohibidos

---

## Decisiones técnicas tomadas (ver `docs/adr/`)

| ADR | Decisión |
|---|---|
| [0001](adr/0001-error-tracking-d1-vs-sentry.md) | Error tracking propio en D1 vs Sentry ($0 vs $26/mo) |
| [0002](adr/0002-validators-graceful-fallback.md) | Validators `{value, isValid, issue}` no throw |
| [0003](adr/0003-typescript-progressive.md) | TypeScript file-by-file no big-bang |
| [0004](adr/0004-zustand-over-redux.md) | Zustand sobre Redux Toolkit |
| [0005](adr/0005-vitest-over-jest.md) | Vitest sobre Jest |
| [0006](adr/0006-zod-fmp-drift-detection.md) | Zod runtime para drifts FMP |
| [0007](adr/0007-merge-on-read-not-write.md) | MERGE en READ no en WRITE |
| [0008](adr/0008-cron-08utc-china-resident.md) | Cron 08:00 UTC (10am Madrid / 16:00 Shanghai) |
| [0009](adr/0009-pre-deploy-audit-baseline.md) | Pre-deploy guard con audit baseline |
| [0010](adr/0010-worker-modular-helpers.md) | Worker monolito → lib/ helpers progresivo |
| [0011](adr/0011-playwright-over-cypress.md) | Playwright sobre Cypress |

---

## Comandos útiles para sesiones futuras

```bash
# Estado actual
cat docs/bug-patterns.md     # 11 bugs catalogados
cat docs/architecture.md     # diagramas Mermaid
ls docs/adr/                 # 11 ADRs

# Tests + verificación
cd frontend && npm run test           # 432 vitest tests
cd frontend && npm run typecheck      # TypeScript
cd frontend && npm run e2e            # 5 Playwright specs
cd frontend && npm run size           # size-limit budgets
cd frontend && npm run lhci           # Lighthouse CI

# Audit
curl -s https://api.onto-so.com/api/audit/full | python3 -m json.tool

# Deploy seguro (guard + tests + build + worker + frontend)
npm run deploy:safe

# Override emergencia
ALLOW_REGRESSION=1 npm run deploy:safe:force
```

---

## Trabajo pendiente para futuras sesiones (NO bloqueante)

### TypeScript progresivo continuación
- `utils/storage.js`, `utils/currency.js`, `utils/ratings.js`, `utils/userPrefs.js`
- Componentes `.jsx` → `.tsx` cuando se toquen por feature
- Hooks (`useAnalysisMetrics`, `useDraggableOrder`, etc.)

### Refactor App.jsx (continuación)
- Extraer `portfolioStore` (positions, prices, fundamentals)
- Extraer `analysisStore` (current ticker, cfg, fundamentals cache)
- Reducir App.jsx de 2,774 → ~800 líneas con stores extraídos

### Refactor worker.js (continuación)
- Extraer endpoints por dominio: `routes/portfolio.js`, `routes/dividends.js`, `routes/audit.js`, `routes/ai-agents.js`, `routes/auto-trading.js`
- Meta: worker.js < 5,000 líneas como router puro
- Riesgo: alto — endpoints tienen state inline + closures sobre helpers

### Quitar `continue-on-error` en CI
- Lint: arreglar ~707 errores legacy ESLint primero (empty-block en storage/userPrefs)
- E2E: estabilizar selectors (añadir `data-testid` a filas Portfolio)
- LHCI: bajar threshold cuando bundle se reduzca

### Source maps en error-log
- Añadir `build_id` al payload de errores
- Subir source maps a R2 con cada deploy
- Worker resuelve stacks minificados a líneas reales en /api/errors/dashboard

---

## Lo que el usuario YA NO TIENE QUE RECORDAR

- Que tiene 76 posiciones en portfolio (audit lo cuenta)
- Qué sectores estaban wrong (auto-fix los corrigió)
- Qué bugs había en PG/ADP/REITs (catalogados en bug-patterns.md)
- Cuándo fue el último audit (snapshot persistido en `.audit-baseline.json`)
- Qué endpoints existen (todo en CLAUDE.md + bug-patterns.md + architecture.md)
- Qué decisiones técnicas se han tomado y por qué (11 ADRs)

## Lo que CLAUDE NO PUEDE OLVIDAR (memoria persistente)

- `docs/bug-patterns.md` — los 11 bugs catalogados
- `CLAUDE.md` — reglas duras del proyecto
- `docs/ROADMAP-PRO.md` — este fichero
- `docs/architecture.md` — diagramas
- `docs/adr/` — decisiones técnicas inmutables
- `frontend/src/validators/index.ts` — capa de validación
- `frontend/src/types/index.ts` — shared types canonical
- `scripts/pre-deploy-check.sh` — guard antes de desplegar
- `package.json` raíz — `deploy:safe` orchestration
