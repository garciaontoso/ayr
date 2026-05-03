# ADR-0001: Error tracking propio en D1 vs Sentry

**Status**: Accepted
**Date**: 2026-05-03
**Decided by**: ricardo + claude (sesión Semana 1 roadmap profesionalización)

## Context

A&R lleva ~2 años acumulando catches silenciosos (127 `try/catch` con `console.error`
solo, 67 `console.error` sin alarma). Cuando el frontend rompe en producción
(TDZ en Vite minified, schema drift de FMP, JOIN que devuelve 500, etc.) el
usuario ve "—" o NaN y nadie se entera. Bug Pattern #008 fue exactamente esto:
"Cannot access 'Vn' before initialization" sólo aparecía en build minified;
hasta que el usuario reportó la pestaña Resumen rota, el síntoma vivió en
silencio.

Restricciones:
- Equipo de 1 (no hay "equipo de SRE" que mire dashboards externos).
- Presupuesto $0 para SaaS recurrente (ya pagamos FMP $69/mo + GuruFocus $108/mo).
- Toda la infra ya vive en Cloudflare: Worker + D1 + Pages.
- Usuario reside en China; Sentry tiene dashboard pero requiere VPN constante
  para acceder con baja latencia.
- Los errores tienen que ser **accionables desde la propia app** (botón "marcar
  resuelto", "limpiar antiguos", filtrar por build) no en una herramienta externa.

## Alternatives Considered

| Opción | Pros | Cons |
|---|---|---|
| Sentry Team ($26/mo) | Source maps, breadcrumbs, integración con GitHub, alerting maduro | Coste, vendor lock-in, dashboard externo (acceso lento desde China), ofusca el problema bajo SDK opaco |
| Bugsnag | Pricing similar a Sentry | Mismos problemas de SaaS externo |
| LogRocket / FullStory | Session replay (potente para UX bugs) | $99-199/mo, demasiado para "1 usuario" |
| Cloudflare Workers Logpush → R2 + Workers Analytics | Cero $ extra, ya dentro del stack | Solo logs server-side, no captura JS errors del frontend; analytics no es queryable como tabla |
| Tabla D1 propia + endpoint POST | $0 incremental, query SQL completa, integra con `/api/audit/full` existente, dashboard en la propia tab del frontend | No source maps automáticos, no breadcrumbs ricos, hay que mantenerlo |

## Decision

Tracking propio en D1.

- **Tabla `errors_log`** ya creada (esquema en `api/src/lib/migrations.js`):
  campos `id`, `ts`, `severity` (warn/error/fatal), `message`, `stack`, `context` (JSON),
  `url`, `user_agent`, `build_id`, `resolved` (bool), `resolved_at`, `resolved_by`.
- **Endpoint `POST /api/error-log`** sin auth (cualquier visitante puede
  reportar errores; rate-limit por IP) — porque queremos capturar errores del
  ErrorBoundary antes incluso de que el usuario haya escrito el token.
- **ErrorBoundary global** envuelve `<App />` en `App.jsx`. Cualquier excepción
  React → POST a `/api/error-log` con stack + props del componente.
- **`window.onerror` + `window.onunhandledrejection`** capturan errores fuera del
  árbol React (timers, promesas).
- **Validators** (ver ADR-0002) reportan `severity: 'warn'` cuando detectan datos
  malformados.
- **Pestaña UI** dentro de Radar → "Errors": lista paginada, filtros por severidad
  / build / ticker, botón "Resolver" (UPDATE resolved=1), botón "Limpiar > 30 días".

## Consequences

- ✅ $0 incremental. Solo escribe a la D1 que ya pagamos.
- ✅ Los errores son SQL-queryable: `SELECT count(*) FROM errors_log WHERE message LIKE '%TDZ%' GROUP BY build_id` para detectar regresiones por commit.
- ✅ Integración trivial con `/api/audit/full` (un nuevo `kind:'js_errors_recent'`).
- ✅ Dashboard donde el usuario ya está mirando (no requiere cambiar de pestaña).
- ⚠️ Sin source maps automáticos. Mitigación: subimos `build_id` (commit hash)
  en cada deploy y el campo `stack` cita líneas del bundle minificado; con el
  build_id podemos `git checkout <sha> && npx vite preview` para reproducir.
- ⚠️ Sin breadcrumbs ricos. Mitigación: validators logean `context` como JSON
  serializado con la última acción del usuario (ticker abierto, tab activa).
- 🔮 Si llegamos a >100 errores/día sin resolver, considerar añadir Sentry como
  capa secundaria sólo para alerting. La tabla D1 sigue siendo el source of truth.
- 🔮 Si subimos source maps (build paso) podemos hacer un endpoint
  `/api/error-log/symbolicate?id=N` que mapee on-demand.

## Implementation

- `api/src/lib/migrations.js` — tabla `errors_log` con índices ts/severity/resolved
- `api/src/worker.js` — endpoint `POST /api/error-log` (sin auth, throttle por IP)
- `frontend/src/App.jsx` — `<ErrorBoundary />` wrapper global
- `frontend/src/main.jsx` — `window.onerror` + `window.onunhandledrejection` handlers
- `frontend/src/validators/index.ts` líneas 30-57 — `_warnOnce` POSTea a `/api/error-log` con `severity:'warn'` en producción
- `frontend/src/components/audit/ErrorsTab.jsx` — UI dashboard (filtros, resolver, cleanup)

## References

- Roadmap: `docs/ROADMAP-PRO.md` — Semana 1 (Visibilidad + Gates)
- Bug que motivó: `docs/bug-patterns.md` Bug #008 (TDZ silencioso solo en producción)
- Related ADRs: ADR-0002 (validators usan este endpoint), ADR-0009 (pre-deploy guard usa audit que incluye errors_log)
