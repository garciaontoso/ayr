# YouTube Dividendo Agent — Manual scan + per-company summary

> Estado: DISEÑO. No implementar todavía (sesión paralela activa).
> Generado 2026-04-07. **Validado end-to-end con vídeo real el mismo día.**
> Canal objetivo: **El Dividendo** (@eldividendo3101)
> Channel ID confirmado: `UCM-udvxv3eBO0LcCmnJjNbw`
> RSS feed: `https://www.youtube.com/feeds/videos.xml?channel_id=UCM-udvxv3eBO0LcCmnJjNbw`

---

## ⚠️ HALLAZGO CRÍTICO (validación 2026-04-07)

Probado con el último vídeo real (`cfapfH8Q-q0`, "DIRECTO*** Preguntas Ep09"):

1. ✅ RSS feed funciona perfecto, devuelve 15 vídeos sin API key, sin cuota
2. ❌ **YouTube bloquea IPs de datacenter** con `"Sign in to confirm you're not a bot"`. Afecta a:
   - El endpoint clásico `timedtext` (devuelve vacío)
   - Scraping de la página `watch?v=...` desde curl/Worker (playabilityStatus = LOGIN_REQUIRED)
   - yt-dlp sin cookies
3. ✅ **`yt-dlp --cookies-from-browser chrome`** desde el Mac local **funciona perfectamente**:
   - Bajó 1 MB de VTT en ~7 segundos
   - Texto en español original (no auto-traducido), captura muletillas y términos técnicos
   - 21,000 palabras → ~28k tokens de transcripción limpia
4. ✅ Opus 4.6 procesando esa transcripción extrae correctamente 23 empresas analizadas a fondo + ~30 menciones secundarias, cada una con tesis, veredicto, riesgos y precio objetivo

**Implicación arquitectónica**: el endpoint NO puede correr en Cloudflare Worker. Tiene que correr **en el Mac del usuario**, igual que `sync-flex.sh` (que también existe porque IB bloquea Workers). Mismo patrón: cron/script local que escribe a D1 vía la API del Worker.

---

## Propósito

Escanear bajo demanda el canal "El Dividendo" y devolver, por cada vídeo nuevo desde la última ejecución, un **resumen estructurado por empresa analizada**: tesis del autor, precio/valoración si la menciona, veredicto, riesgos.

El usuario no tiene tiempo de ver todos los vídeos. Quiere capturar las empresas comentadas y la tesis sin sentarse 30-60 min por vídeo.

---

## Decisiones de diseño (acordadas con el usuario)

1. **Trigger manual con botón**, NO cron. Razón: evitar gasto recurrente de Claude API y de transcripción cuando puede que el canal no suba nada en días.
2. **Vive dentro de una nueva tab "Noticias"** (aún por crear). Esa tab agrupará en el futuro: vídeos YouTube + noticias filtradas (`news-agent-design.md`) + Daily Briefing.
3. **Granularidad: por empresa**, no resumen general del vídeo.
4. **Cero notificaciones push**. Coherente con la filosofía anti-reactividad del News Agent.
5. **Idempotente**: si pulsas el botón dos veces el mismo día, no reprocesa vídeos ya cacheados (solo trae los nuevos).

---

## Arquitectura (revisada tras validación)

Híbrida Worker + Mac local. Misma idea que `sync-flex.sh`.

```
[Usuario]
   │  click "Escanear canal"
   ▼
[Frontend — NoticiasTab → YouTubeFeed component]
   │  POST /api/youtube/scan-channel  → encola petición
   ▼
[Worker /api/youtube/scan-channel]
   │
   ├─ 1. List uploads (RSS feed, sí funciona desde Worker)
   │      https://www.youtube.com/feeds/videos.xml?channel_id=UCM-udvxv3eBO0LcCmnJjNbw
   │
   ├─ 2. Diff vs D1 → marca vídeos nuevos como pending_transcription
   │
   └─ 3. Devuelve "N vídeos pendientes, ejecuta scan-youtube.sh en Mac"
          (o, si el Mac está siempre encendido, ya están listos del último run)

[Mac local — scan-youtube.sh ejecutado por el usuario o cron]
   │
   ├─ 1. GET /api/youtube/pending → lista de video_ids pendientes
   ├─ 2. Para cada video_id:
   │      a. yt-dlp --cookies-from-browser chrome --write-auto-subs ...
   │      b. Limpiar VTT → texto plano
   │      c. Llamar Claude Opus 4.6 con prompt estructurado
   │      d. POST /api/youtube/upload-summary con JSON resultado
   └─ 3. Worker INSERT en D1 (youtube_videos + youtube_video_companies)

[Frontend]
   └─ Polling/refresh tras X segundos → muestra resúmenes nuevos
```

