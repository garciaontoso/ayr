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

## Estado actual (2026-05-03 fin de sesión)

### Lo que YA funciona ✅
- Sistema Anti-Fallo 5 capas:
  - `/api/audit/portfolio` y `/api/audit/full` (D1 + FMP comparison)
  - `/api/audit/portfolio/auto-fix` (sincroniza positions.sector ← FMP)
  - Cron diario `0 8 * * *` con Telegram alert si regresión
  - Pestaña 🎯 Radar > 🩺 Audit en frontend
  - `scripts/pre-deploy-check.sh` (no integrado aún en flujo)
- 11 bugs catalogados en `docs/bug-patterns.md` con fix + prevención
- Validators stub en `frontend/src/validators/index.js` (existe pero no
  está cableado en componentes todavía)
- Tabla D1 `errors_log` creada (esquema listo, falta endpoint POST + ErrorBoundary)

### Lo que está EN CURSO 🚧
- **Semana 1**: Error tracking propio
  - ✅ Tabla D1 `errors_log` creada
  - ⏳ Endpoint `POST /api/error-log` para recibir errores del frontend
  - ⏳ ErrorBoundary global en App.jsx
  - ⏳ window.onerror handler
  - ⏳ Dashboard `/api/errors/dashboard` o pestaña en frontend

---

## Plan completo 12 semanas

### Semana 1-2 — Visibilidad + Gates ⚡

| # | Tarea | Estado | Beneficio |
|---|---|---|---|
| 1.1 | Tabla D1 errors_log | ✅ DONE | Esquema para tracking |
| 1.2 | POST /api/error-log endpoint | ⏳ TODO | Recibe stacks del frontend |
| 1.3 | ErrorBoundary global + window.onerror | ⏳ TODO | Captura todo error JS |
| 1.4 | Dashboard de errores en /audit | ⏳ TODO | Ver lista, marcar resolved |
| 2.1 | Zod schema `/api/fundamentals` | ⏳ TODO | Schema drift FMP catched |
| 2.2 | Vitest setup + 5 tests críticos | ⏳ TODO | DCF, ROE, Altman, sharesAggr, AFFO |
| 2.3 | GitHub Actions CI básico | ⏳ TODO | Block PR si tests/build falla |
| 2.4 | npm scripts: `deploy:safe` con pre-deploy guard | ⏳ TODO | scripts/pre-deploy-check.sh activo |

### Semana 3-6 — TypeScript progresivo

- Setup `tsconfig.json` con strict:true desde día 1
- Renombrar `*.jsx` → `*.tsx` archivo a archivo CUANDO se toque por feature
- Empezar por: `validators/`, `calculators/`, `utils/formatters.js`
- Tipar todas las shapes que vienen del worker (Position, Trade, Fundamentals)
- Tipar el AnalysisContext + HomeContext

### Semana 7-9 — Refactor monolitos

- `App.jsx` (2500L) → partir en:
  - `App.tsx` (root + routing)
  - `state/portfolioStore.ts` (Zustand)
  - `state/analysisStore.ts`
  - `state/authStore.ts`
- `worker.js` (17k+ L) → partir en:
  - `worker/index.js` (router)
  - `worker/routes/portfolio.js`
  - `worker/routes/dividends.js`
  - `worker/routes/ib.js`
  - `worker/routes/audit.js`
  - `worker/routes/ai-agents.js`
  - `worker/lib/migrations.js`
  - `worker/lib/fmp.js`
  - `worker/lib/telegram.js`

### Semana 10-12 — Calidad final

- **Playwright E2E**: 5 flujos críticos
  - Open Portfolio → ver lista
  - Search ZTS → click → análisis
  - Cost Basis → editar trade
  - Crear alerta de precio
  - Ver Audit dashboard
- **Lighthouse CI**: budget bundle <250KB gzip + LCP <2.5s + a11y >90
- **Cloudflare Workers Analytics**: dashboard con errores/h, latencias /api
- **ADR (Architecture Decision Records)**: docs/adr/ con cada decisión técnica
- **README serio + diagrama de arquitectura**

---

## Comandos útiles para sesiones futuras

```bash
# Ver bugs catalogados
cat docs/bug-patterns.md

# Ver estado audit
curl https://api.onto-so.com/api/audit/full | python3 -m json.tool

# Pre-deploy check
bash scripts/pre-deploy-check.sh

# Build frontend
cd frontend && npm run build

# Deploy frontend
cd frontend && npx wrangler pages deploy dist \
  --project-name=ayr --branch=production \
  --commit-message="feat: xxx" --commit-dirty=true

# Deploy worker
cd api && npx wrangler deploy
```

---

## Decisiones técnicas tomadas

| Decisión | Razón |
|---|---|
| Error tracking propio (no Sentry) | $0, control total, ya hay D1 + worker |
| Validators con shape `{value, isValid, issue}` | Graceful fallback en lugar de throw |
| TypeScript progresivo (archivo a archivo) | Sin big-bang rewrite |
| Zustand sobre Redux Toolkit | Menos boilerplate, más simple |
| Cron diario 08:00 UTC | 10am Madrid / 16:00 Shanghai (usuario en China) |
| Telegram alert SOLO si regresión | No spamear si todo OK |

---

## Lo que el usuario YA NO TIENE QUE RECORDAR

- Que tiene 76 posiciones en portfolio (audit lo cuenta)
- Qué sectores estaban wrong (auto-fix los corrigió)
- Qué bugs había en PG/ADP/REITs (catalogados)
- Cuándo fue el último audit (snapshot persistido en agent_memory)
- Qué endpoints existen (todo en CLAUDE.md + bug-patterns.md)

## Lo que CLAUDE NO PUEDE OLVIDAR (memoria persistente)

- `docs/bug-patterns.md` — los 11 bugs que arreglamos
- `CLAUDE.md` — reglas duras del proyecto
- `docs/ROADMAP-PRO.md` — este fichero, plan a 12 semanas
- `frontend/src/validators/index.js` — capa de validación
- `scripts/pre-deploy-check.sh` — guard antes de desplegar
