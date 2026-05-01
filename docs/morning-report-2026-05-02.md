# 🌅 Morning Report — Sesión Overnight 2026-05-02

> Buenos días. Mientras dormías corrí 7 agentes paralelos auditando todo. Aquí el resumen.

## ✅ Lo desplegado mientras dormías

### Seguridad (CRÍTICO)
- **12 endpoints WRITE protegidos con auth** — antes cualquiera del internet podía hacer POST/PUT/DELETE en:
  - `/api/dividendos/:id` (PUT, DELETE)
  - `/api/costbasis` (POST), `/api/costbasis/:id` (DELETE)
  - `/api/ingresos` (POST)
  - `/api/patrimonio` (POST), `/api/patrimonio/:id` (DELETE)
  - `/api/gastos` (POST), `/api/gastos/:id` (PUT, DELETE)
  - `/api/margin-interest` (POST)
  - `/api/ib-nlv-save` (POST)
  - Ahora todos requieren X-AYR-Auth o Bearer.

### D1 Schema integrity
- **418 documentos duplicados borrados** en `earnings_documents` (mismo accession_number importado 2-4 veces)
- **6 nuevos UNIQUE INDEXES** añadidos para prevenir dups futuros:
  - `idx_ed_accession`, `idx_patrimonio_fecha`, `idx_nlv_history_fecha`, `idx_cash_balances`, `idx_margin_interest`, `idx_transf_flex_id`
- **2 índices duplicados eliminados**: `idx_dividendos_fecha`, `idx_dividendos_ticker`
- DB: 61.4 MB → 61.2 MB

### Nueva feature: Tab "👥 Directiva"
- En cada empresa de tu portfolio, dentro del análisis (después de "Tesis")
- Muestra: CEO destacado, top-5 ejecutivos por compensación, tabla completa, badges de tenure (verde >5y / amarillo 2-5y / rojo <2y), insider buys/sells últimos 12 meses, AI assessment vía Claude Haiku
- Cache R2 30 días, refrescable con botón
- **Probado**: AAPL (Tim Cook, $40.9M comp, AI flag $83M insider selling), KO (Henrique Braun nuevo CEO, $9.6M)

### Cost Basis
- Columna **ID exec_id visible** (sufijo + tooltip completo) — cada fila ahora tiene su trazabilidad IB
- Tab **2ª pestaña** en cada empresa (junto a Resumen)
- API arquitectura **MERGE-on-READ** (no duplica entre cost_basis y dividendos)

### Open Options
- Filtro 60 días removido (LEAPs son válidos largo plazo)
- IB live = source of truth cuando bridge healthy
- TROW phantom legacy ticker borrado
- 22 posiciones reales (era 28 con ghosts)

### Code quality
- 5 silent catches → `console.error` añadido (visibilidad)
- 3 dead imports limpiados
- Cron `console.log` añadido para clean reconcile path

### Cron + Telegram
- 18 alert paths catalogadas
- `console.log` añadido para reconcile clean path (antes silencioso)
- `reentry-watch` integrado al cron diario

---

## ⚠️ Pendientes que necesitan TU decisión

### 1. 1,005 trades missing en D1 (HIGH)
Audit forensic encontró que faltan trades del Flex CSV en cost_basis:
| Año | Faltan |
|-----|-------:|
| 2020 | 9 |
| 2021 | 73 |
| 2022 | 42 |
| 2023 | 47 |
| 2024 | 55 |
| 2025 | **766** ⚠️ |
| 2026 | 13 |

Por cuenta: U7257686 (349), U5372268 (293), U6735130 (253), U7953378 (110)

**Causa probable**: durante imports anteriores algunos trades fallaron silenciosamente. Ahora con UNIQUE INDEX y dedup robusto, importarlos es seguro.

**Acción**: dame OK y aplico el INSERT bulk (impacto: cost_basis 12,055 → ~13,060). Tienes el SQL en `scripts/audit-4-fixes.sql` — actualmente solo tiene 31 UPDATEs (field mismatches), los 1,005 INSERTs los preparo si me das luz verde.

### 2. 31 field mismatches (MED)
Mismo exec_id en CSV y D1 pero shares/precio/coste distintos. Probable: cost_basis fue corregido a mano en algún momento. Decisión:
- **CSV wins**: aplicar UPDATEs — broker es fuente de verdad
- **D1 wins**: ignorar, mantener correcciones manuales

`scripts/audit-4-fixes.sql` tiene los UPDATEs listos.

### 3. sync-funds.sh broken desde Apr 20 (MED)
- Cron Mac falla con HTTP 401 — auth gate añadido entre Apr 17 y Apr 20
- Fix: añadir `-H "Authorization: Bearer $AYR_WORKER_TOKEN"` al curl
- Sin este fix, los datos 13F no se actualizan

### 4. IB Bridge devuelve 0 positions (HIGH)
- Bridge `ib_connected: true`, server version 193, 4 accounts attached
- Pero `/positions` devuelve 0 (después de restart)
- Por eso Open Options sigue usando cost_basis fallback (con ghosts ocasionales)
- Investigar mañana: posible bug en `reqPositions` con configuración multi-account

### 5. 16 IB_MAP gap candidates (LOW)
HK/foreign tickers que el IB_MAP no mapea (ej. 9988 = Alibaba HK). Sus trades se importan pero con ticker raw → el frontend no los reconoce. Lista en audit-4 report.

### 6. Mac cron `sync-flex.sh` redundante con CF cron (LOW)
Ambos corren a las 8:30am Madrid. La D1 dedup los maneja pero es ineficiente. Quitar entrada Mac crontab.

---

## 📊 Estado al cierre

| Tabla | Filas | $ |
|-------|------:|---|
| cost_basis (trades+options) | 12,054 | — |
| dividendos | 2,590 | $149K bruto |
| transferencias | 154 | $994K externas |
| positions (shares > 0) | 82 | — |
| open_trades (auto-sync) | 3 | RUTW BPS |
| earnings_documents | 4,088 | 928 con XBRL v2 |
| open_options view | 22 | $-888.53/día theta |

---

## 🎯 Resumen de decisiones que necesito de ti

1. **¿Aplicar INSERTs de los 1,005 trades faltantes?** (y/n)
2. **¿Aplicar UPDATEs de los 31 mismatches (CSV wins)?** (y/n)
3. **¿Quieres que arregle sync-funds.sh ahora?** (y/n)
4. **¿Investigamos el IB Bridge positions=0 hoy?** (y/n)

Respondes, y en 10 min está todo aplicado.

---

## 📁 Archivos generados

Reportes detallados:
- `/docs/audit-overnight-1-d1-schema-2026-05-02.md` (6.6 KB)
- `/docs/audit-overnight-2-api-ui-2026-05-02.md` (11.3 KB)
- `/docs/audit-overnight-3-backend-2026-05-02.md` (22.6 KB)
- `/docs/audit-overnight-4-ib-deep-2026-05-02.md` (8.6 KB)
- `/docs/audit-overnight-6-code-quality-2026-05-02.md` (12 KB)

SQL fixes pending:
- `/scripts/audit-1-fixes.sql` — 9 MED-risk dedups manual review
- `/scripts/audit-3-patches.txt` — todos aplicados ✅
- `/scripts/audit-4-fixes.sql` — 31 UPDATEs CSV→D1

Memoria persistente:
- `~/.claude/.../memory/session_2026-05-02_overnight.md` — log completo 14h
- `~/.claude/.../memory/architecture_rules_2026-05-02.md` — REGLAS DURAS data integrity