**Por qué este split**:
- RSS funciona desde Worker → barato detectar si hay novedades sin tocar Mac
- Transcripción REQUIERE cookies de Chrome → solo Mac
- Llamada a Claude puede ser desde cualquier sitio, pero como ya estás en Mac y tienes cookies, conviene hacerlo todo ahí para no exponer la API key del usuario al frontend

---

## Channel ID (ya obtenido)

```
EL_DIVIDENDO_CHANNEL_ID = "UCM-udvxv3eBO0LcCmnJjNbw"
```

Comando que lo extrae si hay que repetirlo para otros canales:
```bash
curl -sL -A "Mozilla/5.0" "https://www.youtube.com/@HANDLE" \
  | grep -oE '"browseId":"UC[A-Za-z0-9_-]{22}"' | head -1
```

Feed RSS funcionando (probado):
```
https://www.youtube.com/feeds/videos.xml?channel_id=UCM-udvxv3eBO0LcCmnJjNbw
```
Devuelve los 15 vídeos más recientes con `<yt:videoId>`, `<title>`, `<published>`. Sin API key, sin cuota, sí funciona desde Cloudflare Workers.

---

## Transcripciones — VALIDADO

Tras probar todas las opciones con vídeo real (`cfapfH8Q-q0`), la única que funciona desde tu setup es:

### ✅ Opción ganadora: yt-dlp + cookies de Chrome desde el Mac

```bash
yt-dlp \
  --cookies-from-browser chrome \
  --skip-download \
  --write-auto-subs \
  --sub-langs "es,es-ES" \
  --sub-format vtt \
  -o "/tmp/yt_%(id)s.%(ext)s" \
  "https://www.youtube.com/watch?v=VIDEO_ID"
```

- **Coste**: $0
- **Velocidad**: ~7 segundos para un vídeo de 2h 30m
- **Calidad**: español original (auto-generated pero limpio), captura `[resoplido]`, `[carraspeo]`, jerga inversora
- **Output**: archivo `.es.vtt` con timestamps + texto
- **Limpieza** a texto plano:
  ```bash
  cat /tmp/yt_VIDEO.es.vtt \
    | grep -v "^WEBVTT\|^Kind:\|^Language:\|^$" \
    | grep -vE "^[0-9]{2}:[0-9]{2}" \
    | sed 's/<[^>]*>//g' \
    | awk '!seen[$0]++' > /tmp/yt_VIDEO.txt
  ```

### Opciones descartadas tras pruebas

| Opción | Resultado |
|---|---|
| `timedtext?v=ID&lang=es` clásico | ❌ Devuelve vacío (deprecated) |
| Scrape de `watch?v=ID` desde curl | ❌ `LOGIN_REQUIRED — Sign in to confirm you're not a bot` |
| yt-dlp sin cookies | ❌ Mismo bot block |
| yt-dlp `--cookies-from-browser safari` | ❌ macOS bloquea acceso al binarycookies de Safari |
| yt-dlp desde Cloudflare Worker | ❌ No funcionaría aunque tuvieras cookies (datacenter IP block) |
| Supadata.ai / youtube-transcript.io | ⏳ No probado, pero potencial fallback de pago si las cookies de Chrome dejan de servir algún día |

**Conclusión**: la opción gratis funciona PERO obliga a correr en el Mac. Esto **rompe** el plan original de hacerlo todo desde el Worker, por eso la arquitectura es ahora híbrida.

---

## Schema D1 propuesto

