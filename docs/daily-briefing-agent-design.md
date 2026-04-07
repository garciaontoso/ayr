# Daily Briefing Agent — El sintetizador

> Estado: DISEÑO. No implementar hasta merge de rama paralela.
> Generado 2026-04-07.

---

## Propósito

Resolver el problema más grave que crea el resto del sistema: **sobrecarga cognitiva**.

Con 7 módulos diseñados (Quality, Smart Money, Cartas, Earnings, Discovery, Proceso, News), cada uno generando datos, alertas, candidatos y eventos, el usuario se enfrentará a:
- 8-12 push notifications/semana (cooldown global)
- 30+ noticias procesadas/día
- Cambios en scores diarios/mensuales
- Nuevas cartas trimestrales analizadas
- Earnings reports semanales en season
- Smart Money cluster detections
- Discovery candidatos nuevos
- Tesis necesitando review

Sin un sintetizador, esto se convierte en **burnout informativo**. La gente abandona apps por exactamente esta razón — demasiada información sin curación.

**Solución**: un único documento al día, generado por Opus, que cuente al usuario lo que **realmente importa** de las últimas 24 horas en su contexto de inversor. **"Lee 5 minutos por la mañana y estás al día."**

Este es **el módulo más importante de todo el sistema**. Sin él, los otros 7 son ruido organizado. Con él, son inteligencia accionable.

---

## Filosofía

### El briefing perfecto

Imagina que tienes un analista personal que:
1. **Ha leído todo lo que pasó ayer** en tu cartera, watchlist, fondos seguidos, cartas nuevas, news, cambios en scores
2. **Conoce tu tesis** de cada posición y tu proceso de decisión
3. **Sabe qué te importa** y qué no (de tu journal histórico)
4. **Te escribe 1 página** cada mañana resumiendo "lo que necesitas saber hoy"
5. **Identifica acciones** concretas que puedes tomar

Eso es exactamente este agente. No es un dashboard, no es un feed, no es un RSS. Es **una persona escribiéndote**.

### Lo que NO es

- ❌ NO es una lista de bullets sin priorizar
- ❌ NO es "todo lo que pasó ayer"
- ❌ NO es un dashboard interactivo
- ❌ NO es push notifications
- ❌ NO es trading signals

### Lo que SÍ es

- ✅ Una narrativa coherente en español, ~600-1000 palabras
- ✅ Priorizada por impacto en TUS decisiones
- ✅ Vinculada a TUS tesis y journal
- ✅ Con sección clara de "acciones sugeridas" si las hay
- ✅ Honesto cuando no pasó nada relevante ("hoy día tranquilo, no hay nada que requiera tu atención")

---

## Estructura del briefing diario

Plantilla fija con 6 secciones (algunas pueden estar vacías en días tranquilos):

```markdown
# Briefing Diario — 7 abril 2026, lunes

## TL;DR (3-5 frases)
[El analista resume lo más importante en 3-5 frases. Si no hay nada
material, lo dice claramente: "Día tranquilo. Mercado plano, sin novedades
en tu cartera ni en los fondos seguidos. Sigue con lo planificado."]

## 🎯 Acciones sugeridas (0-5 items)
[Solo aparece si hay acciones reales. Cada acción tiene:
- Qué hacer
- Por qué
- Urgencia (alta/media/baja)
- Link al módulo relevante]

## 📊 Tu cartera ayer
[Resumen del día: P&L total, top mover up, top mover down, evento más
relevante. Si hay earnings, incluirlos. Si hay cambios en scores
materiales, mencionarlos.]

## 🧠 Smart Money + Cartas
[Movimientos relevantes de los 18 fondos seguidos en tus tickers, nuevas
cartas analizadas, menciones de tu cartera. Solo lo material — el filtro
del módulo Fondos ya hizo su trabajo, aquí solo aparece lo que pasó las
últimas 24h.]

## 📰 Noticias destacadas
[Top 3-5 noticias filtradas del News Agent, con summary del analista.
Solo las que tienen relevance_score ≥ 70.]

## 💡 Discovery + Reflexión
[Si hay nuevos candidatos HOT del Discovery Engine, mencionarlos.
Si hay tesis necesitando review, recordarlo.
Si hay journal entries pendientes de completar, recordarlo.
Si no hay nada → omitir sección.]
```

