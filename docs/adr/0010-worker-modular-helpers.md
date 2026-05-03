# ADR-0010: Worker monolito → lib/ helpers progresivo

**Status**: Accepted
**Date**: 2026-05-03
**Decided by**: ricardo + claude (sesión Semana 7-9 roadmap profesionalización)

## Context

`api/src/worker.js` llegó a 30,390 líneas de un solo fichero. Contiene:

- Routing (~200 endpoints)
- OAuth IB helpers (~600 líneas)
- IB Bridge proxy
- D1 migrations (~3,000 líneas inline)
- 11 AI agents
- Auto Trading engine + backtest
- Telegram notifications
- CORS / auth gates
- FMP / Yahoo / GuruFocus integration
- Crons handler

Problemas concretos:
- **Carga de contexto Claude**: leer worker.js entero consume varios
  segundos y miles de tokens — caro y lento en cada sesión.
- **Revisión humana imposible**: PRs que tocan worker.js no tienen
  diff legible (a menudo son 5-10 líneas perdidas en 30k).
- **Atajos peligrosos**: ya pasó que un agente cambió el routing y
  borró sin querer un endpoint que vivía 12,000 líneas más abajo.
- **Bug Pattern: refactor-induced regressions**: durante extracciones
  anteriores, agentes borraron wrappers (`getRiskMetrics`,
  `cacheRiskMetrics`) junto con las funciones extraídas porque "no se
  llamaban en el archivo nuevo". Se llamaban — desde otro endpoint
  500 líneas abajo en el mismo archivo.

Roadmap Semana 7-9 propone partir worker.js en `worker/routes/*` +
`worker/lib/*`. Pero hacerlo todo de golpe es exactamente la receta
del Bug Pattern de arriba.

## Alternatives Considered

| Opción | Pros | Cons |
|---|---|---|
| Big-bang split (1 PR gigante) | Termina rápido si funciona | Imposible revisar; riesgo enorme de borrar wrappers; PR se queda abierta semanas |
| Mantener monolito, vivir con ello | Cero riesgo refactor | Crece sin freno; load time pésimo; revisión humana imposible |
| Helpers progresivos (lib/) sin tocar endpoints | Diff pequeños, fáciles de revisar, smoke test entre extracciones | Más lento; necesita disciplina |
| Routes (worker/routes/portfolio.js etc) primero | Modulariza por dominio | Cada extracción de ruta tiene 10× más superficie que un helper, mucho más arriesgado en early stage |

## Decision

**Helpers progresivos primero, routes después.**

Reglas de extracción:

1. **Solo MOVES, no logic changes** — el helper extraído debe tener el
   mismo body modulo `export`. Cualquier optimización es un PR aparte
   POSTERIOR.
2. **Empezar por funciones pure** — `cors.js`, `auth.js`, `telegram.js`,
   `migrations.js`, `fmp.js` no tienen estado mutable, son trivialmente
   movibles.
3. **Después funciones con estado** — los wrappers de cache (riskMetrics,
   priceCache) requieren cuidado: si el estado vivía como `let cache = {}`
   en el scope global del worker, hay que convertirlo a `export const
   cache = new Map()` o equivalente.
4. **Nunca extraer routing aún** — los handlers de endpoints son los
   MÁS arriesgados porque tocan request/response. Diferimos.
5. **Verificación obligatoria post-extracción**:
   - `npx wrangler deploy --dry-run` — bundlea sin desplegar; falla si
     el import roto.
   - Smoke `/api/audit/full` post-deploy real — falla si endpoint
     borrado por accidente.
6. **Un PR = una extracción** — `lib/cors.js`, después `lib/auth.js`,
   etc. Diff revisable en <100 líneas.

## Consequences

- ✅ worker.js bajó de 30,390 → 28,654 líneas tras 2 rondas (cors,
  auth, telegram, migrations, fmp, agents/, ticker-memory,
  research-agent extraídos).
- ✅ Cada PR de extracción es revisable.
- ✅ Las pruebas locales con vitest pueden importar `lib/cors.js`
  directamente sin levantar el worker entero.
- ✅ Carga de contexto Claude más barata: leer `lib/auth.js` (42 líneas)
  vs buscar la función en worker.js.
- ⚠️ Convivencia con monolito durante meses (worker.js sigue siendo el
  router maestro). Aceptable.
- ⚠️ Cuidado especial con ES modules `export let` para state mutable:
  módulos JS exportan **bindings**, no valores; reasignar `let foo`
  desde otro módulo NO se ve. Patrón correcto: `export const state =
  { foo: 0 }` y mutar `state.foo` desde cualquier importer.
- ⚠️ Riesgo: agentes pueden "limpiar" wrappers cuando se borra la
  función extraída del worker.js (pasó con `getRiskMetrics`/
  `cacheRiskMetrics`). Mitigación: regla "extraer ≠ borrar referencias
  en el resto del worker", que se hace en PR aparte después de cablear
  todos los call sites.
- 🔮 Cuando worker.js baje de ~15,000 líneas y el ratio
  helpers-extraídos / endpoints sea favorable, considerar la siguiente
  fase: extraer routes a `worker/routes/portfolio.js` etc.

## Implementation

Estado actual `api/src/lib/` (2026-05-03):

```
api/src/lib/
├── agents/                  ← prompts/configs de los 11 AI agents
├── auth.js          (42 L)  ← ytRequireToken
├── cors.js          (37 L)  ← buildCorsHeaders + ALLOWED_ORIGINS
├── fmp.js           (~280 L) ← FMP wrapper + cache helpers
├── migrations.js    (~1,800 L) ← schema migrations + audit checks
├── research-agent.js        ← agente que escribe informes Deep Dividend
├── telegram.js      (~120 L) ← sendTelegram + alert templating
└── ticker-memory.js         ← memoria persistente por ticker
```

Pendientes (orden de prioridad):
1. `lib/prices.js` — wrapper Yahoo/FMP price fetching (actualmente
   inline en `/api/prices` y `/api/prices?live=1`)
2. `lib/quotes.js` — IB Bridge quote helpers
3. `lib/auto-trading.js` — engine + backtest (denso pero aislado)
4. `lib/ai-agents.js` — orquestación de los 11 agents
5. **Después** routes: `worker/routes/portfolio.js`, `routes/dividends.js`,
   `routes/audit.js`, `routes/ib.js`

## References

- Roadmap: `docs/ROADMAP-PRO.md` — Semana 7-9
- Memoria sesiones: extracciones documentadas en
  `session_2026-05-03_*.md` (cuando existan)
- Bug pattern de refactor: descrito arriba, no tiene número aún en
  `bug-patterns.md` — TODO: catalogar como Bug #012
- Related ADRs: ADR-0011 (Playwright es safety net durante refactor), ADR-0009 (smoke test post-deploy via audit)
