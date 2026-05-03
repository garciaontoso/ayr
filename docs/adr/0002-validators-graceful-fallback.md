# ADR-0002: Validators con shape `{value, isValid, issue}` (no throw)

**Status**: Accepted
**Date**: 2026-05-03
**Decided by**: ricardo + claude (sesión Semana 1 roadmap profesionalización)

## Context

A&R es una app financiera. Cuando los datos de FMP / IB / D1 vienen
malformados (NaN, null, schema viejo, ratios con período incorrecto) la opción
"throw y deja que el error suba" tiene una consecuencia inaceptable: la tabla
del portfolio se rompe entera porque uno de los 76 tickers tiene datos sucios.

Bug Pattern #001 (`evEbitda` 0 en TODO el portfolio porque el frontend leía
`.peRatioTTM` en un array anual) y Bug #010 (`profile.mktCap = None` para ETFs)
son ejemplos directos: un cambio de schema FMP rompió silenciosamente decenas
de columnas. La app no crashed; mostró ceros. Eso es **peor** que un crash
porque el usuario toma decisiones financieras sobre datos que parecen reales.

Necesitamos:
1. Detectar el problema y reportarlo (no esconderlo).
2. NO romper la UI por una fila mala.
3. Dejar que cada componente decida cómo "degradar" (mostrar "—", usar fallback,
   ocultar la columna, etc).

## Alternatives Considered

| Opción | Pros | Cons |
|---|---|---|
| `throw` en validador inválido | Forces caller to handle; explícito | Una posición mala rompe TODA la tabla; React error boundaries son granularidad pobre para esto |
| Yup / Joi schema-first | API maduro, errores expresivos | Bundles ~30KB extra, valida con throw por defecto, no expone "graceful value + flag" |
| Zod schema-first | TypeScript-first, infer types | Igual que Yup en runtime semantics; mejor combinar como CAPA OBSERVACIONAL (ADR-0006) que como CAPA DEFENSIVA |
| Validators custom `{value, isValid, issue}` | Control total, devuelve fallback explícito, el caller decide | Hay que mantenerlos manualmente (DRY-violation entre schema FMP y código TS) |

## Decision

Validators custom con la siguiente forma:

```ts
type ValidatorResult<T> = {
  value: T;        // siempre presente — fallback safe si !isValid
  isValid: boolean;
  issue?: string;  // descripción humana del problema
};
```

Reglas:
- **Nunca throw.** Si el input es inválido, devolver `value: fallback` con
  `isValid: false` y `issue` describiendo qué pasó.
- **`fallback` debe ser visualmente neutro** — `0` para sumas, `'—'` para
  texto, `null` para opcionales que la UI sabe ocultar.
- **`_warnOnce`** dedupe con `Set<string>` para no spamear la consola si
  todas las 76 posiciones tienen el mismo bug.
- **Reporte fire-and-forget a `/api/error-log`** en producción (severity
  `'warn'`) — ver ADR-0001.
- Validators primitivos: `validateNumber`, `validatePrice`, `validatePercent`,
  `validateDate`, `validateTicker`.
- Validators compuestos: `validatePosition`, `validateTrade`, `validateFundamentals`.
- Helpers: `isReit(profile)` para que cada componente no replique la lógica
  de detección de REIT (otra fuente de bugs, ver Bug Pattern #006).

## Consequences

- ✅ Una posición rota no rompe el resto de la tabla.
- ✅ Los validators son auto-documentados: el `issue` cuenta exactamente
  qué se esperaba y qué llegó.
- ✅ Reporting centralizado a `/api/error-log` permite ver agregados ("¿qué
  símbolos están fallando hoy?") sin Sentry.
- ⚠️ Hay que mantener los validators a mano. Mitigación: cuando aparezca
  Bug Pattern nuevo, AÑADIR test regresión en `tests/regressions/` que llame
  al validator con el payload roto.
- ⚠️ Los componentes legacy (`PortfolioTab`, `DashTab`, `FastTab`) aún no
  están cableados — TODO en el roadmap. Mitigación: cablear incrementalmente
  cuando se toquen por feature.
- 🔮 Si Zod (ADR-0006) detecta un drift FMP que rompe los validators
  manuales, se actualiza el schema manual + se añade test, pero el ADR
  básico no cambia.

## Implementation

- `frontend/src/validators/index.ts` (líneas 1-340) — implementación principal
- `frontend/src/validators/schemas.ts` — schemas Zod complementarios (ADR-0006)
- `frontend/src/types.ts` — definición de `ValidatorResult<T>`, `Position`, `FmpProfile`
- Tests: `frontend/tests/validators/*.test.ts`
- Estado del cableado en componentes (2026-05-03):
  - `PortfolioTab.jsx` — TODO
  - `DashTab.jsx` — TODO
  - `FastTab.jsx` — parcial (`isReit` + price fallback)

## References

- Roadmap: `docs/ROADMAP-PRO.md` — Semana 1
- Bugs que motivaron: `docs/bug-patterns.md` #001 (ratios TTM), #006 (REIT EPS), #010 (mktCap)
- Related ADRs: ADR-0001 (logging), ADR-0006 (Zod observacional), ADR-0003 (TypeScript)
