# Research Agent — Design (2026-04-18)

## Why
Los 14 agentes actuales hacen 1-shot classification: reciben datos, emiten veredicto, terminan. No razonan en múltiples pasos, no investigan contradicciones, no consultan contexto histórico bajo demanda. Son un screener glorificado con prompts finos.

Ejemplo de limitación: hoy AHRT salió como **dividend critical + insider buys** (contradicción gorda). Ningún agente persigue eso. Un humano miraría: *¿qué dice el 10-Q más reciente? ¿qué director compró y por cuánto? ¿hay filings recientes que expliquen la divergencia?*

## Goal
Un único agente nuevo (no 15 más) que:
- Se invoca on-demand (manual o trigger automático por contradicción detectada)
- Usa **tool use** (Claude SDK) para decidir qué datos pedir
- Itera hasta llegar a una conclusión accionable
- Cita evidencia concreta (transcript quote, filing event, número específico)
- Tiene budget cap explícito ($3 max, 15 tool calls max, 5 min max)

## Arquitectura

### Orchestrator (Opus con tool use)
```
User/Auto → POST /api/research-agent { ticker, question?, depth? }
          ↓
Orchestrator inicializa context (portfolio, agentes_today_for_ticker)
          ↓
Loop:
  1. Opus decide: ¿qué tool llamar? O ¿ya tengo suficiente?
  2. Ejecuta tool (D1 query / R2 read / FMP fetch / SEC fetch)
  3. Devuelve resultado a Opus
  4. Si Opus llama finish() → salir con verdict
  5. Si cap alcanzado (15 calls / 5 min / $3) → cortar y emitir verdict parcial
          ↓
Guarda investigation en D1 (research_investigations)
Devuelve verdict + trail al caller
```

### Tools (MVP)
| Tool | Firma | Uso |
|---|---|---|
| `query_agent_insights` | `(ticker?, agent?, days?)` | Qué dijo cada agente sobre el ticker recientemente |
| `get_fundamentals` | `(ticker)` | Snapshot Q+S + TTM + profile desde D1 |
| `get_transcript` | `(ticker, offset?)` | Texto del transcript más reciente (paginado para ver Q&A) |
| `get_sec_filings` | `(ticker, formType?, limit?)` | SEC EDGAR submissions (8-K items, 10-Q/K) |
| `get_long_term_series` | `(ticker)` | R2 docs/ticker/gf_financials condensado (30y divs/FCF/EPS) |
| `query_peer_positions` | `(sector, capSize?)` | Tickers peer del mismo sector para comparación |
| `get_price_history` | `(ticker, days)` | Precios y dividendos pagados del período |
| `query_db` | `(sql)` *read-only* | Escape hatch para queries SQL a medida (D1) |
| `finish` | `(verdict, confidence, action, evidence[])` | Termina con conclusión |

### Storage

Nueva tabla D1:
```sql
CREATE TABLE research_investigations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT,
  question TEXT,
  trigger_reason TEXT,  -- 'manual' | 'contradiction_auto' | 'cron'
  started_at TEXT NOT NULL,
  finished_at TEXT,
  duration_s REAL,
  tool_calls_json TEXT,   -- array of { tool, args, result_summary, tokens }
  total_tool_calls INTEGER,
  total_tokens_in INTEGER,
  total_tokens_out INTEGER,
  cost_usd REAL,
  final_verdict TEXT,     -- 'ADD' | 'HOLD' | 'TRIM' | 'SELL' | 'NEEDS_HUMAN' | 'INSUFFICIENT_DATA'
  confidence TEXT,        -- 'low' | 'medium' | 'high'
  summary TEXT,           -- 1-2 sentences, shown in UI
  evidence_json TEXT,     -- array of { type, citation, snippet }
  full_response TEXT      -- complete Opus response (for audit)
);
CREATE INDEX idx_research_ticker ON research_investigations(ticker);
CREATE INDEX idx_research_started ON research_investigations(started_at DESC);
```

