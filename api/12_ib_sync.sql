-- IB Sync: Safe merge (shares update + new positions + LYB sold)

-- Step 1: Add 9 new positions from IB
INSERT OR IGNORE INTO holdings (ticker, shares, avg_cost, div_total, opciones_pl, sector, pais, divisa, activo, notas) VALUES ('ADP', 40.0, 210.1018, 0, 0, '', 'US', 'USD', 1, 'AUTOMATIC DATA PROCESSING');
INSERT OR IGNORE INTO holdings (ticker, shares, avg_cost, div_total, opciones_pl, sector, pais, divisa, activo, notas) VALUES ('AHRT', 3300.0, 7.976, 0, 0, '', 'US', 'USD', 1, 'AH REALTY TRUST INC');
INSERT OR IGNORE INTO holdings (ticker, shares, avg_cost, div_total, opciones_pl, sector, pais, divisa, activo, notas) VALUES ('BFICQ', 400.0, 5.829, 0, 0, '', 'US', 'USD', 1, 'BURGERFI INTERNATIONAL INC');
INSERT OR IGNORE INTO holdings (ticker, shares, avg_cost, div_total, opciones_pl, sector, pais, divisa, activo, notas) VALUES ('BX', 100.0, 104.31, 0, 0, '', 'US', 'USD', 1, 'BLACKSTONE INC');
INSERT OR IGNORE INTO holdings (ticker, shares, avg_cost, div_total, opciones_pl, sector, pais, divisa, activo, notas) VALUES ('KMB', 100.0, 99.54, 0, 0, '', 'US', 'USD', 1, 'KIMBERLY-CLARK CORP');
INSERT OR IGNORE INTO holdings (ticker, shares, avg_cost, div_total, opciones_pl, sector, pais, divisa, activo, notas) VALUES ('PEO', 0.0195, 25.61, 0, 0, '', 'US', 'USD', 1, 'ADAMS NATURAL RESOURCES FUND');
INSERT OR IGNORE INTO holdings (ticker, shares, avg_cost, div_total, opciones_pl, sector, pais, divisa, activo, notas) VALUES ('SPY', 2.0, 595.3106, 0, 0, '', 'US', 'USD', 1, 'SS SPDR S&P 500 ETF TRUST-US');
INSERT OR IGNORE INTO holdings (ticker, shares, avg_cost, div_total, opciones_pl, sector, pais, divisa, activo, notas) VALUES ('USA', 12.8657, 6.03, 0, 0, '', 'US', 'USD', 1, 'LIBERTY ALL STAR EQUITY FUND');
INSERT OR IGNORE INTO holdings (ticker, shares, avg_cost, div_total, opciones_pl, sector, pais, divisa, activo, notas) VALUES ('VOYG', 500.0, 12.768, 0, 0, '', 'CA', 'CAD', 1, 'VOYAGER DIGITAL LTD');

-- Step 2: Update shares from IB (keep Amparito's avg_cost)
UPDATE holdings SET shares=3600, updated_at=datetime('now') WHERE ticker='HKG:1910';
UPDATE holdings SET shares=1309, updated_at=datetime('now') WHERE ticker='HKG:9618';
UPDATE holdings SET shares=1000, updated_at=datetime('now') WHERE ticker='FLO';
UPDATE holdings SET shares=250, updated_at=datetime('now') WHERE ticker='HEN3';
UPDATE holdings SET shares=600, updated_at=datetime('now') WHERE ticker='NVO';
UPDATE holdings SET shares=395.6, updated_at=datetime('now') WHERE ticker='OBDC';
UPDATE holdings SET shares=1300, updated_at=datetime('now') WHERE ticker='OWL';
UPDATE holdings SET shares=419.5, updated_at=datetime('now') WHERE ticker='RYN';
UPDATE holdings SET shares=308, updated_at=datetime('now') WHERE ticker='BME:VIS';

-- Step 3: Mark LYB as sold
UPDATE holdings SET activo=0, shares=0, notas=COALESCE(notas,'') || ' [Vendida 2026-03]', updated_at=datetime('now') WHERE ticker='LYB';

-- Verify
-- SELECT COUNT(*) as total, SUM(CASE WHEN activo=1 THEN 1 ELSE 0 END) as active FROM holdings;
