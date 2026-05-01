-- ─────────────────────────────────────────────────────────────────
-- Audit A · Fixes para inconsistencias en `dividendos` (2026-05-02)
-- Ver `docs/audit-A-divs-consistency-2026-05-02.md` para análisis
-- ─────────────────────────────────────────────────────────────────
--
-- Aplicar con:
--   cd api && npx wrangler d1 execute aar-finanzas --remote --file=../scripts/audit-A-fixes.sql
--
-- Ejecuta en orden. Cada bloque es idempotente (puede correrse 2 veces sin daño).
-- Probado con SELECTs primero — comentadas las UPDATEs riesgosas.

-- ════════════════════════════════════════════════════════════════
-- B1 SAFE — rellenar bruto cuando bruto=0 pero neto>0
-- 777 filas afectadas. Impacto: +$2 345 USD totales históricos.
-- Asume bruto = neto (best proxy, los originales venían sin gross
-- por bug del aggregator viejo). Se backfillea bruto_usd = neto_usd.
-- ════════════════════════════════════════════════════════════════

-- VERIFICAR antes:
-- SELECT COUNT(*) AS n, ROUND(SUM(neto),2) AS impact
--   FROM dividendos WHERE bruto = 0 AND neto > 0;

UPDATE dividendos
SET bruto = neto,
    bruto_usd = CASE
      WHEN divisa = 'USD' THEN neto
      ELSE neto * COALESCE(fx_to_usd, 1)
    END
WHERE bruto = 0 AND neto > 0;

-- VERIFICAR después:
-- SELECT COUNT(*) AS n_remaining FROM dividendos WHERE bruto = 0 AND neto > 0;
-- Esperado: 0


-- ════════════════════════════════════════════════════════════════
-- B2 SAFE — recalcular wht_amount cuando hay over-attribution
-- En filas duplicadas misma fecha+ticker, el wht_amount se atribuye
-- a TODAS aunque sólo aplica a una. Reseteamos a (bruto - neto)
-- por fila individual.
-- ════════════════════════════════════════════════════════════════

-- VERIFICAR antes:
-- SELECT COUNT(*) AS rows, ROUND(SUM(wht_amount - (bruto-neto)),2) AS overage
-- FROM dividendos WHERE bruto > neto AND ABS(wht_amount - (bruto-neto)) > 0.05;

UPDATE dividendos
SET wht_amount = ROUND((bruto - neto) * 100) / 100,
    wht_rate = CASE
      WHEN bruto > 0 THEN ROUND((bruto - neto) / bruto * 10000) / 10000
      ELSE 0
    END
WHERE bruto > 0
  AND neto >= 0
  AND ABS(COALESCE(wht_amount, 0) - (bruto - neto)) > 0.05;

-- VERIFICAR después:
-- SELECT ROUND(SUM(wht_amount),2) AS wht_field, ROUND(SUM(bruto-neto),2) AS calc
-- FROM dividendos WHERE bruto > 0 AND fecha LIKE '2025%';
-- Esperado: ambos números próximos (~$4 321).


-- ════════════════════════════════════════════════════════════════
-- B3 RISKY — ticker mapping duplicates
-- AHH ↔ AHRT (Armada Hoffler Properties): 7 pares, $1 502 over-counted.
-- BME:VIS ↔ VIS.D (Viscofan): 1 par, €29.66.
-- NO EJECUTAR sin decisión usuario sobre ticker preferido.
-- Comentado por defecto.
-- ════════════════════════════════════════════════════════════════

-- VERIFICAR cuáles son los pares actuales:
-- SELECT a.id AS id_a, a.fecha, a.ticker AS t_a, b.id AS id_b, b.ticker AS t_b, a.bruto, a.account AS acct_a, b.account AS acct_b, a.notas AS notas_a, b.notas AS notas_b
-- FROM dividendos a JOIN dividendos b ON a.fecha=b.fecha AND ABS(a.bruto-b.bruto)<0.05 AND a.bruto>0 AND a.id<b.id
-- WHERE (a.ticker='AHH' AND b.ticker='AHRT') OR (a.ticker='AHRT' AND b.ticker='AHH')
--    OR (a.ticker='BME:VIS' AND b.ticker='VIS.D') OR (a.ticker='VIS.D' AND b.ticker='BME:VIS');