```sql
CREATE TABLE youtube_videos (
  video_id TEXT PRIMARY KEY,           -- ej "dQw4w9WgXcQ"
  channel_id TEXT NOT NULL,
  channel_name TEXT,
  title TEXT NOT NULL,
  published_at TEXT NOT NULL,          -- ISO
  duration_seconds INTEGER,
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  transcript TEXT,                     -- texto plano completo
  transcript_source TEXT,              -- 'timedtext' | 'supadata' | 'whisper'
  summary_general TEXT,                -- 1 párrafo overview
  scanned_at TEXT NOT NULL,            -- cuándo procesamos
  processing_cost_usd REAL             -- para tracking gasto
);

CREATE TABLE youtube_video_companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id TEXT NOT NULL,
  ticker TEXT,                         -- normalizado o NULL si no se identifica
  company_name TEXT NOT NULL,          -- como lo dice el autor
  thesis TEXT,                         -- tesis del autor
  verdict TEXT,                        -- 'compra' | 'mantener' | 'evitar' | 'observar' | NULL
  target_price TEXT,                   -- texto libre, puede ser "20-25€"
  fair_value TEXT,
  risks TEXT,                          -- JSON array o texto
  catalyst TEXT,
  in_portfolio BOOLEAN DEFAULT 0,      -- ¿está en mi cartera? join con positions
  timestamp_in_video INTEGER,          -- segundo donde empieza a hablar de esta empresa
  FOREIGN KEY (video_id) REFERENCES youtube_videos(video_id)
);

CREATE INDEX idx_yt_companies_ticker ON youtube_video_companies(ticker);
CREATE INDEX idx_yt_videos_published ON youtube_videos(published_at DESC);
```

---

## Prompt para Claude Haiku

Modelo: **claude-opus-4-6** (decisión 2026-04-07: uso manual y poco frecuente → coste trivial y Opus capta mejor matices del español inversor: ironía, tesis implícitas, "no me convence porque...", distinción entre análisis serio vs mención de paso).

```
Eres un analista que extrae información de vídeos de inversión en español del canal "El Dividendo".

Te paso la transcripción de un vídeo. Tu tarea:

1. Identifica TODAS las empresas que el autor analiza o menciona como ideas de inversión.
   IGNORA menciones de paso ("también está Apple pero no me gusta") salvo que dé razones.
2. Para cada empresa devuelve un objeto con esta forma exacta:

{
  "company_name": "nombre como lo dice el autor",
  "ticker": "ticker bursátil si lo menciona, si no NULL",
  "thesis": "1-3 frases con la tesis del autor",
  "verdict": "compra" | "mantener" | "evitar" | "observar",
  "target_price": "string libre o NULL",
  "fair_value": "string libre o NULL",
  "risks": ["riesgo 1", "riesgo 2"],
  "catalyst": "string libre o NULL",
  "timestamp_seconds": número o NULL
}

3. Devuelve también un campo "summary_general" con 2-3 frases resumiendo el vídeo entero.

Formato de salida: JSON válido, sin markdown, sin texto extra.
{
  "summary_general": "...",
  "companies": [...]
}

Transcripción:
---
{{TRANSCRIPT}}
---
```

**Coste estimado por vídeo** (Opus 4.6):
- Transcripción ~6000 tokens input + ~800 output
- Opus 4.6: $15/MTok input, $75/MTok output
- → ~$0.15 por vídeo

Si el canal sube 3 vídeos/semana y pulsas el botón cada semana → ~$0.45/semana → ~$23/año.
Si el canal sube vídeos largos (1h+, ~20k tokens transcript) → ~$0.40/vídeo → ~$60/año en el peor caso.

**Sigue siendo trivial** comparado con los $33/mes de los 11 agentes actuales, y al ser manual el coste solo se incurre cuando pulsas el botón.

---

## Frontend — tab "Noticias"

Estructura propuesta (no implementar todavía):

```
NoticiasTab.jsx
├─ <NoticiasHeader />
├─ <Tabs>
│    ├─ "YouTube"      → <YouTubeFeed />
│    ├─ "Noticias"     → <NewsFeed />            ← futuro
│    └─ "Daily Brief"  → <DailyBriefingPanel />  ← futuro
│
└─ <YouTubeFeed>
     ├─ Header con botón "🔄 Escanear canal"
     ├─ Estado: "Última actualización: hace 2h, 3 vídeos nuevos"
     ├─ Lista de vídeos (más reciente primero):
     │    ┌────────────────────────────────────────┐
     │    │ [thumbnail]  Título del vídeo          │
     │    │              📅 hace 2 días · 28:45    │
     │    │              "Resumen general..."      │
     │    │                                        │
     │    │  Empresas analizadas (4):              │
     │    │  ┌──────────────────────────────────┐ │
     │    │  │ KO  Coca-Cola         ✅ COMPRA  │ │
     │    │  │ Tesis: ...                       │ │
     │    │  │ Precio objetivo: 65$             │ │
     │    │  │ ⚠️ En tu cartera                 │ │
     │    │  └──────────────────────────────────┘ │
     │    │  ┌──────────────────────────────────┐ │
     │    │  │ MMM  3M             ⚠️ EVITAR   │ │
     │    │  └──────────────────────────────────┘ │
     │    │  [Ver vídeo →]                         │
     │    └────────────────────────────────────────┘
     └─ Filtros: solo cartera | todos | por verdict
```

