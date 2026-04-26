# Implementation Roadmap — Order y dependencias

> Estado: ROADMAP. Para usar cuando merge la rama paralela.
> Generado 2026-04-07.

---

## Propósito

Tienes 12 docs de diseño + 1 experimento. Cuando termines en la otra rama y empieces a implementar, **el orden importa** porque hay dependencias entre módulos. Este documento define el orden óptimo y por qué.

---

## Resumen visual de dependencias

```
                        ┌─────────────────────┐
                        │ Quality + Safety    │ ← 1º (foundation)
                        │ Scores              │
                        └──────────┬──────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
              ▼                    ▼                    ▼
    ┌─────────────────┐   ┌──────────────┐   ┌─────────────────┐
    │ Proceso Module  │   │ Earnings     │   │ Currency        │
    │ (Tesis+Journal) │   │ Intelligence │   │ Exposure        │
    └────────┬────────┘   └──────┬───────┘   └─────────────────┘
             │                   │
             │                   ▼
             │          ┌──────────────┐
             │          │ Smart Money  │
             │          │ Fondos       │
             │          └──────┬───────┘
             │                 │
             │                 ▼
             │          ┌──────────────┐
             │          │ Cartas       │
             │          │ Sabios       │
             │          └──────┬───────┘
             │                 │
             │                 ▼
             │          ┌──────────────┐
             │          │ Macro        │
             │          │ Calendar     │
             │          └──────┬───────┘
             │                 │
             ▼                 ▼
    ┌─────────────────┐  ┌──────────────┐
    │ News Agent      │  │ Discovery    │
    │                 │  │ Engine       │
    └────────┬────────┘  └──────┬───────┘
             │                  │
             └────────┬─────────┘
                      │
                      ▼
           ┌──────────────────┐
           │ Daily Briefing   │ ← LAST (synthesizes all)
           │ Agent            │
           └──────────────────┘

           ┌──────────────────┐
           │ Reading List     │ ← Independent, any time
           └──────────────────┘

           ┌──────────────────┐
           │ Politicians      │ ← Extension of Smart Money
           │ Trading          │
           └──────────────────┘
```

---

## Orden de implementación recomendado — 8 fases

### FASE 0 — Validación retroactiva ⭐ PRIORIDAD MÁXIMA

**Antes de tocar nada de producción**, correr el `experiments/score-backtest/`.

**Por qué primero**: si los Quality/Safety scores no funcionan retroactivamente, todo el sistema descansa sobre arena. Mejor saberlo en 2 horas que después de 6 días implementando.

**Tiempo**: 1-2 horas (descargar datos, correr análisis, leer reporte)

**Salida esperada**:
- ✅ Si pasa (cuts predicted ≥70%, compounders identified ≥80%) → FASE 1 con confianza
- 🟡 Si falla parcial → ajustar pesos en `score_calculator.py`, re-correr (cache hace que sea instant)
- 🔴 Si falla feo → revisar fórmulas en `quality-safety-score-design.md` antes de implementar

---

### FASE 1 — Foundation: Quality + Safety Scores

**Por qué primero**: es input crítico de Discovery, Earnings (briefings), Proceso (key metrics), Smart Money (validar candidates), Cartas (validar mentions). **Sin esto, los siguientes módulos no pueden cross-reference de forma significativa.**

**Doc**: `quality-safety-score-design.md`

**Pasos**:
1. Migration D1: 4 tablas (`quality_safety_scores`, `score_components`, `sector_benchmarks`, `score_alerts`)
2. Implementar fórmulas (port directo del Python `score_calculator.py` del backtest a JS del worker)
3. Seed `sector_benchmarks` hardcoded
4. Endpoint refresh single + all
5. Cron mensual día 5
6. Frontend: columnas Q/S en `CompanyRow`, modal drill-down, ranked portfolio view
7. Tests con tus 89 tickers reales

**Tiempo estimado**: 5-6 días

**Validación de fase**: Quality score visible en cada CompanyRow, drill-down funcional, alertas básicas activas.

**Dependencias previas**: Ninguna (foundation)

---

### FASE 2 — Disciplina: Módulo Proceso

**Por qué segundo**: estructura para todo lo demás. Las tesis se referencian desde Earnings (key metrics), Smart Money (revisar tesis post-alert), Cartas (validar tesis con menciones), Discovery (forced thesis on promote). **Sin tesis estructuradas, los demás módulos no pueden integrarse correctamente con tu pensamiento.**

**Doc**: `proceso-module-design.md`

