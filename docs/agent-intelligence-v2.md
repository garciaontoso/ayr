# Agent Intelligence v2 — Memory, Calibration, Sectoral (2026-04-18)

## Critique de v1

Los 14 agentes actuales son **amnésicos y solitarios**:
- Cada run empieza de cero — no recuerdan haber dicho "critical PFE" hace 3 semanas
- Cada ticker se evalúa aislado — no ven que 3 REITs sanitarios están críticos la misma semana (contagio sectorial)
- Ninguno sabe su propia tasa de acierto — el agente que flagga 15 criticals al mes de los cuales solo 2 se materializan merece menos confianza en el #16
- Research Agent investiga, entrega verdict, **se olvida**. Si mañana vuelvo a preguntar por el mismo ticker, vuelve a investigar de cero.

Resultado: los agentes **clasifican pero no aprenden**. El usuario hace el trabajo de sintetizar la memoria.

## Objetivo v2

Cada agente ve, antes de emitir verdict:
1. **Su propio historial con este ticker** (últimas 5 verdicts de este agente sobre este ticker + lo que pasó después)
2. **El Research Agent notebook del ticker** (última investigación profunda, evidencia clave, qué confirmar)
3. **Su accuracy a 30d** (de signal_tracking, cuando aplicable)
4. **Contexto sectorial** (¿cuántos peers del sector están críticos hoy? señal idiosincrática vs contagio)

Después de emitir verdict, **actualiza el notebook** del ticker con la línea nueva.

## Arquitectura

### Schema

```sql
CREATE TABLE ticker_notebook (
  ticker TEXT PRIMARY KEY,
  summary TEXT,               -- 2-3 frase sinopsis viva, updated por Research
  open_questions TEXT,        -- JSON array de cosas a confirmar en próximo earnings
  agent_history TEXT,         -- JSON { dividend: [{date, verdict, severity, brief}],
                              --        earnings: [...], trade: [...], research: [...] }
  last_research_id INTEGER,   -- FK a research_investigations
  last_research_date TEXT,
  sector TEXT,                -- cached del positions, acelera sectoral queries
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_ticker_notebook_sector ON ticker_notebook(sector);
```

### Helpers

```js
// Lee notebook de un ticker
getTickerNotebook(env, ticker) → { ticker, summary, openQuestions[], agentHistory, lastResearch }

// Batch para N tickers (dividend/earnings agents procesan 80+)
getTickerNotebooksBatch(env, tickers) → { [ticker]: notebook }

// Append verdict de un agente al historial
appendAgentVerdict(env, ticker, agentName, { verdict, severity, brief, fecha })
  // Mantiene sólo últimas 10 por agente (dedup)

// Research Agent escribe después de finish()
writeResearchNotebook(env, ticker, { research_id, verdict, summary, open_questions, evidence_types })

// Accuracy a 30d de un agente (necesita signal_tracking con outcomes)
getAgentAccuracy(env, agentName, days = 30) → {
  total, correct, accuracy, recent_wrong: [{ticker, verdict, outcome}]
}

// Sectoral stress — cuántos peers del sector tienen critical hoy
getSectorStress(env, sector, fecha) → {
  totalPositions, criticalCount, criticalTickers[], primarySignal
}
```

### Integration points

**Dividend agent** (`runDividendAgent`):
```js
const notebooks = await getTickerNotebooksBatch(env, tickers);
const divAccuracy = await getAgentAccuracy(env, 'dividend', 30);
const sectorStressMap = await getSectorStressBatch(env, sectors);

// En el payload de cada ticker, añadir:
{
  ...existingFields,
  notebook: notebooks[ticker]?.summary,
  agentHistorySelf: notebooks[ticker]?.agentHistory?.dividend?.slice(0, 5),
  lastResearch: notebooks[ticker]?.lastResearch,
  openQuestions: notebooks[ticker]?.openQuestions,
  sectorStress: sectorStressMap[sector],
}

// System prompt añade:
"Tu accuracy a 30d en 'critical': 22%. Sé específico sobre qué hace
ESTE caso diferente a tus falsos positivos anteriores."

// Tras el batch: para cada verdict emitido, appendAgentVerdict(...)
```

**Research Agent** (`runResearchAgent`):
- Al iniciar, carga notebook del ticker e inyecta en system prompt
- Añade tool `get_ticker_notebook` por si quiere consultar peers
- Tras `finish()`, llama `writeResearchNotebook` con summary + open_questions + evidence_types
- El NEXT research run ve "hace 21 días dijiste TRIM por X. Update."

**Earnings agent**: igual que dividend pero con accuracy específica de earnings.

**Trade agent**: tiene notebook de TODAS las posiciones al sintetizar; ve claramente qué tickers tienen un verdict anterior reciente no resuelto.

## Ejemplo: PFE before vs after

**BEFORE (agente amnésico)**:
```
dividend: "PFE FCF coverage 0.93x, critical, cut risk high"
```

**AFTER (con memoria + accuracy + sector)**:
```
dividend: "PFE coverage 0.93x (était 1.05x hace 60d, deteriorando). Es la
  3a vez que flaggo critical este año; las 2 anteriores el precio subió
  +2% 30d después (falso positivo). PERO: esta vez FCF/share -65% vs
  2022 (Research Agent 2026-04-18), CEO Q4 sin mencionar sostenibilidad
  (red flag nuevo). 3 farmas grandes críticas hoy (PFE/MRK/BMY) →
  contagio rate-driven parcial. Veredicto: warning (era critical) —
  trimming 25% justificado, no liquidar."
```

## Alcance de esta sesión

**Phase A (~90 min)**:
- Schema ticker_notebook + migration
- 4 helpers core (getTickerNotebook, batch, appendAgentVerdict, writeResearchNotebook)
- Wire en runDividendAgent (el de más volumen, valor visible inmediato)
- Wire en runResearchAgent (read + write)
- Test manual: corre dividend agent, verifica que el notebook se rellenó,
  corre otra vez, verifica que la segunda run VE la primera

**Phase B (siguiente sesión)**:
- getAgentAccuracy + signal_tracking integration
- getSectorStress
- Wire en earnings + trade
- Proactive triggers (Research Agent se auto-dispara si notebook flagg "hechos nuevos")

**Phase C (futuro)**:
- Dashboard notebook viewer (tab de cada ticker muestra su notebook)
- Notebook + Decision Journal: cada decisión humana se archiva con el notebook del momento
- Counterfactual reasoning tools

## Cost

Los notebooks SON los datos — lectura/escritura D1 gratis. Los prompts crecen ~500-800 tokens por ticker pero eso es ~5% del input de dividend. Coste marginal: $0.02-0.05/día. **Prácticamente free.**

El valor: cada run acumula conocimiento. A 3 meses, un ticker como PFE tendrá 60+ verdicts históricos, 3-4 investigaciones Research, y el agente podrá ver patrones (¿cuántas veces ha dicho critical y no pasó nada? ¿hay signales nuevas vs las anteriores veces?).
