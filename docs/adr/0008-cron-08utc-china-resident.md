# ADR-0008: Cron diario 08:00 UTC (10am Madrid / 16:00 Shanghai)

**Status**: Accepted
**Date**: 2026-05-03
**Decided by**: ricardo + claude (sesión Capa 3 Anti-Fallo)

## Context

A&R corre varios crons en Cloudflare Workers:

- **Daily Data Audit**: ejecuta `/api/audit/full`, compara con baseline,
  envía Telegram alert si hay regresión.
- **Reconcile IB vs D1**: compara positions live de IB con `cost_basis`
  agregado, detecta drifts (Bug AHRT $64K se habría detectado aquí).
- **Smart Money refresh**: `sync-funds.sh` corre 13F + Spanish funds.
- **AI Agents pipeline**: 11 agentes corren por la mañana.
- **IB Flex sync**: importa trades + divs del día anterior.

Necesitamos elegir UNA hora UTC para el cron principal (audit). Restricciones:

- **Usuario reside normalmente en China** (UTC+8). Excepciones: vacaciones
  esporádicas en España (UTC+1 invierno / UTC+2 verano).
- Memoria persistente "[Contexto usuario (vive en China)]" especifica:
  "NO planear alrededor de 'viajes'. Mercado es mercado, su ubicación
  ortogonal."
- Mercado US abre **13:30-21:00 UTC** (verano) / **14:30-21:00 UTC** (invierno).
- Mercado Asia (Shanghai/HK) cierra **07:00 UTC** (Shanghai 15:00, HK 16:00).
- Mercado Europa (LSE/AMS) abre **08:00 UTC**.
- Telegram alerts deben llegar cuando el usuario esté **despierto pero no
  ocupado** — no a las 5am, no en plena reunión.

## Alternatives Considered

| Opción | Pros | Cons |
|---|---|---|
| 00:00 UTC (medianoche) | "Convención" para batch jobs nocturnos | China 8am (usuario despertando, ruidoso); España 1am (usuario dormido) |
| 04:00 UTC | Después del cierre Asia (Tokyo cierra 06:00 UTC) | China 12pm (almuerzo, ruidoso); España 5am (dormido) |
| 06:00 UTC | Pre-mercado Europa | China 14:00 (tarde temprana, ok); España 7am (puede estar dormido) |
| 08:00 UTC | Tras cierre Asia, antes de apertura Europa, **pre-mercado US**, China 16:00, España 9-10am | Si usuario viaja a US west coast, alerta llega a 1am — aceptable porque audit es informativo, no bloqueante |
| 12:00 UTC | España 13-14pm (almuerzo); China 20:00 (noche) | Demasiado tarde — el audit es preventivo, mejor antes de operar |
| 13:00 UTC | Justo antes del open US | China 21:00 (cena/después); España 14-15pm |

## Decision

Cron diario **08:00 UTC** (`0 8 * * *`).

Por qué:
1. **Asia cerró** (Shanghai cerró 07:00 UTC) — los datos de positions HK
   incluyen el cierre del día.
2. **Europa abre justo después** (LSE 08:00 UTC) — si el audit detecta
   un problema, el usuario puede actuar ANTES de operar Europa.
3. **Pre-mercado US** (US opens 13:30 UTC) — 5h de margen para que el
   usuario revise alertas y corrija antes del open.
4. **Hora local del usuario en China**: 16:00. Tarde, post-siesta,
   suele estar disponible. Memoria del usuario confirma que es horario
   activo.
5. **España (vacaciones)**: 09:00 (invierno) / 10:00 (verano). Mañana
   temprana, café — momento natural para revisar el dashboard.
6. **US west coast (raro pero posible)**: 01:00 — el usuario dormido,
   pero el audit no es bloqueante: lee la alerta al despertar y todavía
   tiene 6h hasta el open.

Cron extras complementarios:
- **`30 7 * * 1-5`** — IB Flex sync workdays solamente (08:30 Madrid).
  Importa trades del día anterior antes del audit principal.
- **`0 9 1,15,16,17,20 * *`** — Smart Money refresh (filing windows
  13F + Spanish funds; ver `sync-funds.crontab.example`).

## Consequences

- ✅ Telegram alerts llegan a una hora razonable en China y España.
- ✅ El usuario tiene horas (no minutos) para reaccionar antes del open
  US si hay regresión.
- ✅ El audit corre con datos del día completo (Asia ya cerró).
- ⚠️ Si usuario viaja a US (LATAM/west coast), el alert llega de noche.
  Mitigación: aceptable porque el audit es preventivo, no requiere
  acción inmediata.
- ⚠️ El cron NO se ajusta automáticamente a DST europeo. En verano
  cae 10:00 Madrid; en invierno 09:00 Madrid. Mitigación: aceptable;
  el usuario está en China la mayor parte del año, donde no hay DST.
- 🔮 Si el usuario se muda permanentemente a una zona horaria distinta
  (no parece probable según memoria), revisitar este ADR.

## Implementation

- `api/wrangler.toml` — `triggers.crons = ["0 8 * * *"]` para `scheduled()`
  handler del worker
- `api/src/worker.js` — `scheduled(event, env)` handler que ejecuta:
  1. `runDataAudit(env)` → genera issues report
  2. Compara con `agent_memory.audit_baseline`
  3. Si DELTA_RED > 0 → Telegram alert con detalles
- `scripts/sync-funds.crontab.example` — patrón crontab Mac para Smart Money
  refresh complementario (corre desde Mac del usuario, no desde Worker)
- `CLAUDE.md` — Cron Jobs documentados

## References

- Memoria persistente usuario: `feedback_user_context.md` (contexto China)
- Capa 3 Anti-Fallo: `CLAUDE.md` sección "Sistema Anti-Fallo desplegado 2026-05-03"
- Roadmap: `docs/ROADMAP-PRO.md` — "Cron diario 08:00 UTC" listado en decisiones técnicas
- Related ADRs: ADR-0009 (audit baseline + Telegram alert con regresión), ADR-0001 (errors_log también consultado por el cron diario)
