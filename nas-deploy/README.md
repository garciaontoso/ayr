# A&R IB Stack — despliegue en Synology DS423+

Stack de 3 contenedores que corre en tu NAS (DS423+, Intel J4125, 10 GB RAM)
para tener un **IB Gateway propio** disponible 24/7 como backbone de datos
real-time para A&R, sin depender de las IPs de Cloudflare Workers (que IBKR
bloquea en algunas operaciones).

```
  laptop / móvil / Worker (api.onto-so.com)
            │     HTTPS  +  Bearer token
            ▼
   ┌────────────────────────────┐
   │  ib.onto-so.com            │   ← Cloudflare Tunnel (no abre puertos en tu router)
   └────────────────────────────┘
            │
            ▼  (dentro del NAS, red docker interna)
   ┌─────────────┐   port 8080   ┌────────────────┐   port 4001   ┌──────────────┐
   │ cloudflared │ ────────────▶ │   ib-bridge    │ ────────────▶ │  ib-gateway  │
   └─────────────┘               │  (Node.js)     │               │   (IBC)      │
                                 │  Bearer auth   │               │  Read-Only   │
                                 └────────────────┘               └──────────────┘
```

## Modelo de seguridad — 3 capas

| capa | qué hace | dónde se configura |
|------|----------|---------------------|
| **1. IBKR Read-Only API** | A nivel de cuenta IBKR: ninguna instrucción que llegue al gateway puede colocar órdenes. Es la única defensa real. | IBKR Portal → Settings → API → Settings → marca **"Read-Only API"** |
| **2. ib-bridge sin endpoints de orden** | El servicio Node.js sólo expone GET de portfolio, posiciones, precios, etc. No tiene ruta `placeOrder`. | Código en `../ib-bridge/` |
| **3. Cloudflare Tunnel + Bearer token** | El bridge nunca está en internet directamente. Sólo CF accede, y exige `Authorization: Bearer <token>` en cada request. | `BRIDGE_AUTH_TOKEN` en `.env` + DNS en CF |

Si capas 2 y 3 fallan, capa 1 sigue impidiendo cualquier daño financiero.

---

## 0. Prerequisitos

- **NAS**: DSM 7.3.2, **Container Manager** instalado (Centro de paquetes), **SSH habilitado**.
- **Usuario SSH** del NAS (no es root) con acceso a `/volume1/docker/`.
- **Cuenta IBKR live** con **Read-Only API activado**:
  - IBKR Portal → User Settings → Trading → API → Settings
  - Marca *"Read-Only API"*. Salva.
  - **Verifica**: vuelve a entrar — debe aparecer "Read-Only" en la cabecera de la sección API.
- **Cuenta Cloudflare** con la zona `onto-so.com` activa.
- (Opcional) **Móvil con IBKR Mobile** para aprobar 2FA si IBKR lo pide la primera vez.

---

## 1. Subir los archivos al NAS

Desde tu Mac:

```bash
# desde el repo, con la carpeta nas-deploy/ ya creada
cd /Users/ricardogarciaontoso/IA/AyR

# crear el directorio destino y copiar (ajusta usuario / IP)
ssh ricardo@nas.local "mkdir -p /volume1/docker/ib-stack/_repo"
scp -r nas-deploy/ ricardo@nas.local:/volume1/docker/ib-stack/_repo/

# y también el código del bridge (cuando esté listo)
scp -r ib-bridge/ ricardo@nas.local:/volume1/docker/ib-stack/_repo/
```

Estructura resultante en el NAS:

```
/volume1/docker/ib-stack/
├── _repo/
│   ├── nas-deploy/          ← este folder
│   └── ib-bridge/           ← código Node.js (lo construye el agente paralelo)
├── docker-compose.yml       ← copiado por setup.sh
├── .env.example             ← copiado por setup.sh
├── .env                     ← rellenado por ti
├── health-check.sh
└── ib-gateway/              ← bind mounts (logs/config persistente)
    ├── config/
    └── logs/
```

> **Heads-up Synology**: Container Manager guarda sus volúmenes nominales en
> `/volume1/@docker/`, pero **bind mounts** funcionan perfectamente apuntando
> a rutas que tú controlas dentro de `/volume1/docker/`. Es lo que hacemos
> aquí — todo lo persistente está bajo tu carpeta de usuario.

---

## 2. Generar config inicial

Por SSH al NAS:

```bash
ssh ricardo@nas.local
cd /volume1/docker/ib-stack/_repo/nas-deploy/
chmod +x setup.sh health-check.sh
./setup.sh
```

`setup.sh` crea los directorios bind, copia `docker-compose.yml`, copia
`.env.example`, y si `.env` no existe lo crea con un `BRIDGE_AUTH_TOKEN`
fuerte ya generado (`openssl rand -hex 32`).

---

## 3. Editar `.env`

