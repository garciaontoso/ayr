# A&R Tastytrade Stack — Deploy en NAS

Bridge que permite al Cloudflare Worker hablar con Tastytrade (CF Workers IPs están bloqueadas por su WAF).

## Pasos completos de despliegue

### 1. Generar BRIDGE_TOKEN aleatorio (en tu Mac)

```bash
openssl rand -hex 32
# Copia el output — será el BRIDGE_TOKEN
```

### 2. Crear directorios en el NAS

```bash
ssh nas "sudo mkdir -p /volume1/docker/tt-stack/data /volume1/docker/tt-stack/nas-deploy"
ssh nas "sudo chown -R 1000:1000 /volume1/docker/tt-stack/data"  # node user uid
```

### 3. Copiar código del bridge + compose al NAS

Desde tu Mac:

```bash
cd /Users/ricardogarciaontoso/IA/AyR

# Bridge code
rsync -av --exclude=node_modules tastytrade-bridge/ \
  nas:/volume1/docker/tt-stack/tastytrade-bridge/

# Compose stack
rsync -av nas-deploy/tt-stack/ \
  nas:/volume1/docker/tt-stack/nas-deploy/
```

### 4. Crear .env en el NAS

```bash
ssh nas
cd /volume1/docker/tt-stack
cp nas-deploy/.env.example .env
nano .env
```

Rellena:
- `TT_CLIENT_ID`, `TT_CLIENT_SECRET` (de Tastytrade OAuth app)
- `BRIDGE_TOKEN` (el random que generaste)

Guarda (Ctrl+X, Y, Enter).

### 5. Build + start

```bash
sudo /usr/local/bin/docker compose --env-file /volume1/docker/tt-stack/.env \
  -f /volume1/docker/tt-stack/nas-deploy/docker-compose.yml build

sudo /usr/local/bin/docker compose --env-file /volume1/docker/tt-stack/.env \
  -f /volume1/docker/tt-stack/nas-deploy/docker-compose.yml up -d

sudo /usr/local/bin/docker logs tastytrade-bridge --tail 30
```

Deberías ver `tastytrade-bridge listening on 0.0.0.0:8091`.

### 6. CF Tunnel — añadir hostname

Dashboard Cloudflare → Networks → Tunnels → "Synology-ES" → Public Hostname → Add:

| Campo | Valor |
|---|---|
| Subdomain | `ttapi` |
| Domain | `onto-so.com` |
| Service Type | `HTTP` |
| URL | `localhost:8091` |

Save.

### 7. Worker secrets (en tu Mac)

```bash
cd /Users/ricardogarciaontoso/IA/AyR/api
echo "https://ttapi.onto-so.com" | npx wrangler secret put TASTYTRADE_BRIDGE_URL
# Pegar el mismo BRIDGE_TOKEN del .env del NAS
npx wrangler secret put TASTYTRADE_BRIDGE_TOKEN
```

### 8. Test desde fuera

```bash
# Health (sin auth)
curl https://ttapi.onto-so.com/health
# → { "status":"ok", "has_tokens":false, ... }

# OAuth status (con auth)
curl https://ttapi.onto-so.com/oauth/status \
  -H "Authorization: Bearer $BRIDGE_TOKEN"
# → { "has_tokens":false, "access_valid":false }
```

### 9. Primera autorización OAuth

1. Browser → `https://api.onto-so.com/api/tastytrade/oauth/init`
2. Tastytrade pide autorizar → Authorize
3. Callback se ejecuta automáticamente
4. Te redirige a ayr.onto-so.com con `?tastytrade=connected`

Verifica:
```bash
curl https://ttapi.onto-so.com/oauth/status \
  -H "Authorization: Bearer $BRIDGE_TOKEN"
# → { "has_tokens":true, "access_valid":true, "access_expires_at":"2026-..." }
```

### 10. Test de quote real

```bash
curl "https://ttapi.onto-so.com/marketdata/quote?symbols=SPY,IWM" \
  -H "Authorization: Bearer $BRIDGE_TOKEN"
# → { "quotes": { "SPY": {"bid":..,"ask":..}, "IWM": {...} } }
```

Si llega quote real → Phase 1B desbloqueada.

## Comandos útiles post-deploy

```bash
# Ver logs en vivo
ssh nas "sudo /usr/local/bin/docker logs tastytrade-bridge --tail 100 -f"

# Restart bridge
ssh nas "sudo /usr/local/bin/docker restart tastytrade-bridge"

# Rebuild después de update código
cd /Users/ricardogarciaontoso/IA/AyR
rsync -av --exclude=node_modules tastytrade-bridge/ nas:/volume1/docker/tt-stack/tastytrade-bridge/
ssh nas "cd /volume1/docker/tt-stack && sudo /usr/local/bin/docker compose --env-file .env -f nas-deploy/docker-compose.yml build tastytrade-bridge && sudo /usr/local/bin/docker compose --env-file .env -f nas-deploy/docker-compose.yml up -d --no-deps tastytrade-bridge"

# Borrar tokens (forzar reauth)
curl -X DELETE https://ttapi.onto-so.com/oauth/clear \
  -H "Authorization: Bearer $BRIDGE_TOKEN"
```

## Troubleshooting

### Bridge no arranca
```bash
ssh nas "sudo /usr/local/bin/docker logs tastytrade-bridge --tail 50"
```
Errores comunes:
- `BRIDGE_TOKEN env not set` → falta en .env
- `EADDRINUSE` → puerto 8091 ocupado, cambiar en compose

### CF tunnel no enruta
- Verificar en dashboard CF que el hostname `ttapi.onto-so.com` está y apunta a `localhost:8091`
- Reiniciar el cloudflare-tunnel container: `sudo /usr/local/bin/docker restart cloudflared`

### Tokens 401 después de un tiempo
Los refresh tokens caducan a los 30 días. Si no se ha usado el bridge en 30+ días, hay que rehacer OAuth init flow.