### Ejemplo de briefing real

```markdown
# Briefing Diario — 8 abril 2026, martes

## TL;DR
Día relevante. **KO reporta hoy antes de mercado** — tu posición 4.2%, tesis
al día, briefing pre-earnings ya generado. **Cobas publicó carta Q1'26
ayer** mencionando dos posiciones tuyas (CIR positivamente, MAIRE neutral).
Y **el Quality Score de WBA cayó a 51** tras los datos del último filing,
te recomendaría revisar si sigue en watchlist.

## 🎯 Acciones sugeridas

1. **Revisar briefing pre-earnings KO antes de las 9:00 ET** — alta urgencia.
   El consenso es $0.71, whisper $0.73, beat rate 87%. Tu peso 4.2%
   dentro del target 4-5%. Tesis al día (revisada hace 2 meses).
   → [Ver briefing KO](#)

2. **Decidir sobre WBA en watchlist** — media urgencia.
   Quality cayó de 67 a 51 en 3 meses. Safety en 42 (zona crítica).
   Probablemente conviene sacarlo de watchlist permanentemente.
   → [Ver score breakdown WBA](#)

3. **Completar 2 entradas de journal** pendientes de la semana pasada
   (compra MA del 2 abril, venta PYPL del 3 abril) — baja urgencia
   pero ayuda a mantener disciplina.
   → [Ir al journal](#)

## 📊 Tu cartera ayer
P&L: **+$1,847 (+0.14%)**, en línea con SPY (+0.18%).
Top up: **MA +1.8%** (sin noticia específica, momentum positivo).
Top down: **PYPL -2.4%** (rumores de competencia FedNow, no material).
Sin earnings ayer en cartera. Mañana: **KO antes de mercado**, V después
del cierre.

## 🧠 Smart Money + Cartas

**Cobas Internacional Q1'26** (carta publicada ayer):
- Mantiene tesis sobre **CIR** (mencionada positivamente, "core position
  intacta tras el resultado anual"). Tienes CIR al 0.4%.
- Menciona **MAIRE Tecnimont** sin cambio de tesis, neutralidad — sigue
  siendo posición top 5 del fondo. No tienes MAIRE.
- Nueva entrada: **Stellantis** 3.8% peso. No te afecta directamente.

**Sin movimientos 13F nuevos** en tus tickers ayer (ya estamos post-deadline
del Q1, próximo refresh 15 mayo).

## 📰 Noticias destacadas

1. **KO** raises FY guidance ahead of Q1 earnings (Reuters) — material y
   en línea con el beat rate histórico. El briefing pre-earnings ya lo
   refleja.

2. **MSFT** EU antitrust investigation widens — categoría regulatory,
   medium materiality. No requiere acción, vigilar evolución.

3. **ABT** raises dividend 7% (51st consecutive year) — buena noticia para
   tu posición ABT (en watchlist, no en cartera). Refuerza tesis si
   estabas considerando entrada.

## 💡 Discovery + Reflexión

**Nuevo candidato HOT del Discovery Engine**: **NESN.SW** (Nestlé) —
Score 89. Aparece en 4 fuentes simultáneas (Quality + Safety alta, Tom
Russo annual letter mention, Aristocrat europeo, sector staples
underweight tu cartera). Vale la pena 15 minutos de investigación esta
semana. → [Ver candidato](#)

**Recordatorio**: tu tesis de **PYPL** lleva 14 meses sin revisar. El
score Quality cayó de 67 a 52 desde la última revisión. Sería buen
momento para decidir formalmente: ¿mantienes la tesis o la marcas como
rota? → [Revisar tesis PYPL](#)

---

*Briefing generado 8 abril 2026 06:30 ET por el Daily Briefing Agent.
Coste de generación: $0.31. Si una sección no te aporta, dale feedback
para mejorar futuros briefings.*
```

Esto es la diferencia entre **información** y **inteligencia**.

---

## Pipeline técnico

### Frecuencia
**Diaria**, generado a las **6:00 ET** (12:00 CET), antes del pre-market US.