```bash
cd /volume1/docker/ib-stack/
vi .env   # o nano, lo que tengas
```

Rellena:
- `TWS_USERID` — tu user de IBKR (live, NO paper)
- `TWS_PASSWORD` — tu pass de IBKR
- `TUNNEL_TOKEN` — lo creas en el siguiente paso

Deja `TRADING_MODE=live`, `READ_ONLY_API=yes`, y el `BRIDGE_AUTH_TOKEN`
que ya está generado.

```bash
chmod 600 .env   # importante — sólo tú deberías leerlo
```

---

## 4. Crear el túnel de Cloudflare (one-time, en navegador)

1. Entra en **Cloudflare Zero Trust** (`https://one.dash.cloudflare.com/`).
2. **Networks → Tunnels → Create a tunnel**.
3. Conector: **Cloudflared**. Click **Next**.
4. Nombre del túnel: `ib-bridge-nas`. Click **Save tunnel**.
5. En la pantalla "Install and run a connector", elige la pestaña **Docker**.
   Verás un comando con un token largo (`eyJ...`). **Copia sólo el token**
   (lo que va después de `--token `).
6. Pega ese token en `TUNNEL_TOKEN=` dentro de `/volume1/docker/ib-stack/.env`.
7. **NO ejecutes el comando docker que CF te muestra** — nuestro
   `docker-compose.yml` ya lo hace por ti.
8. Click **Next** en el navegador.
9. **Public Hostnames** → **Add a public hostname**:
   - **Subdomain**: `ib`
   - **Domain**: `onto-so.com`
   - **Service Type**: `HTTP`
   - **URL**: `ib-bridge:8080`
10. Click **Save**.

Cloudflare creará automáticamente el registro DNS `ib.onto-so.com` apuntando
al túnel. No tienes que tocar el DNS a mano.

---

## 5. Levantar el stack

```bash
cd /volume1/docker/ib-stack/
docker compose up -d
```

Primera vez: tarda 3-5 min porque tiene que (a) descargar la imagen de
ib-gateway (~600 MB), (b) construir el ib-bridge (~50 MB), (c) descargar
cloudflared (~100 MB).

> **Quirk Container Manager**: en DSM 7.3.2 la GUI a veces no muestra los
> servicios correctamente hasta que refrescas. La línea de comandos es la
> verdad. Usa `docker compose ps` y `docker compose logs`.

---

## 6. Vigilar el arranque (los primeros 2 min son ruidosos)

```bash
docker compose logs -f
```

Lo que esperas ver, en orden:

| servicio | log esperado | qué significa |
|----------|--------------|---------------|
| `ib-gateway` | `Login has completed` o `Login successful` | IBC ha hecho login con tus credenciales |
| `ib-gateway` | `Click button: Acknowledge` | IBC ha aceptado el daily disclaimer |
| `ib-bridge` | `listening on 8080` (o similar — depende del bridge) | el proceso Node arrancó |
| `ib-bridge` | `connected to IB Gateway` | el bridge abrió socket TCP a `ib-gateway:4001` |
| `cloudflared` | `Registered tunnel connection` (×4 normalmente) | el túnel está activo, CF ya rutea tráfico |

Si algo no aparece tras 3 min, salta a **Troubleshooting** abajo.

`Ctrl+C` para salir del seguimiento (no detiene los contenedores).

---

## 7. Verificar cada servicio

### a) Estado de contenedores

```bash
docker compose ps
```

Los 3 deben aparecer `Up` y `healthy` (cloudflared no tiene healthcheck
explícito, debe estar `Up` a secas).

### b) Sanity manual del bridge

```bash
# desde dentro del NAS — usa el token del .env
TOKEN=$(grep BRIDGE_AUTH_TOKEN /volume1/docker/ib-stack/.env | cut -d= -f2)
docker compose exec cloudflared wget -qO- \
  --header="Authorization: Bearer $TOKEN" \
  http://ib-bridge:8080/healthz
```

Respuesta esperada (formato exacto depende del bridge, pero algo así):

```json
{"ok":true,"ib_connected":true,"version":"...","uptime_s":123}
```

### c) Test desde fuera (tu Mac)

```bash
# en tu Mac, NO en el NAS
TOKEN="<copia el BRIDGE_AUTH_TOKEN del .env del NAS>"
curl https://ib.onto-so.com/healthz -H "Authorization: Bearer $TOKEN"
```

Si esto devuelve el JSON con `"ib_connected":true`, **estás operativo**.

### d) Healthcheck rápido y completo

```bash
ssh ricardo@nas.local
cd /volume1/docker/ib-stack/
./health-check.sh
```

Te muestra estado, últimas 5 líneas de log de cada servicio, respuesta de
`/healthz`, y conexiones registradas en cloudflared.

---

## 8. Operación diaria

