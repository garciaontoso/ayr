# ib-bridge

Servicio HTTP **read-only** que conecta el Cloudflare Worker de A&R con un
IB Gateway auto-hospedado (Docker `ghcr.io/gnzsnz/ib-gateway`).

> Este servicio **no puede colocar órdenes**. Está diseñado deliberadamente
> sin endpoints de trading. Para operar usa TWS, la app móvil o el web client.

---

## Arquitectura

```
┌──────────────────┐        HTTPS         ┌──────────────────────┐
│  Cloudflare      │ ───────────────────> │ Cloudflare Tunnel    │
│  Worker (A&R)    │   Bearer auth        │ (ib.onto-so.com)     │
└──────────────────┘                      └──────────┬───────────┘
                                                     │
                                                     ▼
                                           ┌──────────────────┐
                                           │   ib-bridge      │
                                           │   (este repo)    │
                                           │   :8080          │
                                           └──────────┬───────┘
                                                      │  TCP 4001
                                                      ▼
                                           ┌──────────────────┐
                                           │   IB Gateway     │
                                           │   (Docker)       │
                                           └──────────────────┘
```

### Tres capas de seguridad (read-only)

1. **Cuenta IBKR** — ajuste *Read-Only API* activado en TWS/Gateway. Aunque
   todo lo demás falle, IBKR rechaza cualquier orden.
2. **Este código** — no importa ni `Order`, ni `placeOrder`, ni
   `cancelOrder`. Un `grep` en el árbol fuente debería dar **cero** ocurrencias.
3. **Red** — el servicio escucha sólo en localhost dentro de Docker y se
   expone al exterior únicamente vía Cloudflare Tunnel + Bearer token
   (`BRIDGE_AUTH_TOKEN`).

---

## Desarrollo local

```bash
cd ib-bridge
cp .env.example .env          # edita BRIDGE_AUTH_TOKEN
npm install
npm run dev                   # node --watch src/index.js
```

Tests:

```bash
npm test
```

Build / run en Docker:

```bash
docker build -t ib-bridge .
docker run --rm -p 8080:8080 \
  -e IBKR_HOST=ib-gateway \
  -e IBKR_PORT=4001 \
  -e BRIDGE_AUTH_TOKEN=$(openssl rand -hex 32) \
  -e READ_ONLY_API=yes \
  ib-bridge
```

---

## Variables de entorno

| Var                   | Default      | Descripción                                                    |
| --------------------- | ------------ | -------------------------------------------------------------- |
| `IBKR_HOST`           | `ib-gateway` | Host del IB Gateway (servicio Docker o IP)                     |
| `IBKR_PORT`           | `4001`       | Puerto API (4001 = live, 4002 = paper)                         |
| `IBKR_CLIENT_ID`      | `1`          | Client ID único por sesión IB                                  |
| `PORT`                | `8080`       | Puerto HTTP del bridge                                         |
| `HOST`                | `0.0.0.0`    | Interfaz de bind                                               |
| `BRIDGE_AUTH_TOKEN`   | *(vacío)*    | Bearer token requerido por todos los endpoints (excepto health) |
| `READ_ONLY_API`       | *(vacío)*    | Debe ser `yes` — confirma que el ajuste read-only está activo  |
| `LOG_LEVEL`           | `info`       | `debug` \| `info` \| `warn` \| `error`                         |

---

## Endpoints

Todos GET. Todos requieren `Authorization: Bearer $BRIDGE_AUTH_TOKEN`
**excepto** `/health`. Pasa `?fresh=1` para saltarte la caché.

| Endpoint        | Cache | Descripción                                          |
| --------------- | ----- | ---------------------------------------------------- |
| `/health`       | —     | Liveness + estado IB. **Sin auth.**                  |
| `/nav`          | 10s   | Resumen completo de la cuenta (NLV, BP, margen…)     |
| `/margin`       | 10s   | Subset de `/nav` enfocado en margen + apalancamiento |
| `/positions`    | 30s   | Posiciones abiertas con precio + P&L                 |
| `/quotes`       | 1s    | Cotización snapshot — `?symbols=AAPL,MSFT` (max 50)  |
| `/historical`   | 1h    | Barras históricas — `?symbol=KO&duration=30D&bar_size=1d` |
| `/option-chain` | 30s   | Cadena de opciones filtrada por DTE/OTM              |
| `/iv`           | 5min  | IV/HV + rank/percentil 52w                           |

### Errores

| Status | Body                                       | Cuándo                                  |
| ------ | ------------------------------------------ | --------------------------------------- |
| 400    | `{ error: "..." }`                         | Parámetros inválidos                    |
| 401    | `{ error: "auth_required" }`               | Token ausente o incorrecto              |
| 404    | `{ error: "not_found" }`                   | Ruta o símbolo desconocido              |
| 502    | `{ error: "ib_error", code, details }`     | IB devolvió un error específico         |
| 503    | `{ error: "ib_unavailable", details }`     | IB Gateway no conectado                 |
| 504    | `{ error: "timeout" }`                     | Llamada IB > 10s                        |

---

## Cómo añadir un endpoint nuevo

1. Si necesitas datos nuevos de IB, añade un helper en
   `src/ib-client.js`. Sigue el patrón `reqWithTimeout({ start, bind, cancel })`
   para envolver el patrón evento-driven del SDK en una promesa.
2. Crea el handler en `src/routes/<grupo>.js`. Usa `withCache(key, ttl, fresh, producer)`.
3. Móntalo en `src/index.js` con `app.use('/', tuRouter)`.
4. **No** añadas nada que escriba en IB (placeOrder, cancelOrder, etc.).
   El servicio es y debe seguir siendo *read-only*.
5. Añade un test mínimo en `test/`.

---

## Operativa

- **Reinicio diario IB Gateway** (00:30 ET): el bridge se reconecta solo
  con backoff exponencial. `/health` devuelve `ib_connected: false` durante
  el corte.
- **Logs**: JSON estructurado a stdout (Docker los captura). Nunca se loguean
  tokens, números de cuenta, ni valores monetarios concretos.
- **Healthcheck Docker**: `curl /health` cada 30s.