### Pipeline detallado

```
1. Recolectar inputs de TODOS los módulos (cada uno tiene endpoint
   /api/{module}/briefing-input?since={yesterday_06_ET}):

   a. Portfolio: P&L día, top movers, eventos
   b. Earnings Intelligence: briefings hoy, results ayer, deep dives
   c. Smart Money: cambios de holdings nuevos en tus tickers
   d. Cartas Sabios: nuevas cartas analizadas, menciones de tu cartera
   e. Quality + Safety: cambios materiales (>5pts) en tus tickers
   f. News Agent: top noticias relevance ≥ 70 últimas 24h
   g. Discovery Engine: nuevos candidatos HOT
   h. Proceso Module: tesis pendientes review, journal pendientes

2. Construir prompt Opus con TODO el contexto + plantilla estructurada +
   instrucciones de estilo (español, ~800 palabras, prioritized, honest):

3. Llamar Opus claude-opus-4-6:
   - Input: ~15-25k tokens (contexto + datos)
   - Output: ~2-3k tokens (briefing en markdown)
   - Coste: ~$0.30-0.45/día

4. Render del markdown a HTML para email

5. Enviar email al usuario (preferred channel) o storage in-app
   ambos según preference

6. Marcar inputs como "incluidos en briefing" para no duplicar mañana

7. Insert briefing en daily_briefings table para histórico
```

### Prompt Opus — esqueleto

```
SYSTEM:
Eres el analista personal del usuario. Tu trabajo es escribir un briefing
diario en español, conciso y accionable. Seguirás SIEMPRE la plantilla de
6 secciones. Eres honesto cuando un día es tranquilo. Priorizas señal sobre
ruido. Vinculas tu análisis a la tesis del usuario y su journal cuando es
relevante.

CONTEXT:
- User profile: dividend growth investor, 89 positions, ~$1.35M NLV
- Style: long-term, quality compounders, value español
- Sectors: Consumer Staples 18%, Tech 16%, Healthcare 12%, ...
- Average position weight: 1.1%, top positions: MSFT (6.1%), MA (3.4%)

DATA (last 24h):
[Portfolio summary]
[Earnings inputs]
[Smart Money changes]
[Cartas mentions]
[Score changes]
[News top]
[Discovery new]
[Proceso pending]

USER TESIS (relevant ones):
[Cartera tesis with key metrics]

INSTRUCTIONS:
- Escribe en español natural, no traducción
- Plantilla obligatoria de 6 secciones (omite las vacías)
- TL;DR primero, máximo 5 frases
- Acciones sugeridas con urgencia y razón
- Ejemplos concretos, no genéricos
- Si un día es tranquilo, dilo claramente, no rellenes
- Cita fuentes ("Cobas Q1'26", "FMP earnings calendar")
- Vincula al journal cuando hay decisiones recientes
- ~600-1000 palabras total
- Output: markdown bien formateado

OUTPUT:
[markdown del briefing]
```

### Coste

Por briefing:
- Input: ~20k tokens × $15/M = $0.30
- Output: ~2.5k tokens × $75/M = $0.19
- **Total: ~$0.49/día**

Por mes: ~$15/mes.

Cap mensual: **$25 hard, alerta a $20**.

Esto es coste real notable, pero **es el módulo más importante**. Vale la pena.

---

## Schema D1