### Budget caps
- `MAX_TOOL_CALLS = 15` por investigación
- `MAX_WALL_TIME_S = 300` (5 min)
- `MAX_COST_USD = 3` (~60K tokens Opus)
- Cada tool añade su `tokens_used` (aproximado) al running total

### Triggers
**Phase 1 (hoy)**: Manual. POST /api/research-agent body: { ticker, question?, reason? }

**Phase 2 (sig sesión)**: Auto-contradiction detector corre después del cron diario:
- dividend critical + insider buys/trade ADD → research
- trade SELL + value ADD (contradicción) → research
- earnings critical pero longTerm30y.divCuts empty → research (puede ser one-off)
- dividend cut warning + analyst_downgrade coincide 2 runs seguidas → research

**Phase 3 (futuro)**: Trigger sobre patrones sectoriales (3+ tickers mismo sector con críticos = investigar contagio).

## Endpoint API

```
POST /api/research-agent
Body: { ticker: "AHRT", question?: "¿Por qué los insiders compran mientras el dividendo peligra?", depth?: "quick"|"deep" }
Response:
  201 { investigation_id, summary, verdict, confidence, evidence, cost, tool_calls }
  429 { error: "budget exceeded" }
  500 { error, partial_result? }
```

## Prompt base

```
Eres un analista senior de equity investigando {ticker} para un portfolio de dividendos long-term.

PREGUNTA: {question || "¿Cuál es el veredicto actualizado sobre este ticker dadas las señales de hoy?"}

SEÑALES DEL DÍA (agentes han emitido):
{formatAgentInsights(ticker, today)}

TIENES ACCESO A TOOLS — úsalos para investigar. Propone hipótesis y verifícalas.
El objetivo es un verdict ACCIONABLE con evidencia citable, no un ensayo.

Reglas:
- Máximo 15 tool calls (presupuesto). Empieza por lo más barato (D1) antes de SEC/FMP remote.
- Si una contradicción no se resuelve con los datos → verdict NEEDS_HUMAN + explica qué falta.
- Cita evidencia concreta: "transcript Q3 2025: 'inflation negative volume'", no vaguedades.
- finish() debe llevar: verdict ∈ {ADD, HOLD, TRIM, SELL, NEEDS_HUMAN, INSUFFICIENT_DATA}, confidence, summary 1-2 frases, evidence [3-5 items].
```

## Coste estimado
- Opus input: ~30K tokens × $15/M = $0.45
- Opus output: ~5K tokens × $75/M = $0.38
- Per investigación: **~$0.80-1.00**
- Si el user lanza 5/semana: $4-5/semana = $20/mes

Si el auto-trigger detecta 3 contradicciones/día → $3/día = $90/mes. Hay que capar: máximo 3 auto-investigaciones/día.

## Rollout plan

**Session 1 (hoy)**:
- Schema migration
- 3 tools core: `query_agent_insights`, `get_fundamentals`, `get_long_term_series`
- Orchestrator mínimo (sin pagination/budget estricto pero con MAX_TOOL_CALLS)
- Endpoint manual
- Test contra AHRT

**Session 2**:
- Resto de tools (transcript, SEC, peers, db, price_history)
- Budget tracking real (tokens → USD)
- Frontend UI: tab "🔬 Research" con input ticker + vista de trail

**Session 3**:
- Auto-trigger diario (detector de contradicciones + cap 3/día)
- Notificaciones push si verdict cambia mucho
- Integración con Decision Journal (las investigaciones feedean el journal)

## Métricas de éxito
- ¿Las investigaciones producen verdicts que el user usaría? (YES/NO por investigación, trackeable)
- ¿El ratio señal/ruido supera al de `dividend` solo? (comparar insights precisos vs genéricos)
- ¿Las contradicciones se resuelven o necesitan humano? (>70% resuelto = útil; <30% = waste)
