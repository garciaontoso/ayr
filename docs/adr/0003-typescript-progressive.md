# ADR-0003: TypeScript progresivo (file-by-file, no big-bang)

**Status**: Accepted
**Date**: 2026-05-03
**Decided by**: ricardo + claude (sesión Semana 3-6 roadmap profesionalización)

## Context

A&R frontend tiene ~23,000 líneas de JSX repartidas entre `App.jsx` (2,774L),
~30 tabs, ~50 componentes UI y ~15 calculators. Los tipos vienen de tres
fuentes externas: FMP (schemas que cambian sin avisar), IB Bridge (proto
custom), y D1 (filas semi-tipadas).

El equipo es 1 persona. Una migración "big bang" — renombrar todo a `.tsx`,
arreglar los miles de errores que aparecerán, mergear todo de una vez —
implica:
- Una rama larguísima que conflictúa con cualquier hot-fix.
- Pausa de features durante semanas.
- Riesgo enorme de regresiones (cuando todo se toca a la vez, los tests
  no atrapan todo).

Los Bugs #008 (TDZ en `FastTab`) y #001 (ratios TTM en arrays anuales)
muestran que **muchos bugs en producción son violaciones de tipos** —
TypeScript los habría atrapado en compile time. Pero no podemos pagar
"todo o nada".

## Alternatives Considered

| Opción | Pros | Cons |
|---|---|---|
| Big-bang TS rewrite (1 PR gigante) | Termina rápido si funciona | Pausa de features, conflictos masivos, alto riesgo |
| Mantener JS + JSDoc types | Cero migración | JSDoc no atrapa todos los errores TS sí (genéricos, narrowing); IDE soporte parcial |
| `allowJs:true` + `checkJs:true` (mixed strict) | Tipos en `.js` sin renombrar | Doble validación, errores ruidosos en archivos legacy que no podemos arreglar todavía |
| Progresivo file-by-file con `allowJs:true` + `checkJs:false` | Migración natural cuando se toca por feature, sin presión | Más lento; coexistencia `.js` y `.ts` confusa al principio |

## Decision

TypeScript **progresivo, archivo-a-archivo**. Estrategia:

1. **`tsconfig.json` con `strict: true`** desde día 1 para los archivos
   migrados. NO hacemos opt-in gradual de strict checks.
2. **`allowJs: true` + `checkJs: false`** — convivencia con los `.jsx`
   legacy que aún no migramos, sin que TS chille por ellos.
3. **Renombrar `.jsx` → `.tsx` solo cuando se toca el archivo por feature**.
   Si un archivo lleva 2 años sin tocar y no tiene bugs reportados, no lo
   tocamos.
4. **Orden de migración por valor**: empezar por los archivos donde un bug
   de tipos haría más daño:
   - `validators/` (capa defensiva, ADR-0002)
   - `calculators/` (DCF, ROE, Altman, Piotroski — fórmulas financieras)
   - `utils/formatters.ts`, `utils/sharesAggr.ts` (numerics críticos)
   - `state/themeStore.ts` (piloto de Zustand, ADR-0004)
5. **CI bloqueante**: `npm run typecheck` corre en GitHub Actions; si falla,
   no se mergea a main. Esto evita que un archivo nuevo en `.tsx` rompa
   el typecheck por accidente.

## Consequences

- ✅ Migramos sin pausar features.
- ✅ Cada PR es revisable porque solo toca un archivo o dos.
- ✅ El compilador TS atrapa bugs como #001 (ratios TTM) ANTES de producción.
- ✅ Auto-completion de los `Position`, `FmpProfile`, `Trade` shapes ahorra
  20-30 minutos por feature nueva.
- ⚠️ El frontend tiene una mezcla `.jsx` + `.tsx` durante meses, lo cual
  es estéticamente feo. Mitigación: lista en este ADR + en `ROADMAP-PRO.md`
  qué archivos faltan.
- ⚠️ Los archivos legacy `.jsx` no tienen tipos; sus bugs siguen escapando
  hasta que los toquemos. Mitigación: validators (ADR-0002) son la red
  defensiva runtime mientras los tipos llegan.
- 🔮 Cuando el % de archivos migrados pase ~80%, considerar
  `checkJs: true` para forzar que los pocos `.js` restantes también
  validen.

## Implementation

- `frontend/tsconfig.json` — `strict:true`, `allowJs:true`, `checkJs:false`,
  `noEmit:true`, paths `@/*`
- `frontend/package.json` — script `"typecheck": "tsc --noEmit"`
- `.github/workflows/ci.yml` línea 41 — step `Typecheck (TypeScript)` bloqueante

Estado de migración (post Semana 3, 2026-05-03):

Ya migrados a TS:
- `frontend/src/validators/index.ts` (340L)
- `frontend/src/validators/schemas.ts` (320L Zod)
- `frontend/src/calculators/dcf.ts`
- `frontend/src/calculators/altmanZ.ts`
- `frontend/src/calculators/piotroski.ts`
- `frontend/src/utils/formatters.ts`
- `frontend/src/utils/sharesAggr.ts`
- `frontend/src/state/themeStore.ts`
- `frontend/src/types.ts` (definición central de Position, Trade, Fundamentals)

Pendientes prioritarios:
- `frontend/src/utils/storage.js` (legacy `localStorage` wrapper, mucho `any`)
- `frontend/src/utils/currency.js`
- `frontend/src/utils/ratings.js`
- `frontend/src/utils/userPrefs.js`
- `frontend/src/api/data.js` (define el shape de TODA la respuesta del worker — alto valor)
- `frontend/src/api/fmp.js`

Pendientes diferidos (gran tamaño, baja frecuencia de cambio):
- `frontend/src/components/home/PortfolioTab.jsx`
- `frontend/src/components/analysis/FastTab.jsx`
- `frontend/src/App.jsx` — atado al refactor de stores (ADR-0004)

## References

- Roadmap: `docs/ROADMAP-PRO.md` — Semana 3-6
- Bugs que TS habría atrapado: `docs/bug-patterns.md` #001, #002, #008, #010
- Related ADRs: ADR-0002 (validators ya están en TS), ADR-0004 (Zustand stores en TS), ADR-0006 (Zod schemas)