```sql
CREATE TABLE daily_briefings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  briefing_date TEXT NOT NULL UNIQUE,         -- '2026-04-08'
  generated_at TEXT NOT NULL,

  -- Contenido
  briefing_md TEXT NOT NULL,                  -- markdown completo
  briefing_html TEXT,                          -- versión HTML para email
  tldr TEXT,                                   -- TL;DR extractado para preview

  -- Metadata
  word_count INTEGER,
  sections_present_json TEXT,                  -- ['tldr','actions','portfolio',...]
  actions_count INTEGER,                       -- # acciones sugeridas

  -- Inputs snapshot (para auditoría / re-análisis)
  inputs_summary_json TEXT,

  -- Cost tracking
  opus_cost_usd REAL,
  input_tokens INTEGER,
  output_tokens INTEGER,

  -- Delivery
  email_sent BOOLEAN DEFAULT 0,
  email_sent_at TEXT,
  in_app_read BOOLEAN DEFAULT 0,
  in_app_read_at TEXT,

  -- User feedback
  feedback_rating INTEGER,                     -- 1-5 stars
  feedback_text TEXT,
  feedback_at TEXT
);
CREATE INDEX idx_db_date ON daily_briefings(briefing_date DESC);

-- Inputs snapshots para no duplicar entre briefings
CREATE TABLE briefing_input_log (
  briefing_id INTEGER NOT NULL,
  source_module TEXT NOT NULL,                -- 'earnings' | 'smart_money' | etc
  input_id TEXT NOT NULL,                     -- id del item original
  included_at TEXT NOT NULL,
  PRIMARY KEY (briefing_id, source_module, input_id),
  FOREIGN KEY (briefing_id) REFERENCES daily_briefings(id)
);
```

---

## Endpoints worker.js

```js
GET  /api/briefing/today                       // briefing de hoy
GET  /api/briefing/{date}                      // por fecha histórica
GET  /api/briefing/recent?limit=7              // últimos 7
POST /api/briefing/generate                    // forzar regenerar hoy
POST /api/briefing/{id}/feedback               // user rating + texto
GET  /api/briefing/stats?period=30d            // costo, ratings, secciones medias

// Inputs (llamados por el agente, no por usuario)
GET  /api/portfolio/briefing-input?since=...
GET  /api/earnings/briefing-input?since=...
GET  /api/funds/briefing-input?since=...
GET  /api/letters/briefing-input?since=...
GET  /api/scores/briefing-input?since=...
GET  /api/news/briefing-input?since=...
GET  /api/discovery/briefing-input?since=...
GET  /api/proceso/briefing-input?since=...
```

Cada módulo expone su propio endpoint que devuelve "lo material de las últimas 24h" en formato consistente que el agente sintetiza.

---

## Delivery — email vs in-app

### Email (recomendado canal principal)
- Generado y enviado a las 6:00 ET
- HTML formateado con estilos minimalistas (parecido a Stratechery, no marketing)
- Subject line: "Briefing 8 abr — KO reporta hoy + Cobas mencionó tu CIR"
  (extraído del TL;DR para preview en bandeja)
- Provider: usar Cloudflare Email Workers o servicio externo (SendGrid, Postmark)
- Plain text fallback automático
- Unsubscribe / pausa opcional (vacaciones)

### In-app
- Vista "📰 Briefing diario" en home tab
- Calendario de briefings históricos
- Star/save de briefings importantes
- Feedback rating 1-5 estrellas + textbox

### Por qué email primero
- **Inversión es lectura** — el habitat natural es el email matutino con café
- **Off-app** — fuerza desconexión de la app, evita doomscrolling
- **Forwarable** — puedes reenviar a un compañero o guardar en notes
- **Searchable** — gmail search es mejor que cualquier UI in-app
- **Universal** — funciona en móvil, desktop, tablet sin app

---

## Aprendizaje activo

### Feedback explícito
Cada briefing tiene rating 1-5 estrellas + textbox opcional. Después de 30 días:
- Briefings con rating bajo → analizar qué secciones tenían más ruido
- Briefings con rating alto → reforzar el estilo

### Feedback implícito
Track:
- ¿Abrió el email?
- ¿Lo leyó completo? (pixel de lectura simple)
- ¿Hizo click en alguna "acción sugerida"?
- ¿Las acciones sugeridas terminaron en operaciones reales?

### Iteración del prompt
Mensualmente, reanalizar:
- Top 5 briefings best rated → extraer patrones
- Top 5 briefings worst rated → identificar problemas
- Ajustar prompt SYSTEM con ejemplos del usuario

Después de 6 meses, el briefing está perfectamente calibrado a tu estilo y preferencias.

---

## Integración con resto del sistema

### Es el centro de gravedad del sistema completo

El Daily Briefing es **lo único que el usuario necesita leer cada día**. Todo lo demás del sistema vive bajo esta promesa:

