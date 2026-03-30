-- Add estrategia and categoria columns
ALTER TABLE holdings ADD COLUMN estrategia TEXT DEFAULT '';
ALTER TABLE holdings ADD COLUMN categoria TEXT DEFAULT '';

-- Populate from known data (POS_STATIC tags)
UPDATE holdings SET estrategia='GORKA' WHERE ticker IN ('ACN','AZJ','BME:VIS','DEO','ENG','GIS','GPC','GQG','HEN3','HKG:1052','HKG:1910','HKG:2219','HGK:9616','HKG:9618');
UPDATE holdings SET estrategia='YO' WHERE ticker IN ('BIZD','CAG','CMCSA','CPB','DIDIY','EMN','FLO','PATH','PYPL','WEN','XYZ');
UPDATE holdings SET estrategia='LANDLORD' WHERE ticker IN ('ARE','CLPR','CUBE','CZR','HR','IIPR','IIPR-PRA','KRG','LANDP','MDV','NNN','O','REXR','RHI','SAFE','SUI','VICI','WPC','RICK','NET.UN','AHRT','RYN');

-- Populate categoria
UPDATE holdings SET categoria='REIT' WHERE ticker IN ('ARE','CLPR','CZR','HR','IIPR','IIPR-PRA','KRG','LANDP','MDV','NNN','O','REXR','SAFE','SUI','VICI','WPC','AHRT','RYN','NET.UN');
UPDATE holdings SET categoria='ETF' WHERE ticker IN ('BIZD','SCHD','SPHD','SPY','YYY','WEEL');
UPDATE holdings SET categoria='CEF' WHERE ticker IN ('PEO','USA');
UPDATE holdings SET categoria='COMPANY' WHERE categoria='' OR categoria IS NULL;
