# YouTube Dividendo Agent — Install guide

Todo en esta carpeta está listo para copiar en su sitio cuando termines la sesión paralela. Ningún archivo aquí afecta al código activo.

## Pre-requisitos (una sola vez)

```bash
# En tu Mac
brew install jq                              # si no lo tienes
pip3 install --upgrade yt-dlp                # o brew install yt-dlp

# Asegúrate de estar logueado en YouTube desde Chrome (ya lo estás)
```

## Pasos de instalación (en orden)

### 1. Migración D1

```bash
cd /Users/ricardogarciaontoso/IA/AyR
npx wrangler d1 execute aar-finanzas \
  --file=docs/youtube-dividendo-ready/migration.sql --remote
```

Crea tablas `youtube_videos`, `youtube_video_companies`, `youtube_channels` y siembra el canal El Dividendo.

### 2. Secret del Worker

```bash
# Genera un token aleatorio
openssl rand -hex 32

# Añádelo al Worker
cd api
npx wrangler secret put AYR_WORKER_TOKEN
# → pega el token generado
```

### 3. Worker — pegar endpoints

Abre `api/src/worker.js` y:

- Pega los handlers de `docs/youtube-dividendo-ready/worker-endpoints.js` al final del archivo (antes del `export default`)
- En el router (dentro del fetch handler) añade las 7 rutas comentadas al final del snippet
- Deploy:
  ```bash
  cd api && npx wrangler deploy
  ```

### 4. Frontend — pegar componente

```bash
cp docs/youtube-dividendo-ready/NoticiasTab.jsx \
   frontend/src/components/home/NoticiasTab.jsx
```

Edita `frontend/src/components/views/HomeView.jsx`:

- Importa: `import NoticiasTab from '../home/NoticiasTab';`
- Añade una entrada a la lista de tabs entre "Agentes" y la siguiente
- En el switch de renderizado: `case 'noticias': return <NoticiasTab darkMode={darkMode} />;`

Integra con el panel Airplane Mode existente (✈️):
- Importa también `fetchAllYouTubeForOffline` del componente
- En el handler del botón "Descargar todo", añade: `await fetchAllYouTubeForOffline();`

Deploy:
```bash
cd frontend && npm run build && \
  npx wrangler pages deploy dist --project-name=ayr --branch=production --commit-dirty=true
```

### 5. Script del Mac

```bash
mkdir -p /Users/ricardogarciaontoso/IA/AyR/scripts
cp docs/youtube-dividendo-ready/scan-youtube.sh scripts/scan-youtube.sh
chmod +x scripts/scan-youtube.sh
```

Crea o edita `~/.ayr-env`:
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
export AYR_WORKER_TOKEN="el-token-del-paso-2"
export AYR_WORKER_URL="https://aar-api.garciaontoso.workers.dev"
```

### 6. Primer test

```bash
# En la app web, pulsa 🔄 Escanear canal → debe decir "15 vídeos nuevos"

# En terminal del Mac:
source ~/.ayr-env
./scripts/scan-youtube.sh

# Debe:
#   - bajar pending list del Worker
#   - para cada vídeo: yt-dlp → transcripción → Opus → POST summary
#   - logs en ~/Library/Logs/ayr-scan-youtube.log

# En la app web, refresca la tab Noticias → debes ver los vídeos con empresas analizadas
```

### 7. (Opcional más adelante) Cron

Si te cansas de ejecutar el script a mano y quieres que se ejecute automáticamente:

```bash
crontab -e
# Añade:
# 30 9 * * * cd /Users/ricardogarciaontoso/IA/AyR && source ~/.ayr-env && ./scripts/scan-youtube.sh >> ~/Library/Logs/ayr-scan-youtube.log 2>&1
```

Pero recuerda: el diseño explícitamente decidió **manual** para controlar el gasto. El cron solo si el gasto se valida como aceptable tras uso real.

## Estructura final

```
AyR/
├── docs/
│   ├── youtube-dividendo-agent-design.md     ← diseño completo
│   └── youtube-dividendo-ready/              ← archivos ready-to-drop (ESTA CARPETA)
│       ├── INSTALL.md                        ← este archivo
│       ├── migration.sql                     ← schema D1
│       ├── worker-endpoints.js               ← código para pegar en worker.js
│       ├── NoticiasTab.jsx                   ← componente React
│       └── scan-youtube.sh                   ← script del Mac
├── api/src/worker.js                         ← (modificar tras paso 3)
├── frontend/src/components/home/NoticiasTab.jsx ← (crear tras paso 4)
└── scripts/scan-youtube.sh                   ← (crear tras paso 5)
```

## Rollback

Si algo sale mal:

```bash
# D1
npx wrangler d1 execute aar-finanzas --remote --command \
  "DROP TABLE youtube_videos; DROP TABLE youtube_video_companies; DROP TABLE youtube_channels;"

# Worker: git revert del commit que añadió los endpoints
# Frontend: git revert del commit que añadió NoticiasTab

# Mac script: rm scripts/scan-youtube.sh
```

## Coste real esperado

- Scan RSS (Worker): $0 (cuenta contra el free tier)
- Transcripción (Mac, yt-dlp): $0
- Opus 4.6 por vídeo: ~$0.15 (vídeo 28k tokens)
- Estimado si pulsas el botón 1x/semana con 3 vídeos: **~$1.80/mes**
- Si una semana no lo pulsas: **$0**

## Validación end-to-end realizada el 2026-04-07

- ✅ Channel ID extraído: `UCM-udvxv3eBO0LcCmnJjNbw`
- ✅ RSS feed devuelve 15 vídeos
- ✅ yt-dlp con cookies Chrome baja VTT en 7 segundos (vídeo de 2h 30m)
- ✅ Limpieza VTT → 21k palabras de texto plano
- ✅ Análisis estructurado extrae 23 empresas + veredictos + precios objetivo correctamente
- ❌ Confirmado: desde Cloudflare Worker no funciona (bot block)
