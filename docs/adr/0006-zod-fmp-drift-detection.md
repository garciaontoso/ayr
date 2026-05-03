# ADR-0006: Zod runtime para detectar drifts FMP

**Status**: Accepted
**Date**: 2026-05-03
**Decided by**: ricardo + claude (sesión Semana 2 roadmap profesionalización)

## Context

FMP (Financial Modeling Prep) ha cambiado el schema de sus respuestas al
menos dos veces en 6 meses sin avisar:

- **Bug Pattern #001 (ratios anuales vs TTM)**: `/api/fundamentals/bulk`
  empezó a devolver `ratios` como array anual con claves no-TTM
  (`priceToEarningsRatio` en lugar de `peRatioTTM`). El frontend leía
  `.peRatioTTM` → siempre `undefined` → 0 en TODA la tabla.
- **Bug Pattern #010 (`profile.mktCap` removed)**: `profile.mktCap` desapareció
  para muchos tickers. El dato vive ahora en `keyMetrics[0].marketCap`.
- **Sesión 2026-05-03 (FCF Allocation)**: FMP renombró `dividendsPaid` →
  `commonDividendsPaid` y `debtRepayment` → `netDebtIssuance` en cashflow.
  ZTS y otros 49 tickers tenían filas en `fundamentals` con schema viejo
  → todos los KPIs de allocation salían 0/negativos.

Los validators manuales de ADR-0002 atrapan datos malformados pero **no
disparan alarma** cuando un campo entero desaparece y todos los tickers
muestran fallback. La app sigue "funcionando" mostrando ceros, que es
peor que un crash visible.

## Alternatives Considered

| Opción | Pros | Cons |
|---|---|---|
| Solo validators sync (ADR-0002) | Graceful, sin nueva lib | No detecta cuando un campo NUEVO falta — solo detecta el campo que ya esperabas y vino malformado |
| Zod schemas como validación PRIMARIA | Schemas centralizados, infer de TS types | Cambia la semántica: `parse` tira throw; `safeParse` retorna `success` flag pero la lógica es más enrevesada que `{value, isValid, issue}` |
| Zod como CAPA OBSERVACIONAL paralela | Detecta drifts (campos faltantes / nuevos) sin cambiar el flujo principal | Doble esfuerzo (mantener validator + schema); mitigado porque los schemas son cortos y casi todo `optional().passthrough()` |
| io-ts | Funcional, similar al power de Zod | API más densa, comunidad más pequeña, menos integración TS-friendly |
| typia / suretype | Más rápido (compila tipos a checks) | Setup complejo, depende de transformer TS plugin |

## Decision

Zod como **capa observacional secundaria**, NO como capa defensiva
primaria.

Rules:
- **`safeParse` siempre, nunca `parse`** — Zod NUNCA bloquea el flujo.
- Los schemas usan `.passthrough()` y `.optional()` agresivamente. La idea
  no es validar estrictamente, sino **detectar** cuando un campo crítico
  se vuelve null/undefined sistemáticamente.
- Cuando `safeParseFundamentals(data, ticker)` falla → fire-and-forget POST
  a `/api/error-log` con `severity:'warn'`, ticker, y la lista de issues
  Zod (campo + qué se esperaba + qué llegó).
- **Throttle 60s por ticker** para no saturar `error-log` si todo el portfolio
  cae a la vez.
- El caller **siempre recibe los datos raw** además del flag `isValid`.
  El UI degrada con la fallback chain del validator manual (ADR-0002).

Schemas implementados:
- `ProfileSchema` — campos críticos del profile FMP (`symbol`, `companyName`,
  `sector`, `mktCap` opcional/null por Bug #010).
- `RatioAnnualSchema` — un elemento del array anual con claves no-TTM (Bug #001).
- `KeyMetricsAnnualSchema` — claves anuales que fallback de mktCap usa.
- `CashflowItemSchema` — `commonDividendsPaid`, `netDebtIssuance` etc.
  para detectar el rebrand de FMP visto en sesión ZTS.
- `FundamentalsBundleSchema` — bundle completo que `/api/fundamentals/bulk`
  devuelve, con cada array como `z.array(...).optional()`.

## Consequences

- ✅ Drift detectado al instante → alarma vía `/api/error-log` antes de
  que el usuario reporte ceros en el dashboard.
- ✅ Los schemas Zod sirven como **documentación viva** del shape FMP.
  Cuando FMP cambie de nuevo, sabremos qué cambió comparando schema vs
  payload real.
- ✅ TypeScript types se infieren de Zod (`z.infer<typeof ProfileSchema>`),
  reduciendo duplicación con `types.ts`.
- ⚠️ Coste bundle: ~12KB gzipped. Aceptable.
- ⚠️ Doble esfuerzo de mantenimiento (schema Zod + validator manual).
  Mitigación: los schemas Zod son `.optional().passthrough()` muy laxos;
  cambian poco.
- 🔮 Si llegamos a tener 50+ schemas grandes, considerar generación
  automática desde OpenAPI spec de FMP (si publican uno).

## Implementation

- `frontend/src/validators/schemas.ts` — schemas Zod + `safeParseFundamentals`
  + throttle 60s por ticker
- `frontend/src/validators/index.ts` líneas 30-57 — `_warnOnce` que postea a
  `/api/error-log` (compartido con validators manuales)
- `frontend/package.json` — `zod` añadido a dependencies
- Tests: `frontend/tests/validators/schemas.test.ts`
- Cableado en producción: aún parcial. Los entrypoints de fundamentals
  (`useAnalysisMetrics`, `PortfolioTab._fund`) deben llamar
  `safeParseFundamentals` después de cada fetch.

## References

- Roadmap: `docs/ROADMAP-PRO.md` — Semana 2 ("Zod schema /api/fundamentals")
- Bugs que motivaron: `docs/bug-patterns.md` #001, #010 + sesión ZTS
  (`docs/session_2026-05-03_zts_valuation_audit.md` cuando exista)
- Related ADRs: ADR-0001 (error-log endpoint), ADR-0002 (validator manual sigue siendo primario), ADR-0003 (TS infer types desde Zod)