```
Otros módulos hacen el trabajo pesado en silencio.
Daily Briefing entrega 1 documento con todo lo que importa.
Si una sección del briefing dice "ver detalles" → user va al módulo.
```

### Integración específica con cada módulo

| Módulo | Aporte al briefing |
|--------|-------------------|
| Portfolio | P&L día, top movers, eventos cartera |
| Earnings Intelligence | Reports hoy/ayer, deep dives nuevos, briefings pre-earnings |
| Smart Money (Fondos) | Cambios holdings ≥3% en tus tickers, clusters detectados |
| Politicians | Trades en tus tickers o cluster relevante |
| Cartas Sabios | Nuevas cartas analizadas con menciones tuyas |
| Quality + Safety | Cambios materiales (≥5pts) en tus posiciones |
| News Agent | Top 3-5 noticias relevance ≥70 |
| Discovery Engine | Nuevos candidatos HOT (score ≥85) |
| Proceso Module | Tesis pendientes review, journal entries pendientes |

---

## Wireframes

### Email recibido
```
From: A&R Briefing <briefing@ayr.onto-so.com>
Subject: Briefing 8 abr — KO reporta hoy + Cobas mencionó tu CIR

[HTML email con plantilla simple, fuente serif para lectura larga,
secciones bien separadas, links internos a la app]
```

### In-app
```
┌─ Briefing diario · 8 abril 2026 ──────────────────────┐
│                                                         │
│ [Texto del briefing renderizado markdown→HTML]         │
│                                                         │
│ ─────────────────────────────────────                  │
│ ¿Te ha sido útil este briefing?                        │
│ ⭐⭐⭐⭐⭐                                                │
│ [Comentario opcional...]                               │
│ [Enviar feedback]                                       │
│                                                         │
│ ◀ Briefing 7 abril    ·    Briefing 9 abril ▶          │
└─────────────────────────────────────────────────────────┘
```

### Vista histórica
```
┌─ Briefings anteriores ─────────────────────────────────┐
│ [Filtro: Esta semana | Mes | Año] [⭐ Solo starred]    │
│                                                         │
│ 📅 8 abr lun · ⭐⭐⭐⭐ · 3 acciones                       │
│   "KO reporta hoy + Cobas mencionó CIR..."             │
│                                                         │
│ 📅 7 abr dom · ⭐⭐ · 0 acciones                          │
│   "Día tranquilo, sin novedades..."                    │
│                                                         │
│ 📅 6 abr sáb · ⭐⭐⭐⭐⭐ · 5 acciones ⭐                   │
│   "Earnings season caliente esta semana..."            │
│                                                         │
│ ...                                                     │
└─────────────────────────────────────────────────────────┘
```

---

## Implementación por fases

### Fase 1 — Inputs collectors (1 día)
1. Endpoint `briefing-input?since=...` en cada módulo
2. Schema consistente JSON output
3. Snapshot logic para no duplicar

### Fase 2 — Agent core (2 días)
4. D1 migrations
5. Prompt Opus con plantilla
6. Pipeline diario 6:00 ET
7. Cost tracking + cap
8. Markdown → HTML render

### Fase 3 — Email delivery (1 día)
9. Email service integration (Cloudflare Email Workers preferido)
10. Templates HTML minimalistas
11. Plain text fallback
12. Subject line generator

### Fase 4 — In-app (1 día)
13. Vista home tab "Briefing diario"
14. Vista histórica
15. Feedback UI
16. Mark as read

### Fase 5 — Aprendizaje (medio día)
17. Tracking implícito (open, click)
18. Stats dashboard
19. Mensual review prompt iteration helper

**Total**: 5-6 días concentrados.

---

## Decisiones tomadas

