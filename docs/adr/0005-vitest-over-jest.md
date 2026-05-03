# ADR-0005: Vitest sobre Jest

**Status**: Accepted
**Date**: 2026-05-03
**Decided by**: ricardo + claude (sesión Semana 1 roadmap profesionalización)

## Context

Antes de Semana 1 del roadmap, A&R no tenía suite de tests. Cada bug de
producción se descubría reportado por el usuario. El roadmap exige tests
para los flujos críticos (DCF, ROE, Altman, sharesAggr, AFFO) más
regression tests por cada bug catalogado en `bug-patterns.md`.

Stack relevante:
- Vite como bundler (config en `frontend/vite.config.js`).
- TypeScript progresivo (ADR-0003) — los tests deben correr `.ts` y `.tsx`
  sin transpilation extra.
- ESM-only — el frontend usa `import`/`export` puros, sin CommonJS.

Necesidades:
1. **Velocidad** — un equipo de 1 no espera 20s de jest startup en cada
   `vitest --watch`.
2. **Compat ESM nativa** — sin pelearse con `babel-jest` o
   `transformIgnorePatterns` cada vez que una dep es ESM-only.
3. **API conocida** — `describe`/`it`/`expect` para no reinventar nada.
4. **Coverage incluido** — sin `nyc` aparte.

## Alternatives Considered

| Opción | Pros | Cons |
|---|---|---|
| Jest 29 | Maduro, ecosistema enorme, infinitos tutoriales | ESM tooling frágil (`--experimental-vm-modules`), startup lento, requiere `babel-jest` o `ts-jest` para TS, otro pipeline diferente al de Vite |
| Vitest | Comparte la pipeline de Vite (mismos plugins, mismas resoluciones), ~5-10× más rápido en watch, ESM nativo, TS sin config, API casi idéntica a Jest | Comunidad más pequeña, algunos plugins jest no portan 1:1 |
| node:test (built-in) | Cero deps, oficial Node | API mínima sin matchers ricos, sin coverage UI, sin watcher |
| Mocha + Chai | Maduro, flexible | Requiere ensamblar runner + matchers + coverage manual |

## Decision

Vitest.

- **Configuración**: `frontend/vitest.config.js` reusa el mismo `defineConfig`
  pattern que Vite. Single source of truth para alias, JSX, etc.
- **Environment**: `jsdom` (los tests tocan calculators puros y validators
  que NO requieren DOM, pero algunos tocan `localStorage`).
- **Cobertura**: configurada para `src/calculators/`, `src/validators/`,
  `src/utils/` — los tres dominios de "lógica pura testeable".
- **Patrón de archivos**: `*.test.ts(x?)` co-locados junto al código en
  `src/`, plus suite de regresiones en top-level `tests/regressions/`
  (un test JSON-snapshot por cada bug de `bug-patterns.md`).
- **Mock strategy**: stubs manuales con `vi.fn()` para fetch externo;
  no usamos MSW (overkill para nuestra superficie).
- **Globals: true** — `describe`/`it`/`expect` sin import explícito,
  porque el ratio señal/ruido del import en cada test es bajo.

## Consequences

- ✅ Watch mode tarda <500ms vs ~5-8s en jest típico para un cambio
  pequeño. Empuja a correr tests más a menudo.
- ✅ Cero conflictos ESM.
- ✅ El alias `@/*` que usa Vite funciona también en tests sin config extra.
- ✅ TS sin `ts-jest` ni transformer — Vitest delega a Vite que ya hace
  transpile para producción.
- ⚠️ Algunos plugins jest (`jest-dom`, `jest-axe`) requieren wrapper
  `@testing-library/jest-dom` con import distinto. Mitigación: documentado
  en `tests/_setup/`.
- ⚠️ Comunidad más pequeña — algunas recetas exóticas (mock dinámico de
  módulos ESM con state) requieren `vi.doMock` en vez de `jest.doMock`.
  Mitigación: docs Vitest son buenas, Stack Overflow rara vez tira.
- 🔮 Si llegamos a >5,000 tests podríamos considerar Jest por su parallelism
  más maduro. Estamos a 432 tests; lejos.

## Implementation

- `frontend/vitest.config.js` — config completa (28 líneas)
- `frontend/package.json` — scripts `test`, `test:watch`, `test:cov`
- `frontend/tests/_setup/` — setup compartido (jsdom polyfills, localStorage stub)
- `frontend/tests/regressions/` — un test snapshot por bug catalogado
- `frontend/src/**/*.test.ts` — tests co-locados con calculators y validators

Estado al final de Semana 1 (2026-05-03):
- 432 tests, 25 archivos
- 11-18s en `npm run test` full run (vs estimación >2 min con Jest)
- Coverage: validators 78%, calculators 91%, utils 64%

## References

- Roadmap: `docs/ROADMAP-PRO.md` — Semana 1 (test setup + 5 tests críticos como mínimo)
- Bugs cubiertos por regression tests: ver `tests/regressions/` mapped a `bug-patterns.md`
- CI: `.github/workflows/ci.yml` step "Test (Vitest)"
- Related ADRs: ADR-0003 (TS sin transformer extra), ADR-0011 (Playwright para E2E porque vitest no es la herramienta para eso)
