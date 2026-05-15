# Spendee → A&R Email Auto-Import

Configuración para que los gastos exportados desde Spendee lleguen automáticamente a A&R sin clicks tuyos.

## Cómo funciona

```
Tu Spendee app (con Revolut + Bankinter + CbNK consolidados)
   ↓ (export → CSV adjunto a info@spendee.com)
Tu iCloud Mail
   ↓ (forward rule)
gastos@ayr.onto-so.com
   ↓ (Cloudflare Email Routing → Email Worker)
Parser Spendee CSV (auto-mapping categorías)
   ↓
D1 tabla `gastos`
   ↓
Telegram: "✓ 47 gastos nuevos importados de Spendee"
```

---

## Setup (15-20 min, una sola vez)

### **PASO 1 — Cloudflare Dashboard: activar Email Routing** (5 min)

1. Login en [dash.cloudflare.com](https://dash.cloudflare.com)
2. Selecciona el dominio **`onto-so.com`** (o `ayr.onto-so.com` zona)
3. Menú izquierdo → **Email** → **Email Routing**
4. Si está deshabilitado: click **Enable Email Routing**
5. Cloudflare añade automáticamente los **MX records** + SPF + DKIM (acepta la confirmación)
6. **Routes** tab → click **Add address**:
   - **Custom address**: `gastos@ayr.onto-so.com` (o `gastos@onto-so.com`)
   - **Action**: Send to a Worker
   - **Destination**: selecciona `aar-api` (el Worker existente)
   - **Save**

### **PASO 2 — Verificar Email Worker está bound al route**

En el Worker:
- Cloudflare Dashboard → Workers & Pages → `aar-api` → Triggers tab
- Sección **Email Triggers** debe aparecer con la address configurada arriba
- Si no aparece, vuelve al paso 1 y verifica el "Destination: Worker = aar-api"

### **PASO 3 — Test manual con CSV ejemplo**

Antes de configurar el forward de iCloud, prueba que el endpoint funciona:

```bash
source ~/.ayr-env
curl -X POST "https://api.onto-so.com/api/gastos/import-spendee" \
  -H "X-AYR-Auth: $AYR_WORKER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"csv":"Date,Wallet,Type,Category,Amount,Currency,Note\n2026-05-15,Revolut,Expense,Groceries,-15.00,EUR,Test Mercadona"}'
```

Debe devolver `{"imported":1,"skipped":0,...}`. Si sí, el parser funciona. Si error, revisa los logs del worker.

### **PASO 4 — iCloud Mail: regla de forward** (5 min)

1. Ve a [icloud.com/mail](https://www.icloud.com/mail)
2. Esquina superior izquierda → **⚙ Settings (engranaje)** → **Rules**
3. **Add Rule** (Añadir regla):
   - **If a message is from**: `info@spendee.com`
   - **Then**: **Forward to** → `gastos@ayr.onto-so.com`
   - Opcional: **And** delete after forward (si no quieres dejar copia en iCloud)
4. **Save**

⚠ **Importante**: iCloud requiere que la dirección de forward esté **verificada**. Cloudflare envía un email de verificación a `gastos@ayr.onto-so.com` la primera vez — el Email Worker tiene que reenviarlo a tu Gmail o procesarlo manualmente.

**Workaround si iCloud no permite forward sin verificación**:
1. Configura primero un forward en CF Email Routing: `gastos@ayr.onto-so.com` → **también** envía a tu Gmail
2. Cuando iCloud mande la verificación, llega a tu Gmail
3. Verificas
4. Después puedes quitar el forward a Gmail si quieres

### **PASO 5 — Test end-to-end**

1. Abre **Spendee móvil** → Settings → **Export** → CSV → "Send to my email"
2. Espera 1-2 min — llega el email a tu iCloud
3. iCloud forwarda → Cloudflare Email Worker → Parser → D1
4. Recibes Telegram: *"📧 Spendee CSV procesado: ✓ X gastos nuevos importados"*
5. Verifica en A&R → 💸 Gastos que aparezcan los nuevos

---

## Workflow tu día a día (cuando funciona)

**Opción A — Manual mensual** (probable para Spendee free):
- Cada mes abres Spendee → Export → CSV → Send to email
- El resto es automático: iCloud → A&R → Telegram

**Opción B — Auto-export programado** (si tienes Spendee Premium):
- Spendee Settings → Scheduled exports → Monthly / Weekly
- Cero clicks tuyos

---

## Troubleshooting

### "Sender not authorized" en logs
El Email Worker rechaza emails que no vengan de `*@spendee.com`. Verifica:
- ¿El email original viene de `info@spendee.com`? ¿O viene de un alias diferente?
- Si Spendee usa otro sender (ej `noreply@spendee.io`), añadir al `ALLOWED_SENDERS` en `email()` handler del worker

### "No CSV attachment found"
- ¿Realmente exportaste como CSV? Spendee puede exportar también XLSX o PDF
- Si solo XLSX disponible: hay que adaptar el parser

### "imported: 0"
- Ya estaban todos importados (dedup por fecha+categoría+importe+divisa)
- O todos eran ingresos/transferencias (que se ignoran intencionalmente)

### Email no llega al worker
- Verifica MX records en CF Dashboard → DNS → MX
- Verifica Email Routing rule está active
- Test enviando email manual a `gastos@ayr.onto-so.com` desde tu Gmail/iCloud

### iCloud rechaza el forward
Apple requiere que la dirección destino sea válida y responda. Cloudflare Email Workers SÍ responde con código 250 (acepted). Si falla:
- Confirma el rule en iCloud está bien guardado
- Verifica en CF Email Routing que aparece tráfico en "Email Activity"
- Si todo falla, usa Gmail como intermediario:
  - iCloud → Gmail (mediante "auto-forward" en iCloud)
  - Gmail rule → forward a `gastos@ayr.onto-so.com`

---

## Arquitectura técnica

### Endpoint
- `POST /api/gastos/import-spendee` (auth: ytRequireToken)
- Body: `{ csv: "Date,Wallet,...\n..." }`
- Returns: `{ imported, skipped, duplicates, ingresos_ignorados, samples, source: 'spendee' }`

### Email handler (en `worker.js` export default)
- `async email(message, env, ctx)`
- Allowlist sender: `*@spendee.com`
- Parse RFC822 raw email para extraer CSV adjunto (base64 decode)
- Llama internamente a `/api/gastos/import-spendee`
- Telegram alert con resultado

### Parser features
- Auto-detect columns por header (no hardcoded indices)
- Detecta separador CSV `,` o `;`
- Maneja fechas YYYY-MM-DD y DD/MM/YYYY
- Maneja amount con `,` o `.` decimal
- Mapping ~40 categorías ES/EN → A&R 13 categorías
- Skip income (positive amounts o type=Income)
- Skip transferencias internas (To Interactive Brokers, To Revolut, Exchanged, etc.)
- Dedup contra `gastos` table por fecha+categoría+importe+divisa
- China detection: si wallet contiene 'china' → `lugar_tag='china'`
- Apply learned rules: si has corregido manualmente categoría antes, las próximas auto-detectan

### Categorías mapeadas Spendee → A&R
| Spendee category | A&R |
|---|---|
| Food & Drinks / Restaurants / Cafe / Bars / Comidas | COM |
| Groceries / Supermarket / Supermercado | SUP |
| Transport / Taxi / Uber / Gas / Fuel / Train / Flight | TRA |
| Health / Healthcare / Pharmacy / Doctor | HEA |
| Clothing / Fashion / Shoes | ROP |
| Subscriptions / Streaming / Apps | SUB |
| Entertainment / Shopping / Caprichos | CAP |
| Sports / Fitness / Gym / Hobby | DEP |
| Utilities / Bills / Electricity / Water / Internet | UTI |
| Education / Courses / Books | EDU |
| Gifts / Regalos | REG |
| Sin match → | OTH |

---

## Estado actual

- ✅ Endpoint `/api/gastos/import-spendee` desplegado y testeado (worker version `c8a21d04`)
- ✅ Email handler en worker desplegado
- ⏳ **Pendiente USER**: configurar Email Routing en CF Dashboard (paso 1-2)
- ⏳ **Pendiente USER**: configurar regla forward en iCloud (paso 4)
- ⏳ **Pendiente USER**: test end-to-end (paso 5)
