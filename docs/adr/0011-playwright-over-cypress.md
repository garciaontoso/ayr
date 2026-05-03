# ADR-0011: Playwright sobre Cypress para E2E

**Status**: Accepted
**Date**: 2026-05-03
**Decided by**: ricardo + claude (sesión Semana 10 roadmap profesionalización, adelantada)

## Context

Vitest (ADR-0005) cubre lógica pura: calculators, validators, utils.
Pero los bugs más caros han sido **bugs de integración**: el frontend
muestra ceros porque el endpoint cambió de schema, o el portfolio
llama un endpoint con auth wrong y la pantalla queda blanca.

Necesitamos tests **end-to-end contra producción** que arranquen
Chrome, vayan a `https://ayr.onto-so.com`, hagan login, naveguen a
una pestaña, comprueben que renderiza. Estos tests deben:

1. Correr en CI sin requerir que el worker o pages estén en
   "modo test" (los tests apuntan a producción real).
2. Soportar auth via localStorage stub (el AuthGate de A&R solo
   comprueba un timestamp `ayr_auth` dentro de 15min).
3. Capturar trace + video al fallar para debug post-mortem.
4. Correr rápido en CI (chromium-only es suficiente).

Roadmap Semana 10 lo lista como Lighthouse + Playwright + ADR + README.
Lo adelantamos a Semana 1-2 porque el refactor de monolitos (ADR-0010,
ADR-0004) necesita una red de seguridad antes de tocar `App.jsx` y
`worker.js`.

## Alternatives Considered

| Opción | Pros | Cons |
|---|---|---|
| Cypress | Gran UX dev (panel time-travel), comunidad enorme, docs accesibles | Runtime separado de Node, bundle pesado, parallelism propio (a veces flakey), proyecto único = harder a multi-browser, "dom rendering issues" recurrentes con SPAs |
| Playwright | Multi-browser nativo (chromium/firefox/webkit), trace viewer incluido, runs en plain Node, excelente CI integration, más rápido típicamente | UI dev menos pulida que Cypress (mitigado con `npm run e2e:ui`) |
| Selenium / WebDriver | Estándar industrial, lenguaje-agnóstico | API arcaica para JS, tooling fragmentado |
| Puppeteer | API más simple | Solo Chromium oficialmente, sin runner propio (hay que ensamblar) |
| Sin E2E (solo Vitest) | Cero infra extra | Bugs de integración escapan; SPA queda blanca, nadie se entera |

## Decision

Playwright + chromium-only.

- **`frontend/playwright.config.js`** con baseURL `process.env.E2E_URL ||
  http://localhost:5173`. Local apunta a dev server; CI apunta a
  `https://ayr.onto-so.com` (producción).
- **Chromium-only** (proyecto único `chromium`). Multi-browser es
  opcional para más adelante; por ahora reduce CI time ~3×.
- **Auth via localStorage stub**: `e2e/_setup/auth.js` inyecta
  `localStorage.setItem('ayr_auth', String(Date.now()))` antes de cada
  spec. AuthGate solo comprueba que `Date.now() - ayr_auth < 15min`,
  por lo que no necesitamos password real.
- **Token AYR para endpoints autenticados**: `E2E_TOKEN` GitHub Secret →
  monkey-patched igual que en producción.
- **Trace + screenshot + video on failure** (`retain-on-failure`).
  Permite reproducir el bug post-mortem desde Playwright Trace Viewer.
- **CI: `continue-on-error: true`** mientras estabilizamos selectors.
  Una vez el ratio de flakes < 5%, lo quitamos para que bloquee merges.
- **5 specs críticos** (orden de blast radius):
  1. `portfolio-loads.spec.js` — abrir portfolio, ver al menos 50 filas
  2. `search-and-analyze.spec.js` — Cmd+K → ZTS → click → Resumen
     renderiza
  3. `cost-basis-tab.spec.js` — abrir Cost Basis, editar trade, save
  4. `audit-tab.spec.js` — abrir Audit, comprobar summary numbers >0
  5. `errors-tab.spec.js` — abrir Errors tab, comprobar lista visible

## Consequences

- ✅ Refactor de monolitos (ADR-0010, ADR-0004) tiene safety net real
  antes de empezar — si la migración rompe la pestaña Audit, la
  spec falla en CI.
- ✅ Los 5 flujos críticos están blindados. Si el usuario reporta
  "no carga el portfolio", podemos saber si es regresión pushed
  recientemente (CI lo habría detectado).
- ✅ Playwright Trace Viewer permite ver el DOM en cada paso del
  test fallido — debugging brutal vs leer logs.
- ✅ Cero infra adicional: corre en GitHub Actions runner stock con
  `npx playwright install chromium`.
- ⚠️ Los selectors actuales son frágiles (`getByText('Portfolio')`).
  Mitigación: ir migrando a `data-testid` cuando se toquen los
  componentes; mientras tanto `continue-on-error` no bloquea merges.
- ⚠️ Tests apuntan a producción → si el worker está down, todo el
  CI falla. Mitigación: el `continue-on-error` también cubre este caso.
- 🔮 Cuando aumentemos a multi-browser (firefox/webkit), añadir
  `projects` extras al config. Coste CI subirá ~2-3×.

## Implementation

- `frontend/playwright.config.js` — config completa (43 líneas)
- `frontend/e2e/_setup/auth.js` — helper de auth stub
- `frontend/e2e/portfolio-loads.spec.js`
- `frontend/e2e/search-and-analyze.spec.js`
- `frontend/e2e/cost-basis-tab.spec.js`
- `frontend/e2e/audit-tab.spec.js`
- `frontend/e2e/errors-tab.spec.js`
- `frontend/package.json` — scripts `e2e`, `e2e:ui`, `e2e:headed`
- `.github/workflows/ci.yml` job `e2e` — corre Playwright vs producción

Estado al final de Semana 1 (2026-05-03):
- 5 specs en green local
- 5 specs en CI con `continue-on-error: true`
- Trace + video + screenshot artifact uploaded a GitHub on failure

## References

- Roadmap: `docs/ROADMAP-PRO.md` — Semana 10 (adelantada a Semana 1-2)
- Test setup: ver scripts del CI workflow `.github/workflows/ci.yml`
  job `e2e` (líneas ~75 en adelante)
- Related ADRs: ADR-0005 (Vitest cubre unit; Playwright cubre integration), ADR-0010 (E2E es safety net antes del refactor monolito), ADR-0009 (audit + E2E son las dos redes pre-deploy)
