# Tastytrade Bridge

HTTP bridge entre A&R Cloudflare Worker y la API de Tastytrade.

**Por qué existe:** Tastytrade WAF bloquea las IPs de Cloudflare Workers (devuelve `nginx 401` en cualquier endpoint, incluyendo `/`). El bridge corre en el NAS Synology (IP residencial española), donde Tastytrade SÍ deja pasar las requests.

Mismo patrón que `ib-bridge` (NAS → IB Gateway).

## Arquitectura

```
Cloudflare Worker (api.onto-so.com)
        │
        │  HTTPS + Bearer auth
        ▼
ttapi.onto-so.com  ── CF Tunnel ──► localhost:8091 (NAS)
                                          │
                                          │  HTTPS + OAuth Bearer
                                          ▼
                                    api.tastytrade.com
```

## Endpoints expuestos

Todos requieren `Authorization: Bearer <BRIDGE_TOKEN>` excepto `/health`.

### OAuth
- `POST /oauth/exchange` — body `{ code }` → intercambia code por tokens (primer flow)
- `POST /oauth/refresh` — refresca access_token (también lo hace `ttFetch` automático)
- `GET /oauth/status` — `{ has_tokens, access_expires_at, access_valid }`
- `DELETE /oauth/clear` — borra tokens persistidos (forzar reauth)

### Market data
- `GET /marketdata/quote?symbols=SPY,IWM` — quotes equity en vivo
- `GET /marketdata/chain/:underlying` — option chain nested completo
- `GET /marketdata/chain/:underlying/expiration/:date` — solo una fecha
- `POST /marketdata/spread-quote` — body `{ underlying, expiration, legs[] }` → credit/debit del spread (worst, mid, best)
- `GET /marketdata/iv-rank/:underlying` — IV rank + IV percentile + HV 30d
- `GET /marketdata/accounts` — cuentas del usuario

### Generic passthrough
- `ALL /tt/*` — proxy autenticado al API de Tastytrade. Útil para endpoints no implementados arriba.

### Health
- `GET /health` (sin auth) — `{ status, has_tokens, token_expires_at }`

## Setup en NAS

### 1. Crear directorio + copiar código

Desde tu Mac:
```bash
ssh nas "mkdir -p /volume1/docker/tt-stack/tastytrade-bridge"
rsync -av --exclude=node_modules /Users/ricardogarciaontoso/IA/AyR/tastytrade-bridge/ \
  nas:/volume1/docker/tt-stack/tastytrade-bridge/
```

### 2. Copiar docker-compose.yml + .env

Ver `nas-deploy/tt-stack/`. Crear `.env` con:

```bash
TT_CLIENT_ID=tu_client_id
TT_CLIENT_SECRET=tu_client_secret
BRIDGE_TOKEN=token_aleatorio_largo  # mismo que TASTYTRADE_BRIDGE_TOKEN en worker
```

### 3. Build + start

```bash
ssh nas
cd /volume1/docker/tt-stack
sudo /usr/local/bin/docker compose --env-file .env build
sudo /usr/local/bin/docker compose --env-file .env up -d
sudo /usr/local/bin/docker logs tastytrade-bridge --tail 30
```

### 4. CF Tunnel

En el dashboard de Cloudflare:
- Networks → Tunnels → tu tunnel "Synology-ES"
- Public Hostname → Add:
  - Subdomain: `ttapi`
  - Domain: `onto-so.com`
  - Service: `http://localhost:8091`

### 5. Worker secrets

```bash
cd /Users/ricardogarciaontoso/IA/AyR/api
npx wrangler secret put TASTYTRADE_BRIDGE_URL  # https://ttapi.onto-so.com
npx wrangler secret put TASTYTRADE_BRIDGE_TOKEN  # mismo BRIDGE_TOKEN del .env del NAS
```

### 6. Primera autorización OAuth

1. Browser → `https://api.onto-so.com/api/tastytrade/oauth/init`
2. Tastytrade pide autorizar → Allow
3. Callback hace POST a `bridge/oauth/exchange` con el code
4. Bridge persiste tokens en `/data/tt-tokens.json`
5. A partir de ahí refresh automático

## Verificación

```bash
# Health (sin auth)
curl https://ttapi.onto-so.com/health

# Status OAuth (con auth)
curl https://ttapi.onto-so.com/oauth/status \
  -H "Authorization: Bearer $BRIDGE_TOKEN"

# Quote en vivo
curl "https://ttapi.onto-so.com/marketdata/quote?symbols=SPY,IWM,VIX" \
  -H "Authorization: Bearer $BRIDGE_TOKEN"
```

## Logs y troubleshooting

```bash
ssh nas "sudo /usr/local/bin/docker logs tastytrade-bridge --tail 100 -f"
```

Si los tokens se corrompen:
```bash
curl -X DELETE https://ttapi.onto-so.com/oauth/clear -H "Authorization: Bearer $BRIDGE_TOKEN"
# Luego volver a hacer OAuth init flow
```
