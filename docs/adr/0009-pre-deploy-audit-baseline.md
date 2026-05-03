# ADR-0009: Pre-deploy guard con audit baseline

**Status**: Accepted
**Date**: 2026-05-03
**Decided by**: ricardo + claude (sesión Capa 1+2 Anti-Fallo)

## Context

A&R deploya frontend (Cloudflare Pages) y worker (Cloudflare Workers)
varias veces por semana. La infra es estable; lo que NO es estable son
los datos: cualquier cambio en una migración D1 o un import Flex puede
crear filas duplicadas, romper tipos, o cambiar el shape que el frontend
espera.

Caso real (sesión 2026-05-02 Data Integrity): un re-import bulk de
6,114 trades con `flex_csv_to_d1.py` insertó **9,124 phantom rows** en
`cost_basis` por una ventana de dedup de 90 días mal calculada. Salió a
producción y el usuario vio AHRT con $64,692 cost basis (real: $1,995).
Días reconstruyendo. El bug habría sido obvio post-import si hubiera
existido un check automatizado contra "estado anterior".

Necesitamos:
1. **Antes de cada deploy**, ejecutar un audit que sepa contar issues
   por categoría (red/yellow) y compararlos con el último deploy.
2. **Bloquear el deploy si hay nuevos issues red** (regresión real de
   datos).
3. **Permitir override** para emergencias (deploy que arregla un bug
   crítico aunque no resuelva los issues red existentes).

## Alternatives Considered

| Opción | Pros | Cons |
|---|---|---|
| Sin guard (status quo previo) | Cero fricción | Bug AHRT salió a producción, días reconstruyendo |
| Tests de integración con D1 mock | Reproducibles, parte de CI | Mock de D1 es fragile; los bugs reales son por DATOS reales en producción, no por código |
| Manual check post-deploy + revert | Cero infra extra | Reactivo, ya está roto cuando lo ves |
| Audit endpoint + baseline JSON local | Refleja estado real, simple, $0 | Hay que recordar correrlo (a menos que lo cableemos a `npm run deploy`) |
| GitHub Actions audit pre-deploy | Centralizado, no depende de la máquina | Worker tiene que estar accesible → durante el deploy en sí, "antes" = pre-PR-merge |

## Decision

Pre-deploy guard local + baseline JSON + override flag.

Componentes:

1. **`/api/audit/full`** — endpoint del worker que devuelve:
   ```json
   {
     "summary": { "total_issues": 333, "red": 12, "yellow": 87 },
     "issues": {
       "cost_basis": [{ "ticker": "AHRT", "sev": "red", "msg": "..." }],
       "dividendos": [...],
       "positions": [...],
       "fundamentals": [...]
     }
   }
   ```
2. **`scripts/pre-deploy-check.sh`** — bash script que:
   - Hace curl al endpoint
   - Parsea con python (siempre instalado)
   - Compara `red` actual vs `red` en `.audit-baseline.json`
   - Si `DELTA_RED > 0` → exit 1 + lista los primeros 10 nuevos issues
   - Si `DELTA_TOTAL > 20` (sin nuevos red) → warn pero continúa
   - Persiste snapshot actual como nueva baseline (post-deploy)
3. **Override**: `ALLOW_REGRESSION=1 bash scripts/pre-deploy-check.sh`
   bypasea el bloqueo (para emergencias y para el primer deploy con
   issues red intencionales que vamos a arreglar después).
4. **`.audit-baseline.json`** committeado al repo. Contiene el último
   snapshot conocido como "good". Cualquier deploy lo actualiza.

Pendiente (Semana 1-2): cablear el script al `npm run deploy:safe`
del frontend para que sea automático.

## Consequences

- ✅ Una regresión de datos (bug AHRT, phantom rows) **no llega a
  producción** sin un override consciente.
- ✅ El override deja rastro: cualquiera revisando git history ve
  "deploy con `ALLOW_REGRESSION=1`" → pregunta automática "¿se justificó?".
- ✅ La baseline JSON committeada deja audit trail histórico de cuántos
  issues había en cada deploy.
- ⚠️ El guard depende de que `/api/audit/full` esté UP. Si el worker
  cae, el script imprime warn y continúa (no bloquea sin información).
- ⚠️ El guard solo detecta issues que el audit sabe contar. Si aparece
  un patrón nuevo de bug que no tiene check, pasa silenciosamente.
  Mitigación: cuando se cataloga un Bug Pattern nuevo, añadir su check
  al audit (lo hicimos para `cost_basis tipo='DIVIDENDS' AND shares>0`).
- 🔮 Cuando metamos GitHub Actions blocking (Semana 1 roadmap), mover
  el script a la pipeline CI para que ni siquiera el merge a main
  pueda pasar con regresión.

## Implementation

- `scripts/pre-deploy-check.sh` (103 líneas) — implementación completa
- `api/src/worker.js` — endpoint `/api/audit/full` con summary +
  issues categorizadas
- `api/src/lib/migrations.js` — checks individuales del audit (cost_basis
  consistency, dividendos shares=0+dps>1, positions vs IB drift, etc.)
- `.audit-baseline.json` (root) — snapshot committeado, actualizado
  cada deploy
- `CLAUDE.md` — sección "🚦 Pre-deploy guard"

Uso típico:
```bash
bash scripts/pre-deploy-check.sh && cd frontend && npm run build && \
  npx wrangler pages deploy dist --project-name=ayr --branch=production
```

Override (emergencia):
```bash
ALLOW_REGRESSION=1 bash scripts/pre-deploy-check.sh
```

## References

- Sesión que motivó: `session_2026-05-02_data_integrity.md` (bug AHRT)
- Roadmap: `docs/ROADMAP-PRO.md` — "Pre-deploy guard"
- Capa 3 Anti-Fallo: `CLAUDE.md` sección "Sistema Anti-Fallo"
- Related ADRs: ADR-0007 (data integrity rules), ADR-0008 (cron diario que también corre el audit), ADR-0001 (errors_log se incluye en audit summary)
