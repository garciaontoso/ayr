# ADR-0007: MERGE en READ no en WRITE para vistas combinadas

**Status**: Accepted
**Date**: 2026-05-03
**Decided by**: ricardo + claude (sesión 2026-05-02 Data Integrity Overhaul)

## Context

A&R guarda datos financieros en cuatro tablas D1 canonical:

- `cost_basis` — trades EQUITY/OPTION (compras y ventas)
- `dividendos` — dividendos cobrados (importados via Flex CSV o detectados
  en cashflow IB)
- `transferencias` — bank ↔ broker externas
- `positions` — snapshot actual desde IB live

Hubo una tentación recurrente de **sincronizar en disco** las vistas
combinadas. El ejemplo más doloroso fue `/api/costbasis/sync-dividends`:
endpoint que tomaba filas de `dividendos` y las INSERTaba en `cost_basis`
con `tipo='DIVIDENDS'` para que la vista "histórico del ticker" tuviera
todo en una tabla.

Resultados de esa estrategia:
- **9,124 filas phantom** en `cost_basis` (21,882 → 12,758 tras dedup
  el 2026-05-02). El sync-dividends recreaba duplicados cada ejecución.
- **Bug Pattern #002** (PG 250 vs 150 shares): el cálculo de shares leía
  `_totalShares` running balance que incluía las filas DIVIDENDS, dando
  números incorrectos.
- **Bug Pattern #011**: filas `tipo='DIVIDENDS'` con `shares > 0` confundieron
  PortfolioComputed que las leyó como buys.
- **Bug AHRT $64K**: el cbCalc tenía fallback "totalShares de la última
  fila" que con DIVIDENDS+EQUITY mezclados explotó a 1,995 → 64,692.

La causa raíz no es solo "ese endpoint era buggy", es **arquitectónica**:
si dos tablas son canonical y duplicas datos entre ellas, una desincronización
es cuestión de tiempo. Es el equivalente CRUD del "single source of truth".

## Alternatives Considered

| Opción | Pros | Cons |
|---|---|---|
| Mantener tablas duplicadas + sync periódico (status quo previo) | Lectura simple (un `SELECT *`) | 9,124 phantoms, bugs recurrentes, cron que se rompe = drift; doble fuente de verdad |
| Vista materializada D1 | Performante para reads | D1 no soporta vistas materializadas todavía |
| MERGE en READ time (JOIN al servir) | Single source of truth, imposible drift, fix permanente | Costo adicional por query (mitigado con índices) |
| Tabla de eventos universal (event sourcing) | Audit trail completo | Refactor enorme; no justificado para nuestro tamaño |

## Decision

**MERGE en READ, no en WRITE.**

Reglas concretas:

1. **Tablas canonical, no se duplican datos entre ellas:**
   - `cost_basis` = SOLO trades EQUITY/OPTION. **NUNCA** `tipo='DIVIDENDS'`.
   - `dividendos` = canonical para divs cobrados.
   - `transferencias` = SOLO externas (bank ↔ broker), no internal IB-IB.
2. **Si una vista necesita combinar fuentes**, JOIN al servir:
   - `/api/costbasis` ahora hace `LEFT JOIN dividendos ON ticker=ticker`
     y devuelve un campo `divs_total` calculado. NO inserta filas.
3. **`/api/costbasis/sync-dividends` está DEPRECATED**:
   convertido a no-op que devuelve `{ deprecated: true, reason: '...' }`.
4. **Antes de `bulk INSERT` o `UPDATE`**, validar count:
   - `SELECT COUNT(*) FROM target WHERE ...` antes y después.
   - Si magnitud > 100, script con flag `--dry-run` previo.
5. **Validación de divs**: rechazar `shares=0 AND dps>1.0` en `dividendos`
   (siempre bug de extracción Flex).

## Consequences

- ✅ Imposible volver a tener 9,000 phantoms — no hay un mecanismo que
  los CREE.
- ✅ Cualquier nueva vista que combine cost_basis + dividendos +
  transferencias se hace JOIN, sin tocar disco.
- ✅ Audit `/api/audit/full` puede asumir cada tabla es canonical y
  compararlas externamente sin "self-conflict".
- ⚠️ Las queries con JOIN son más caras que un `SELECT *` simple.
  Mitigación: índices en `(ticker, date)` y `(ticker, ex_date)`. Latencia
  medida 2026-05-02: <80ms para portfolio completo.
- ⚠️ Onboarding mental para futuras sesiones: la regla "no insertar en
  cost_basis salvo trades EQUITY/OPT" hay que repetirla. Mitigación:
  documentado en `CLAUDE.md` ("REGLAS DURAS DE DATA INTEGRITY") + en
  este ADR.
- 🔮 Si D1 implementa vistas materializadas y la latencia JOIN se vuelve
  problema (>200ms p99), considerar MV. La regla de "no INSERT
  cross-table" sigue aplicando.

## Implementation

- `api/src/worker.js` — endpoint `/api/costbasis` (JOIN dividendos al
  servir), endpoint `/api/costbasis/sync-dividends` (no-op deprecated)
- `api/src/lib/migrations.js` — `UNIQUE INDEX` en
  `cost_basis (exec_id)` para impedir reinserciones (post 2026-05-02
  dedup massivo)
- `frontend/src/App.jsx` líneas 740-790 — `PortfolioComputed` filtra
  `tipo NOT IN ('DIVIDENDS','DIVIDEND','DIV')` antes de sumar shares
  (Bug #011 prevention)
- `CLAUDE.md` — sección "REGLAS DURAS DE DATA INTEGRITY"
- `docs/architecture_rules_2026-05-02.md` — documento detallado
  (referido desde memoria persistente del usuario)

## References

- Bugs que motivaron: `docs/bug-patterns.md` #002 (shares mismatch), #011
  (DIVIDENDS rows en cost_basis)
- Sesiones master: `session_2026-05-02_data_integrity.md`,
  `session_2026-05-02_overnight.md`,
  `session_2026-05-02_FINAL_overnight.md`
- Related ADRs: ADR-0009 (audit baseline detecta drifts entre tablas), ADR-0001 (error-log para alertar si phantoms reaparecen)