**Pasos**:
1. Migrations D1: 7 tablas (theses, checklist_templates, checklist_runs, journal_entries, journal_reviews, thesis_reviews, annual_reviews)
2. Endpoints theses (CRUD + versionado)
3. Seed checklist templates iniciales (4 categorías)
4. Modal Tesis en Portfolio (CompanyRow badge + click)
5. Modal "Nueva compra" con checklist
6. Vista Journal con timeline
7. Auto-create journal entries desde IB Flex sync hook
8. Vista Quarterly Review
9. Annual review draft auto

**Tiempo estimado**: 5-6 días

**Validación de fase**: Puedes escribir tesis para tus 10 top positions, modal compra bloqueante funciona, journal auto-poblado desde IB sync.

**Dependencias previas**: Quality scores (para mostrar en panel lateral del modal tesis)

**ONBOARDING IMPORTANTE**: Tras FASE 2, plazo personal de 30 días para escribir tesis de las 89 posiciones (top 10 obligatorio en primera semana). Sin esto, las fases siguientes pierden mucho valor.

---

### FASE 3 — Smart Money + Cartas (en paralelo)

Se pueden hacer en paralelo porque son independientes entre sí, pero ambos benefician de Quality scores existentes (FASE 1) y de tener tesis (FASE 2) para cross-reference.

#### 3a. Smart Money (Fondos US + España + Politicians)

**Doc**: `fondos-tab-design.md`

**Pasos**:
1. D1 migrations (7 tablas)
2. Resolver CIKs reales contra `/v3/cik-search/`
3. Endpoints US 13F + Mutual funds
4. Pipeline FMP refresh
5. Detección de clusters
6. Fase backend España: parser CNMV PDFs (3 fondos: Cobas, Magallanes, azValor)
7. Fase backend Politicians (FASE 6 dentro del propio doc — opcional, postponer si tiempo apretado)
8. Frontend: 6 sub-tabs (sin Politicians inicialmente)
9. Cooldown global (es CRÍTICO compartirlo con otros módulos)

**Tiempo**: 5-6 días (sin Politicians) / 7-8 días (con Politicians)

#### 3b. Cartas Sabios

**Doc**: `cartas-sabios-design.md`

**Pasos**:
1. D1 migrations (6 tablas)
2. Seed letter_sources con los 25 sources
3. Manual upload endpoint (test pipeline)
4. Pipeline Opus structured output
5. Mac cron fetcher (reutiliza infra `sync-flex.sh`)
6. Frontend: 6 sub-tabs
7. Cross-reference con tesis y portfolio

**Tiempo**: 5-6 días

**Total FASE 3**: 5-8 días si en paralelo, 10-14 días si secuencial

**Validación**: Smart Money muestra cambios reales de los 18 fondos, Cartas tiene 5+ cartas analizadas con cross-reference funcional.

---

### FASE 4 — Earnings Intelligence

**Por qué después de FASE 3**: el Earnings Intelligence es **independiente técnicamente** pero su valor es máximo cuando ya tienes Quality scores (para detectar deterioration en briefing) y tesis (para cross-reference key metrics). Si lo implementas antes, los briefings están menos integrados.

**Doc**: `earnings-intelligence-design.md`

**Pasos**:
1. D1 migrations (5 tablas)
2. Sub-agente A: Pre-Earnings Briefer (no-LLM)
3. Sub-agente B: Post-Earnings Auto (no-LLM)
4. Sub-agente C: Post-Earnings Deep Dive (Opus)
5. Calendar view + briefing detail
6. Surprise tracker
7. Auto-trigger thesis review on `thesis_impact != intact`

**Tiempo estimado**: 5-6 días

**Validación**: Próximos earnings de tu cartera tienen briefing pre-generated, último earnings reportado tiene Track A automático, primer deep dive Opus ejecutado correctamente.

**Dependencias previas**: Quality scores (para mostrar Q/S delta en briefings), Tesis (para key metrics watchlist), Cooldown global compartido.

---

### FASE 5 — Currency Exposure

**Por qué aquí**: módulo independiente con bajo coupling. Se puede meter en cualquier momento entre FASE 1 y FASE 7. Lo coloco aquí porque es **rápido** (2-3 días) y aporta vista importante antes de Discovery.

**Doc**: `currency-exposure-design.md`

**Pasos**:
1. D1 migrations (4 tablas)
2. Pull revenue segmentation FMP por ticker
3. Seed region_currency_mapping
4. Cálculo exposure mensual
5. UI dashboard hero + sub-vistas

**Tiempo**: 2-3 días

**Validación**: Dashboard muestra exposición real por moneda con coverage quality visible.

**Dependencias previas**: Ninguna estricta (puede ser pre-Quality scores incluso)

---

### FASE 6 — Macro Calendar Layer

**Por qué aquí**: independiente, rápido (3 días), pero su valor es máximo cuando se integra con Daily Briefing (FASE 8). Puede meterse antes o después de Discovery según preferencia.

