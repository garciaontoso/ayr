# Architecture Decision Records — A&R

ADRs documentan decisiones técnicas con contexto, alternativas consideradas,
y razón. Inmutables una vez aceptados (las decisiones que cambian crean ADRs
nuevos que "supersede" el anterior).

Formato: ADR-XXXX (4 dígitos, monotónico, sin reusar números).

## Cómo añadir un ADR nuevo

1. Copia la plantilla del último ADR.
2. Asigna el siguiente número libre (no reutilices nunca).
3. Estado inicial: `Proposed` mientras se discute, `Accepted` cuando se
   implementa, `Deprecated` o `Superseded by ADR-XXXX` si deja de aplicar.
4. Añádelo a la tabla de abajo.
5. Una vez aceptado, **no lo edites para cambiar la decisión** — crea un
   ADR nuevo que lo reemplaza.

## Índice

| # | Título | Estado |
|---|---|---|
| [0001](0001-error-tracking-d1-vs-sentry.md) | Error tracking propio en D1 vs Sentry | Accepted |
| [0002](0002-validators-graceful-fallback.md) | Validators con shape `{value, isValid, issue}` (no throw) | Accepted |
| [0003](0003-typescript-progressive.md) | TypeScript progresivo (file-by-file, no big-bang) | Accepted |
| [0004](0004-zustand-over-redux.md) | Zustand sobre Redux Toolkit | Accepted |
| [0005](0005-vitest-over-jest.md) | Vitest sobre Jest | Accepted |
| [0006](0006-zod-fmp-drift-detection.md) | Zod runtime para detectar drifts FMP | Accepted |
| [0007](0007-merge-on-read-not-write.md) | MERGE en READ no en WRITE para vistas combinadas | Accepted |
| [0008](0008-cron-08utc-china-resident.md) | Cron diario 08:00 UTC (10am Madrid / 16:00 Shanghai) | Accepted |
| [0009](0009-pre-deploy-audit-baseline.md) | Pre-deploy guard con audit baseline | Accepted |
| [0010](0010-worker-modular-helpers.md) | Worker monolito → lib/ helpers progresivo | Accepted |
| [0011](0011-playwright-over-cypress.md) | Playwright sobre Cypress para E2E | Accepted |

## Lecturas relacionadas

- `docs/ROADMAP-PRO.md` — plan a 12 semanas que motivó la mayoría de estas decisiones
- `docs/bug-patterns.md` — bugs catalogados que justifican varios ADRs
- `CLAUDE.md` — reglas duras del proyecto + historial v3.0 → v4.5