| ¿qué? | comando |
|-------|---------|
| Ver estado | `docker compose ps` |
| Ver logs en vivo | `docker compose logs -f` |
| Ver logs de UN servicio | `docker compose logs -f ib-gateway` |
| Reiniciar todo | `docker compose restart` |
| Detener todo | `docker compose down` |
| Reiniciar SOLO el bridge | `docker compose restart ib-bridge` |
| Health check completo | `./health-check.sh` |
| Actualizar imágenes | `docker compose pull && docker compose up -d` |

IBC reinicia el gateway automáticamente cada noche a las 23:55 hora local
del NAS, así absorbes el reset diario de IBKR sin intervención.

---

## 9. Troubleshooting

### "Login failed" en ib-gateway

- **Causa más común**: 2FA. La primera vez IBKR puede pedir aprobación en
  IBKR Mobile. Mira tu móvil. Si no apruebas en ~3 min, IBC entra en
  loop y reintenta cada 5 min hasta que apruebes.
- **2ª causa**: contraseña errónea en `.env` (cuidado con caracteres `$` o
  `!` que el shell expande — entrecomilla con simples si hace falta).
- **3ª causa**: la cuenta es `paper` pero `TRADING_MODE=live` (o al revés).
  Mira en el portal de IBKR qué tipo de cuenta tienes.

```bash
docker compose logs --tail=100 ib-gateway
```

### ib-bridge no se conecta a ib-gateway

- Comprueba que ambos están en la misma red:
  ```bash
  docker network inspect ib-stack_ib-stack-net
  ```
- ¿`IB_HOST=ib-gateway` y `IB_PORT=4001` en compose? (sí, por defecto.)
- ¿El gateway acabó de arrancar? Healthcheck del gateway tarda ~90s en pasar.
  Mientras `ib-gateway` no esté `healthy`, `ib-bridge` no arranca (depends_on).

### cloudflared no registra el túnel

- 99% es token mal copiado. Revisa que pegaste **sólo** el token (la cadena
  `eyJ...`), no el comando `docker run` entero.
- En CF Zero Trust → Networks → Tunnels → ib-bridge-nas → la columna
  "Status" debe pasar a **HEALTHY** en menos de 1 min.
- Si pegaste mal el token y arrancaste, edita `.env` y haz
  `docker compose up -d` (recrea cloudflared con el nuevo token).

### `curl https://ib.onto-so.com/...` da 530 o 521

- 530 = el túnel no está conectado al origen. Mira logs de cloudflared.
- 521 = el origen rechaza la conexión. Mira si `ib-bridge` está `Up`.

### Quiero parar todo limpiamente (vacaciones, etc.)

```bash
docker compose down            # detiene contenedores, conserva datos
# para reanudar:
docker compose up -d
```

`docker compose down` **NO borra** los bind mounts (`/volume1/docker/ib-stack/ib-gateway/`),
así que la sesión de IBC y los logs sobreviven.

### Quiero borrar todo y empezar de cero

```bash
docker compose down -v
sudo rm -rf /volume1/docker/ib-stack/ib-gateway
./setup.sh
# y vuelves a editar .env
```

Esto reinstala la imagen y fuerza un re-login completo en IBKR.

---

## 10. Checklist final (cuando despliegues)

- [ ] IBKR Read-Only API verificado en el portal
- [ ] `setup.sh` ejecutado — `.env` y carpetas creadas
- [ ] `.env` editado: `TWS_USERID`, `TWS_PASSWORD`, `TUNNEL_TOKEN` rellenos
- [ ] `chmod 600 .env`
- [ ] Túnel CF `ib-bridge-nas` creado, hostname `ib.onto-so.com → http://ib-bridge:8080`
- [ ] `docker compose up -d` corrido
- [ ] `docker compose ps` → 3 servicios `Up`, gateway+bridge `healthy`
- [ ] `health-check.sh` → todo verde
- [ ] `curl` desde el Mac a `https://ib.onto-so.com/healthz` con Bearer → `ib_connected:true`
- [ ] (Opcional) Reinicio del NAS para verificar que arranca solo:
      `sudo reboot` y volver a comprobar tras 3 min.

---

## Apéndice — qué imagen es cada cosa

- **`ghcr.io/gnzsnz/ib-gateway:stable`** — fork mantenido del IB Gateway
  oficial empaquetado con [IBC](https://github.com/IbcAlpha/IBC), que
  automatiza el login GUI (IB Gateway no tiene API headless propia).
  Repo: https://github.com/gnzsnz/ib-gateway-docker
- **`ib-bridge` (build local)** — Node.js, conecta al gateway por TCP 4001
  con la API oficial de IB y expone REST. Construido por agente paralelo;
  ver `../ib-bridge/`.
- **`cloudflare/cloudflared:latest`** — daemon oficial de Cloudflare para
  tunnels. Imagen ~25 MB, sin estado.
