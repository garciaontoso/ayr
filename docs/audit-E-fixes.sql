-- audit-E-fixes.sql — Patrimonio + nlv_history + transferencias fixes
-- Generated 2026-05-02 by audit-E
-- Apply manually with `npx wrangler d1 execute aar-finanzas --remote --file=audit-E-fixes.sql`
-- Each block is independent; comment out what you don't want.

-- ===========================================================
-- A) Eliminar 2 transferencias duplicadas (flex_id sintético)
-- ===========================================================
-- Estas 2 filas vienen del Flex import sin TransactionID real (placeholder "--<importe>").
-- Existe un row "real" para misma fecha/importe/account; el sintético es duplicate.

DELETE FROM transferencias
 WHERE flex_id = '--8500'
   AND fecha   = '2025-10-24'
   AND importe = 8500
   AND account_id IS NULL;

DELETE FROM transferencias
 WHERE flex_id = '--6000'
   AND fecha   = '2025-12-23'
   AND importe = 6000
   AND account_id IS NULL;

-- ===========================================================
-- B) Fix bug de signo hipoteca el 2023-09-01
-- ===========================================================
-- En esta única fila la columna hipoteca es +122037 (positiva), todas las demás filas
-- de 2022-2023 tienen hipoteca negativa ~-126K. Bug de captura manual.

UPDATE patrimonio
   SET hipoteca = -122037,
       updated_at = datetime('now')
 WHERE fecha = '2023-09-01'
   AND hipoteca = 122037;

-- ===========================================================
-- C) (OPCIONAL — comentado) Interpolar gaps en nlv_history
-- ===========================================================
-- 3 días laborables sin row. Si prefieres preservar el "gap" como evidencia de cron
-- caído, NO ejecutes esto. Si prefieres una serie continua para charts, descomenta.
-- Valores = avg lineal de día anterior y siguiente.
--
-- 2026-04-07 (Tue): avg(04-06=1,315,312.60, 04-08=1,338,954.80) = 1,327,133.70
-- 2026-04-10 (Fri): avg(04-09=1,340,742.07, 04-11=1,299,805.08) = 1,320,273.58
-- 2026-04-27 (Mon): avg(04-25=1,383,911.35, 04-28=1,392,075.45) = 1,387,993.40

-- INSERT OR REPLACE INTO nlv_history (fecha, nlv, cash, positions_value, margin_used, accounts, positions_count, buying_power)
-- VALUES
--   ('2026-04-07', 1327133.70, -52606.61, 1388508.34, 0, 4, 0, 0),
--   ('2026-04-10', 1320273.58, -52954.82, 1383439.98, 0, 4, 0, 0),
--   ('2026-04-27', 1387993.40, -715.21,   1398719.13, 0, 4, 0, 0);

-- ===========================================================
-- D) (OPCIONAL — comentado) Reemplazar outlier 2026-04-21
-- ===========================================================
-- NLV $1,164,685 vs vecinos ~$1,360-1,390K. Drop -16% solo ese día.
-- Hipótesis: una de las 4 cuentas no respondió al snapshot.
-- Reemplazo = avg de 04-20 y 04-22 = (1,362,163.75 + 1,391,261.28)/2 = 1,376,712.51
-- Si quieres preservar el histórico tal cual, NO ejecutes.

-- UPDATE nlv_history
--    SET nlv = 1376712.51,
--        cash = -23752.18,
--        positions_value = 1404818.12
--  WHERE fecha = '2026-04-21'
--    AND nlv < 1200000;