-- Estrategia recomendada: borrar la fila de account=NULL "migrated from cost_basis"
-- y mantener la de account real (U6735130).

-- DELETE FROM dividendos WHERE id IN (
--   SELECT a.id FROM dividendos a JOIN dividendos b
--     ON a.fecha=b.fecha AND ABS(a.bruto-b.bruto)<0.05 AND a.bruto>0
--   WHERE (a.ticker='AHRT' AND b.ticker='AHH' AND a.account IS NULL AND b.account IS NOT NULL)
-- );

-- DELETE FROM dividendos WHERE id IN (
--   SELECT b.id FROM dividendos a JOIN dividendos b
--     ON a.fecha=b.fecha AND ABS(a.bruto-b.bruto)<0.05 AND a.bruto>0 AND a.id<b.id
--   WHERE (a.ticker='BME:VIS' AND b.ticker='VIS.D')
-- );


-- ════════════════════════════════════════════════════════════════
-- B4 RISKY — recalcular positions.div_ttm desde actual TTM observado
-- Actualmente div_ttm = FMP DPS estimate. Una alternativa es usar
-- el observed-TTM dividido por shares como cifra "real". Hace que
-- la cifra de cartera muestre lo que IB DE VERDAD pagó vs lo
-- proyectado por FMP. NO EJECUTAR sin alinear con UI semantics.
-- ════════════════════════════════════════════════════════════════

-- VERIFICAR cómo cambiaría:
-- SELECT p.ticker, p.shares, ROUND(p.div_ttm,4) AS dps_fmp,
--        ROUND(COALESCE((SELECT SUM(d.bruto) FROM dividendos d
--          WHERE d.ticker=p.ticker AND d.fecha >= date('now','-365 days')),0)/NULLIF(p.shares,0),4) AS dps_observed,
--        ROUND(p.div_ttm * p.shares, 2) AS expected_total,
--        ROUND(COALESCE((SELECT SUM(d.bruto) FROM dividendos d
--          WHERE d.ticker=p.ticker AND d.fecha >= date('now','-365 days')),0),2) AS actual_total
-- FROM positions p
-- WHERE p.shares > 0 AND p.div_ttm > 0
-- ORDER BY (p.div_ttm * p.shares) DESC;

-- UPDATE positions
-- SET div_ttm = COALESCE(
--   (SELECT SUM(d.bruto) / NULLIF(positions.shares, 0)
--    FROM dividendos d
--    WHERE d.ticker = positions.ticker
--      AND d.fecha >= date('now','-365 days')), 0)
-- WHERE shares > 0;


-- ════════════════════════════════════════════════════════════════
-- B5 INFO — backfill account=NULL en `dividendos` desde IB Flex
-- 1 658 filas, requiere re-importar IB Flex 365d con accountId enabled.
-- Pendiente conocido en CLAUDE.md. NO se puede arreglar via SQL puro.
-- ════════════════════════════════════════════════════════════════

-- Snapshot del problema:
-- SELECT broker, COUNT(*) AS n, ROUND(SUM(bruto_usd),2) AS bruto_usd
-- FROM dividendos WHERE account IS NULL GROUP BY broker;


-- ════════════════════════════════════════════════════════════════
-- POST-FIX VALIDATION (correr después de ejecutar B1+B2)
-- ════════════════════════════════════════════════════════════════

-- Total bruto USD 2025 esperado +$652 vs antes:
-- SELECT 'after-fix-2025' AS k, ROUND(SUM(CASE WHEN bruto_usd > 0 THEN bruto_usd ELSE bruto END),2) AS total
-- FROM dividendos WHERE fecha LIKE '2025%';
-- Antes B1: $68 173.12 | Después B1: ~$68 825.39

-- Mensual 2025-02 esperado neto ≤ bruto:
-- SELECT substr(fecha,1,7) AS mes, ROUND(SUM(bruto),2) AS bruto, ROUND(SUM(neto),2) AS neto
-- FROM dividendos WHERE fecha LIKE '2025-02%' GROUP BY mes;

-- WHT consistency ≈ 0:
-- SELECT ROUND(SUM(bruto-neto),2) AS calc, ROUND(SUM(wht_amount),2) AS field,
--        ROUND(SUM(bruto-neto)-SUM(wht_amount),2) AS gap
-- FROM dividendos WHERE fecha LIKE '2025%' AND bruto > 0;