| Decisión | Opción elegida | Razón |
|----------|----------------|-------|
| Frecuencia | **Diaria 6:00 ET** | Matutino antes pre-market US |
| Modelo | **Opus** | Síntesis narrativa coherente requiere top model |
| Canal principal | **Email** | Inversión = lectura, off-app, universal |
| Canal secundario | **In-app vista** | Para histórico y feedback |
| Estructura | **6 secciones fijas con plantilla** | Consistencia ayuda lectura rápida |
| Idioma | **Español natural** | Idioma nativo del usuario |
| Length | **600-1000 palabras** | Lectura 5 min, ni más ni menos |
| Honestidad días tranquilos | **SÍ, decir explícito "día tranquilo"** | Anti-relleno, anti-FOMO |
| Acciones sugeridas | **Sí, con urgencia y razón** | Hace el briefing accionable, no solo informativo |
| Vinculación a tesis/journal | **Sí, cuando relevante** | Cierra el loop con Módulo Proceso |
| Coste cap mensual | **$25 hard** | Notable pero el módulo es el más importante |
| Aprendizaje | **Feedback explícito + implícito** | Mejora con tiempo |

---

## Riesgos y limitaciones

| Riesgo | Mitigación |
|--------|------------|
| Briefings genéricos / "AI slop" | Prompt iterativo con ejemplos reales del usuario, feedback loop |
| Coste se infla con tokens | Cap mensual, monitoring por briefing |
| Día tranquilo → briefing repetitivo | Plantilla obligatoria para "días tranquilos" con texto natural variado |
| Email no se lee | Tracking implícito, alerta si rating cae |
| Opus alucina datos | Validar números contra fuente antes de incluir, cross-check con D1 |
| Latencia en generación | Async con queue, alerta si >5min |
| Email service down | Fallback in-app, retry 3x |
| User abrumado por demasiadas acciones | Cap 5 acciones máximo por briefing |
| User ignora acciones | Stats de "acción → operación real" muestran efectividad |
| Pérdida de momentum | Si user no abre 7 días seguidos → email "¿Quieres pausar?" |

---

## Por qué este módulo es CRÍTICO

He insistido varias veces en esto porque es fácil subestimarlo. Recapitulemos:

1. **Sin briefing, los 7 módulos previos son ruido organizado**. Generan datos pero no inteligencia. La inteligencia es la síntesis.

2. **Es la diferencia entre app abandonada y app esencial**. Los usuarios abandonan apps por 2 razones: (a) no aporta valor, (b) aporta tanto valor que abruma. El briefing resuelve (b).

3. **Es lo único que un humano necesita leer**. Todo lo demás del sistema funciona en silencio. El usuario solo lee 1 cosa al día y está al día. Esto es **respetar el tiempo del usuario**.

4. **Es entrenable**. Con feedback explícito + implícito, después de 6 meses está perfectamente calibrado. Ningún competidor genérico (Bloomberg, Seeking Alpha) puede ofrecer esto porque no conocen tu cartera, tu tesis, tu journal.

5. **Es lo más cerca que puedes estar de "tener un analista personal"**. No es marketing — un humano que hiciera esto cada día costaría $5000+/mes. Aquí cuesta $15/mes.

6. **Modela la disciplina correcta de inversión**. Un inversor disciplinado lee informes una vez por la mañana, no refresca dashboard cada 5 minutos. El briefing entrena ese hábito.

---

## Próximos pasos cuando termine la rama paralela

1. Diseñar los `briefing-input?since=...` endpoints en cada módulo
2. Schema D1 + agent core
3. Prompt iteración con 5-10 días de inputs reales antes de production
4. Email service setup (Cloudflare Email Workers preferido por integración)
5. Lanzar en silencio 1 semana, leer briefings tú mismo, ajustar
6. Activar email delivery cuando estés satisfecho

## Decisiones aún pendientes

1. **¿Domingo y fines de semana?** → opción A: skip weekends. opción B: digest del fin de semana lunes. opción C: briefing reducido cada día. **Mi voto**: opción B — un briefing potente lunes con todo el fin de semana resumido
2. **¿Permitir "deep dive Opus" on-demand?** → "expande la sección X" botón → llamada Opus extra. Útil pero coste extra. Decidir post-MVP
3. **¿Multi-language?** → MVP español only, inglés como secundario en Fase 6 si quieres compartir con compañeros
4. **¿PDF export del briefing?** → para archivo offline. Trivial técnicamente. Sí en MVP
5. **¿Briefing semanal expandido los domingos?** → ~2x length, review de la semana completa. Sería el "weekly review" del módulo Proceso. Considerar Fase 6