**Doc**: `macro-calendar-design.md`

**Pasos**:
1. D1 migrations (3 tablas)
2. Seed event_sector_mapping con ~25 eventos curados
3. Endpoint refresh + cron 5am
4. Cálculo exposure por user
5. Pestaña UI calendar
6. Integración con Daily Briefing endpoint

**Tiempo**: 3 días

**Validación**: Pestaña Macro muestra próximos eventos con tu exposure calculado.

**Dependencias previas**: Sector classification de tickers (ya existente del trabajo v4.0)

---

### FASE 7 — Discovery Engine

**Por qué después de TODO lo anterior**: Discovery usa como inputs:
- Quality + Safety scores (sources #2)
- Sabios mentions (source #3) → necesita Cartas
- Smart Money clusters (source #4) → necesita Fondos
- Politicians clusters (source #5) → necesita Politicians (FASE 3 opcional)
- Insider buying (source #6) → endpoint nuevo
- Earnings predictability (source #8) → necesita Earnings
- Currency exposure underweight (source #9) → necesita Currency
- Etc.

**Sin las fases anteriores, Discovery solo tiene 4-5 sources de los 13 funcionando.**

**Doc**: `discovery-engine-design.md`

**Pasos**:
1. D1 migrations (6 tablas)
2. Implementar las 13 sources como queries
3. Composite scoring formula
4. Cron diario 7am
5. User filters CRUD
6. Sub-tab "💡 Discovery" en Watchlist
7. Modal investigate
8. Stats tracking de conversion por source

**Tiempo estimado**: 4-5 días

**Validación**: Cola muestra ~10-20 candidatos con scores realistas, sources funcionando con datos cruzados.

---

### FASE 8 — News Agent + Daily Briefing Agent (FINAL)

#### 8a. News Agent

**Doc**: `news-agent-design.md`

**Pasos**:
1. D1 migrations (3 tablas)
2. Cron 3x/día fetch FMP news
3. Haiku classifier
4. Active learning UI

**Tiempo**: 3 días

#### 8b. Daily Briefing Agent ⭐

**Doc**: `daily-briefing-agent-design.md`

**Por qué LAST de los core**: necesita inputs de TODOS los módulos previos. Es el sintetizador del sistema.

**Pasos**:
1. Endpoint `briefing-input?since=...` en cada módulo (8 endpoints)
2. D1 migrations
3. Prompt Opus con plantilla
4. Pipeline diario 6:00 ET
5. Email service integration (Cloudflare Email Workers)
6. Templates HTML
7. In-app vista

**Tiempo**: 5-6 días

**Validación**: Recibes email diario con 6 secciones bien sintetizadas, las acciones sugeridas son realmente accionables.

**Total FASE 8**: 8-9 días

---

### FASE 9 — Reading List (en cualquier momento)

**Doc**: `reading-list-design.md`

**Por qué independiente**: cero dependencias técnicas con otros módulos. Puede implementarse antes, durante o después. Su única integración es el Quotes Wall unificado con Cartas Sabios (después de FASE 3) y la sección en Daily Briefing (después de FASE 8).

**Recomendación**: hacerlo en cualquier semana de "low energy" entre fases mayores.

**Tiempo**: 4-5 días

---

## Resumen de tiempos

| Fase | Módulo | Días | Acumulado |
|------|--------|------|-----------|
| 0 | Backtest validación | 0.25 | 0.25 |
| 1 | Quality + Safety Scores | 5-6 | 6 |
| 2 | Módulo Proceso | 5-6 | 12 |
| 3 | Smart Money + Cartas (paralelo) | 5-8 | 20 |
| 4 | Earnings Intelligence | 5-6 | 26 |
| 5 | Currency Exposure | 2-3 | 29 |
| 6 | Macro Calendar | 3 | 32 |
| 7 | Discovery Engine | 4-5 | 37 |
| 8 | News + Daily Briefing | 8-9 | 46 |
| 9 | Reading List | 4-5 | 51 |

**Total realista**: ~50 días de trabajo concentrado.

---

## Quick wins paralelos (en cualquier momento)

Mientras avanzas las fases, hay quick wins de la `ideas-fmp-global.md` que se pueden meter en huecos:

| Quick win | Tiempo | Cuándo |
|-----------|--------|--------|
| Forward dividend yield columna Portfolio | 0.5 día | Tras FASE 1 |
| Price target consensus badge en CompanyRow | 0.5 día | Tras FASE 1 |
| Insider activity icon en Portfolio | 1 día | Tras FASE 7 |
| Reemplazar FMP_MAP hack | 1-2 días | Cualquier momento |
| Earnings surprise streak en alertas existentes | 0.5 día | Tras FASE 4 |

---

## Riesgos del orden propuesto

| Riesgo | Mitigación |
|--------|------------|
| Backtest tarda más de lo esperado | Acepta hasta 1 día, si no convence → ajustar pesos antes de implementar |
| FASE 1 (Scores) más compleja en JS que Python | Port directo del backtest, las fórmulas están validadas |
| FASE 2 (Tesis) requiere onboarding del usuario (escribir 89 tesis) | Plazo flexible 3 meses, top 10 prioritario primera semana |
| Cooldown global conflictos entre módulos | Diseñar en FASE 3 con interface compartida desde inicio |
| FMP cobertura inconsistente para internacionales | Aceptar limitación, fallbacks en cada módulo |
| Daily Briefing sale "AI slop" inicialmente | 1 semana de tuning del prompt antes de email delivery |
| Burnout de 50 días seguidos de trabajo | Pausas explícitas entre fases, no es sprint |

---

## Decision points clave durante implementación

### Tras FASE 1 (Scores live)
**Pregunta**: ¿Los scores reflejan la realidad de tu cartera?
- ✅ Sí → continuar FASE 2
- ❌ No → iterar pesos antes de FASE 2

### Tras FASE 2 (Proceso live)
**Pregunta**: ¿Has escrito tesis para top 10 posiciones?
- ✅ Sí → continuar FASE 3
- ❌ No → pausar feature dev, dedicar 1 semana a escribir tesis

### Tras FASE 4 (Earnings live)
**Pregunta**: ¿Los deep dives Opus generan análisis útil?
- ✅ Sí → continuar
- ❌ No → iterar prompt + reducir triggers para no quemar coste

### Tras FASE 7 (Discovery live)
**Pregunta**: ¿Tras 1 mes, qué % de candidatos investigaste?
- ≥30% → sistema funciona, continuar
- <30% → ajustar filtros, demasiado ruido

### Tras FASE 8 (Daily Briefing live)
**Pregunta**: ¿Lees el email todos los días?
- ✅ Sí → sistema completo y funcional
- ❌ No → diagnosticar: ¿es muy largo? ¿muy genérico? ¿llega tarde?

---

## Cuándo NO seguir este orden

Razones válidas para alterar el orden:

1. **Si el backtest falla**: pausar todo, repensar pesos antes de FASE 1
2. **Si tienes earnings importantes próximas semanas**: adelantar FASE 4 antes que FASE 3
3. **Si un evento macro grande se acerca** (FOMC, elecciones): adelantar FASE 6
4. **Si encuentras un bug crítico en producción**: para todo, fix primero
5. **Si una feature tiene momentum especial** (ej. acabas de leer una carta increíble y quieres Cartas Sabios YA): el momentum vale más que el orden óptimo

**Pero**: nunca saltar FASE 0 (backtest) ni FASE 1 (scores). Esos son foundation real.

---

## Testing strategy por fase

Cada fase debe terminar con:

1. **Tests unitarios** del cálculo/lógica core
2. **Integration test** end-to-end del happy path
3. **Manual test** con tu cartera real
4. **Documentación** de cualquier desviación del doc original
5. **Update CLAUDE.md** con nueva feature en producción

---

## Backup strategy

Antes de cada FASE:
1. `git commit` del estado actual
2. Branch nueva para la fase
3. Backup D1 (`wrangler d1 backup`)
4. Test en preview deployment antes de production

---

## Sostenibilidad post-implementación

Una vez todo implementado (~50 días totales):

**Monthly maintenance**:
- Quality scores: cron mensual, 15 min revisión
- Cartas Sabios: revisar fetchers que rompieron
- News Agent: feedback batch de unrelevant
- Politicians (si implementado): nuevos congresistas elegidos

**Quarterly maintenance**:
- Sector benchmarks update
- Re-evaluar conviction scores Smart Money
- Revisar Daily Briefing prompt con nuevos ejemplos
- Annual review preparation

**Annual maintenance**:
- Reading List stats annual
- Annual review sistema completo
- Backup full
- Cleanup datos viejos (> 24 meses según política)

---

## Por qué este orden es óptimo

Resumiendo en 1 frase: **construir foundations primero (scores + proceso), luego inputs externos (smart money + cartas + earnings), luego layers analíticas (currency + macro + discovery), y finalmente la síntesis (news + briefing)**.

Cada fase es valuable por sí misma incluso si parases ahí. Pero el sistema completo es mucho más que la suma.

Y si en algún momento sientes que es demasiado y quieres parar, **el corte natural es después de FASE 4** (~26 días). Con Quality + Proceso + Smart Money + Cartas + Earnings tienes ya un sistema profesional que la mayoría de inversores individuales nunca tendrá. Las fases 5-9 son refinamientos importantes pero no críticos.