Click en una tarjeta de empresa → expand con risks + catalyst + link al timestamp del vídeo (`youtube.com/watch?v=ID&t=1234s`).

Si la empresa está en `positions` → badge "📊 En tu cartera" + link rápido a su row en PortfolioTab.

---

## Endpoints worker.js a añadir

```javascript
// Escanea canal, procesa vídeos nuevos, devuelve resumen
POST /api/youtube/scan-channel
  body: { channel_id?: string }   // default: EL_DIVIDENDO_CHANNEL_ID
  resp: {
    new_videos: number,
    total_cost_usd: number,
    videos: [{ video_id, title, summary_general, companies: [...] }]
  }

// Lista vídeos ya procesados (sin re-scan)
GET /api/youtube/videos?limit=20&channel_id=...
  resp: { videos: [...] }

// Detalle de un vídeo concreto con todas las empresas
GET /api/youtube/video/:video_id

// Empresas mencionadas en mi cartera
GET /api/youtube/portfolio-mentions
  resp: { mentions: [{ ticker, video_count, latest_verdict, ... }] }
```

---

## Coste estimado total

| Componente | Coste/mes |
|---|---|
| Transcripciones (opción A — gratis) | $0 |
| Claude Opus 4.6 (~12 vídeos/mes × $0.15) | ~$1.80 |
| D1 storage | $0 |
| **Total** | **~$1.80/mes** (peor caso ~$5/mes con vídeos largos) |

Comparado con los 11 agentes actuales ($33/mes), sigue siendo marginal. Y al ser **manual** (botón), si una semana no lo pulsas → $0 esa semana.

---

## Pasos de implementación cuando se desbloquee

1. [ ] Visitar canal → obtener `UC...` channel ID → guardar como constante en `worker.js`
2. [ ] Crear migration D1 con las dos tablas de arriba
3. [ ] Implementar helper `fetchYouTubeUploads(channelId)` (RSS XML parse)
4. [ ] Implementar helper `fetchTranscript(videoId)` con fallback A→B
5. [ ] Endpoint `/api/youtube/scan-channel` con loop + idempotencia
6. [ ] Crear `NoticiasTab.jsx` con sub-tab YouTube + componente `YouTubeFeed`
7. [ ] Añadir tab "Noticias" al Header (entre "Agentes" y la siguiente)
8. [ ] Test: pulsar botón con canal vacío de cache → debe traer los últimos 5-10 vídeos
9. [ ] Test: pulsar botón otra vez → debe devolver "0 vídeos nuevos" (idempotencia)
10. [ ] Cross-link con `positions` para marcar empresas en cartera
11. [ ] (Opcional) Más adelante: añadir más canales de YouTube de inversión a una whitelist

---

## Riesgos / cosas a vigilar

- **Transcripción opción A puede romperse** sin avisar (YouTube cambia el endpoint timedtext). Tener fallback B listo desde día 1.
- **El canal puede subir streams largos de 2h+** → transcripción de 30k tokens. Sigue siendo barato con Haiku, pero vigilar context window.
- **Falsos positivos de empresas**: el autor puede mencionar empresas en plan ejemplo sin analizarlas. El prompt ya lo aborda pero revisar primeros resultados.
- **Tickers ambiguos**: "Telefónica" → ¿TEF.MC o TEF? Necesitará un diccionario manual de mapeo si crece.
- **Idioma**: confirmar que Haiku 4.5 maneja bien español inversor (jerga: "moat", "PER", "FCF yield") — debería, pero validar con primer vídeo.

---

## No incluido (de propósito)

- ❌ Cron automático — el usuario lo pidió manual para controlar coste
- ❌ Notificaciones push — coherente con filosofía News Agent
- ❌ Análisis de sentimiento agregado — útil pero scope creep
- ❌ Multi-canal en v1 — empezar con uno solo, validar, luego añadir
- ❌ Modificación de código en sesión actual — el usuario está trabajando en otra rama
