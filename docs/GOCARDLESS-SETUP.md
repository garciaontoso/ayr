# GoCardless Bank Account Data — Setup Guide

Integración Open Banking PSD2 para sincronizar gastos automáticamente desde bancos europeos (Revolut, Bankinter, CbNK, BBVA, Santander, N26, etc.) sin necesidad de export CSV manual.

## Por qué GoCardless

- **2.500+ bancos europeos cubiertos** vía PSD2 (incluye Revolut Personal, Bankinter, CbNK)
- **Real-time / diario**: sync automático cada 24h en cron de A&R
- **Free tier**: gratis 90 días por consent, renovable infinitamente con 1 click cada 3 meses
- **OAuth bancario seguro**: tú autorizas en la app de tu banco, A&R nunca ve passwords

## Setup (10-15 min, una sola vez)

### Paso 1 — Crear cuenta developer GoCardless

1. Ve a [bankaccountdata.gocardless.com](https://bankaccountdata.gocardless.com)
2. **Sign Up** con tu email
3. Verifica el email
4. Login

### Paso 2 — Generar API credentials

1. Dentro del dashboard → **Developers** → **User secrets**
2. Click **"Create new secret pair"**
3. Apunta:
   - **secret_id** (UUID tipo `abc12345-...`)
   - **secret_key** (string larga `XYZ...`)
4. **Guárdalas bien** — la `secret_key` solo se muestra una vez

### Paso 3 — Configurar wrangler secrets en A&R

En tu Mac:

```bash
cd /Users/ricardogarciaontoso/IA/AyR/api

# Pega el secret_id cuando pida input
npx wrangler secret put GOCARDLESS_SECRET_ID

# Pega el secret_key cuando pida input
npx wrangler secret put GOCARDLESS_SECRET_KEY
```

### Paso 4 — Verificar configuración

```bash
source ~/.ayr-env
curl -s "https://api.onto-so.com/api/gocardless/banks?country=ES" \
  -H "Origin: https://ayr.onto-so.com" \
  -H "X-AYR-Auth: $AYR_WORKER_TOKEN" | head -c 500
```

Debe devolver un array de bancos españoles (Revolut, Bankinter, BBVA, Santander, etc.). Si devuelve `{"error":"GOCARDLESS_SECRET_ID/KEY not configured"}`, los secrets no se aplicaron — espera 30s y reintenta.

### Paso 5 — Conectar tu primer banco desde la app

1. Abre [ayr.onto-so.com](https://ayr.onto-so.com)
2. Tab **💸 Gastos** (grupo Cartera)
3. Click **🏦 Conectar Banco**
4. Modal abre con bancos de España (puedes cambiar país arriba)
5. Busca "Revolut" o "Bankinter" → click
6. Se abre ventana nueva con OAuth de tu banco
7. Apruebas en tu app del banco
8. Vuelves a A&R → verás "Conectado ✓"

### Paso 6 — Primer sync manual

En el modal "Conectar Banco" verás la sección **"Conexiones activas"**:

1. Click **↻ Sync** en cada banco conectado
2. Te dice "✓ X transacciones nuevas"
3. Las nuevas transacciones aparecen en la tabla de Gastos

Después, el cron diario (08:00 UTC) sincroniza automáticamente.

---

## Renovación cada 90 días

El consent bancario PSD2 **expira a los 90 días** por regulación europea. A&R te avisará vía Telegram:

```
🏦 GoCardless: Consents próximos a expirar
· Revolut: 2026-08-13
· Bankinter: 2026-08-15
Renueva en: ayr.onto-so.com → Gastos → Conectar Banco
```

Para renovar: simplemente conectas el banco de nuevo (1 click + OAuth). El consent viejo se sobreescribe con uno nuevo de 90 días más.

---

## Arquitectura técnica

### Endpoints

| Endpoint | Método | Función |
|---|---|---|
| `/api/gocardless/banks?country=XX` | GET | Lista bancos disponibles por país |
| `/api/gocardless/init-consent` | POST | Crea EUA + Requisition, devuelve link OAuth |
| `/api/gocardless/callback?ref=X` | GET | Tras OAuth bancario, obtiene accounts |
| `/api/gocardless/consents` | GET | Lista consents activos en D1 |
| `/api/gocardless/sync` | POST | Pulla transactions de todas las cuentas |
| `/api/gocardless/consent/:id` | DELETE | Revoca consent en GoCardless + D1 |

### Tablas D1

**`gocardless_consents`**:
- `requisition_id` (PK external) — UUID de GoCardless
- `institution_id` — ID del banco (e.g. `REVOLUT_REVOGB21`)
- `bank_label`, `institution_name`
- `accounts_json` — array de account_ids tras OAuth
- `status` — `pending` / `LINKED` / `EXPIRED` / `REVOKED`
- `expires_at` — fecha vencimiento consent
- `last_sync_at`, `last_sync_count` — telemetría sync

**`gocardless_transactions`**:
- `transaction_id` (UNIQUE) — ID de transacción de GoCardless (dedup)
- `account_id` — refer to consent
- `booking_date`, `value_date`, `amount`, `currency`
- `creditor_name`, `debtor_name`, `remittance_info`
- `raw_json` — payload completo (auditoría)
- `gasto_id` — FK opcional a tabla `gastos` (cuando se mapea)

### Cron sincronización

Integrado en cron `0 8 * * *` (audit cron diario, 08:00 UTC):

1. Tras audit + phantom check, llama a `/api/gocardless/sync` con `days_back=7`
2. Pulla transactions de últimos 7 días de TODAS las cuentas linked
3. Dedupe vía UNIQUE INDEX en `transaction_id`
4. Check de consents expirando en próximos 10 días → Telegram alert

### Token caching

`access_token` (24h validez) se cachea en `agent_memory` table key `gocardless_access_token`. Refresh automático antes de expirar.

---

## Free tier / pricing

- **Free**: 100 cuentas conectadas, 4 requests/cuenta/día
- **Pricing oficial**: ~€0.05/sync después del free tier
- **Truco**: si renuevas consent cada 90 días, el contador se resetea → **siempre gratis**

Para tu uso (4 bancos × 1 sync/día = 4 requests/día × 30 = 120 requests/mes) estás **muy lejos** de cualquier límite. Free siempre.

---

## Troubleshooting

### "GOCARDLESS_SECRET_ID/KEY not configured"
Ejecutar paso 3 de nuevo. Verifica con:
```bash
cd api && npx wrangler secret list | grep GOCARDLESS
```

### Mi banco no aparece en la lista
- Verifica el dropdown de país (arriba del modal)
- Busca por BIC en lugar de nombre
- Si realmente no está, contactar a GoCardless support (suelen añadirlo en 1-2 semanas)

### Consent quedó en "pending" tras OAuth
- Posiblemente cerraste la ventana antes de completar
- Pulsa "Revocar" en el consent pending y conecta de nuevo

### Sync devuelve 0 inserted
- Normal si ya tienes las transacciones (dedup por `transaction_id`)
- Si nunca ha funcionado: verifica `accounts_json` no está vacío en D1 (run callback de nuevo)

### Telegram alert "consents próximos a expirar"
- Conecta el banco de nuevo (1 click + OAuth) → consent nuevo 90 días
- Ignora si no vas a usar más esa conexión → ejecuta DELETE

---

## Referencias

- [GoCardless Bank Account Data Docs](https://developer.gocardless.com/bank-account-data/)
- [GoCardless API Reference](https://bankaccountdata.gocardless.com/api/docs/)
- [PSD2 Regulación EU](https://eur-lex.europa.eu/eli/dir/2015/2366)

---

## Estado actual

- ✅ Backend endpoints desplegados (worker version visible en `wrangler deploy`)
- ✅ Frontend UI en GastosTab → "🏦 Conectar Banco"
- ✅ Cron daily sync en 08:00 UTC
- ✅ Telegram alerts: phantom + consent expiry
- ⏳ **Usuario debe**: crear cuenta GoCardless + wrangler secrets (paso 1-3)
- ⏳ Después: conectar bancos via UI
