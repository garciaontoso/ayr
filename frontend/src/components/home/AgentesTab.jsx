import React, { useState, useEffect, useCallback, useRef } from 'react';
import { API_URL } from '../../constants/index.js';
import { InlineLoading } from '../ui/EmptyState.jsx';

/* ═══════════════════════════════════════════
   AI Agents Dashboard — A&R v4.1 (FMP Ultimate)
   11 agents — 5 Opus, 1 Haiku, 5 sin LLM
   ═══════════════════════════════════════════ */

const GOLD = '#d69e2e';
const GOLD_DIM = 'rgba(214,158,46,.12)';
const RED = '#f87171';
const YELLOW = '#f59e0b';
const GREEN = '#34d399';
const CARD_BG = 'var(--card)';
const BORDER = 'var(--border)';
const FM = 'var(--fm)';
const FB = 'var(--fb)';

const card = (extra = {}) => ({
  background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 16,
  padding: '20px 24px', ...extra,
});

const AGENTS = [
  { id: 'regime', name: 'Pulso del Mercado', icon: '🧭', desc: 'Bull/bear, sectores, credito',
    info: 'Analiza 24 ETFs (sectores, factores, credito, commodities) para determinar si estamos en mercado alcista, bajista o en transicion. Compara ciclicos vs defensivos, HYG/LQD para estres crediticio, y QUAL/MTUM/VLUE vs SPY para detectar ventas indiscriminadas.',
    model: 'Haiku', dataSources: 'FMP Ultimate (24 ETFs batch quote + spark), VIX, Fear & Greed' },
  { id: 'earnings', name: 'Vigilante de Earnings', icon: '📊', desc: 'Resultados, revenue + transcripts',
    info: 'Opus analiza earnings de tus 85 posiciones combinando numeros (EPS/revenue surprise) con transcripts de earnings calls (management commentary, tono, guidance). Distingue temporal vs estructural: charges one-time, restructuring, M&A integration son INFO; secular decline + margin compression sin plan = WARNING/CRITICAL. Cita literalmente al management cuando puede.',
    model: 'Opus', dataSources: 'FMP (earnings, estimates, segments, transcripts 114 cacheados), GuruFocus (growth/momentum rank)' },
  { id: 'dividend', name: 'Guardian de Dividendos', icon: '🛡️', desc: 'Payout, FCF, racha, cortes',
    info: 'Opus evalua la seguridad del dividendo de cada posicion. Analiza payout ratio, cobertura de FCF, owner earnings, historial de dividendos REAL de tu cuenta IB, y trend de 8 quarters (revenue, FCF, debt, dividendsPaid) desde FMP Ultimate. Reconoce que dividendo cortado para pagar deuda = bullish strategic restructuring (no critical).',
    model: 'Opus', dataSources: 'FMP (ratios, cashflow, owner earnings, 8-quarter trends), D1 (pagos reales IB), GuruFocus (financial strength, shareholder yield, streak)' },
  { id: 'risk', name: 'Control de Riesgo', icon: '⚠️', desc: 'Concentracion, beta, drawdown',
    info: 'Opus mide riesgo de concentracion (top 5 holdings, sector allocation, Herfindahl), beta ponderado del portfolio, max drawdown 60d, coste de margen vs income, y alineacion con el regimen actual. Beta/Sharpe/Sortino/maxDD calculados desde 1 ano de daily prices vs SPY benchmark.',
    model: 'Opus', dataSources: 'D1 (positions, NLV, margin interest), FMP (1y daily prices → beta/vol/Sharpe/Sortino/maxDD)' },
  { id: 'macro', name: 'Radar Macro', icon: '🌍', desc: 'Tipos, inflacion, Fed, commodities',
    info: 'Sintesis macro compleja con Opus. Analiza calendario economico (CPI, empleo, Fed), treasury rates, yield curve, y cruza con los 24 ETFs de mercado. Evalua credito (HYG/LQD), commodities (GLD/USO), y el impacto en tu portfolio de dividendos como residente fiscal en China.',
    model: 'Opus', dataSources: 'FMP (economic calendar, treasury), Market indicators (24 ETFs), Pulso mercado, Margin interest' },
  { id: 'trade', name: 'Asesor de Operaciones', icon: '🎯', desc: 'Debate bull/bear con Opus',
    info: 'Sistema de 3 pasos: (1) Haiku argumenta A FAVOR de cada posicion, (2) Haiku contraargumenta con RIESGOS, (3) Opus sintetiza ambos + insights de todos los agentes. La conviction refleja la fuerza del debate. Usa GF Value, insider/guru activity, y DCF. Filosofia long-term: NUNCA recomienda vender calidad en dips temporales.',
    model: 'Haiku+Haiku+Opus', dataSources: 'Todos los agentes, FMP (DCF, price targets), GuruFocus (GF Value, GF Score, RSI)' },
  { id: 'postmortem', name: 'Historial de Aciertos', icon: '📋', desc: 'Evaluacion de senales pasadas',
    info: 'Sin LLM — calculo puro. Cada dia revisa senales de hace 7 y 30 dias. BUY/ADD correcto si precio subio >2%, SELL/TRIM correcto si precio bajo >2%. Guarda accuracy rate para medir si los agentes aciertan.',
    model: 'Sin LLM', dataSources: 'D1 (signal_tracking, positions)' },
  { id: 'insider', name: 'Radar de Insiders', icon: '🕵️', desc: 'Compras/ventas de insiders',
    info: 'Monitoriza actividad insider (CEO, CFO, directivos) en tus posiciones. Compras de insiders = senal alcista. Ventas masivas = senal bajista. Detecta patrones recurrentes (ventas planificadas 10b5-1) vs ventas inusuales. Muestra impacto en precio post-trade. Soporta tickers internacionales.',
    model: 'Sin LLM', dataSources: 'FMP Ultimate /stable/insider-trading/search (transactions Form 4)' },
  { id: 'value', name: 'Value Signals', icon: '💎', desc: 'Oportunidades del dinero inteligente',
    info: 'Busca oportunidades reales: escanea tu portfolio + 120 Dividend Aristocrats/Champions para encontrar acciones infravaloradas segun GF Value. Incluye sugerencia de Put selling para cada oportunidad (strike, prima estimada, yield total). Filtros: GF Score >60, Financial Strength >5, descuento >10%.',
    model: 'Sin LLM', dataSources: 'GuruFocus (GF Value, GF Score — proprietary), D1 (portfolio positions)' },
  { id: 'options', name: 'Options Income', icon: '🎰', desc: 'CC, CSP, spreads con datos reales',
    info: 'Escanea tus 20 mayores posiciones buscando oportunidades de income con opciones. Covered Calls (5-10% OTM) para posiciones con 100+ acciones, Cash Secured Puts para comprar mas barato, y Bull Put Spreads en SPY/QQQ. Usa precios reales de Yahoo Finance (bid/ask) — FMP Ultimate no expone options chain bajo /stable. Evita posiciones con earnings cercanos.',
    model: 'Sin LLM', dataSources: 'Yahoo Finance + IB (options chain, Greeks), D1 (positions, shares), Market regime (VIX)' },
  { id: 'summary', name: 'Resumen Ejecutivo', icon: '📌', desc: 'Top acciones del dia',
    info: 'Resumen automatico generado al final del pipeline. Muestra las acciones mas importantes a tomar hoy: operaciones recomendadas, alertas de insiders, oportunidades de opciones, y estado del mercado. Es lo primero que debes mirar.',
    model: 'Sin LLM', dataSources: 'Todos los agentes (compilado)' },
];

const SEV_COLORS = { critical: RED, warning: YELLOW, info: GREEN };
const SEV_ORDER = { critical: 0, warning: 1, info: 2 };

function SeverityPill({ severity }) {
  const color = SEV_COLORS[severity] || GREEN;
  return (
    <span style={{
      fontSize: 9, padding: '2px 8px', borderRadius: 6,
      background: `${color}20`, color, fontWeight: 700, fontFamily: FM,
      letterSpacing: .5, textTransform: 'uppercase',
    }}>{severity}</span>
  );
}

function ScoreBadge({ score }) {
  const color = score >= 7 ? GREEN : score >= 4 ? YELLOW : RED;
  return (
    <span style={{
      fontSize: 18, fontWeight: 800, color, fontFamily: FM,
    }}>{score?.toFixed?.(1) || '—'}</span>
  );
}

const DEFAULT_ORDER = AGENTS.map(a => a.id);

export default function AgentesTab() {
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [filterAgent, setFilterAgent] = useState(null);
  const [filterSev, setFilterSev] = useState(null);
  const [showAllInfo, setShowAllInfo] = useState(false);
  const [days, setDays] = useState(7);
  const [expandedId, setExpandedId] = useState(null);
  const [minYield, setMinYield] = useState(0);
  const [portfolioFilter, setPortfolioFilter] = useState('all');
  const [viewMode, setViewMode] = useState('timeline');
  const [portfolioSort, setPortfolioSort] = useState('severity');
  const [agentOrder, setAgentOrder] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ayr-agent-order')) || DEFAULT_ORDER; } catch { return DEFAULT_ORDER; }
  });

  const moveAgent = (id, dir) => {
    const idx = agentOrder.indexOf(id);
    if (idx < 0) return;
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= agentOrder.length) return;
    const newOrder = [...agentOrder];
    [newOrder[idx], newOrder[newIdx]] = [newOrder[newIdx], newOrder[idx]];
    setAgentOrder(newOrder);
    localStorage.setItem('ayr-agent-order', JSON.stringify(newOrder));
  };

  const sortedAgents = agentOrder.map(id => AGENTS.find(a => a.id === id)).filter(Boolean);
  // Add any new agents not in saved order
  for (const a of AGENTS) { if (!agentOrder.includes(a.id)) sortedAgents.push(a); }

  const fetchInsights = useCallback(async () => {
    setLoading(true);
    try {
      let url = `${API_URL}/api/agent-insights?days=${days}`;
      if (filterAgent) url += `&agent=${filterAgent}`;
      if (filterSev) url += `&severity=${filterSev}`;
      const resp = await fetch(url);
      const data = await resp.json();
      setInsights(data.insights || []);
    } catch (e) {
      console.error('Agent insights fetch error:', e);
    }
    setLoading(false);
  }, [days, filterAgent, filterSev]);

  const pollRef = useRef(null);
  useEffect(() => { fetchInsights(); return () => { if (pollRef.current) clearInterval(pollRef.current); }; }, [fetchInsights]);

  const runAgents = async () => {
    setRunning(true);
    try {
      await fetch(`${API_URL}/api/agent-run`, { method: 'POST' });
      if (pollRef.current) clearInterval(pollRef.current);
      let checks = 0;
      pollRef.current = setInterval(async () => {
        checks++;
        await fetchInsights();
        if (checks >= 12) { clearInterval(pollRef.current); pollRef.current = null; setRunning(false); }
      }, 30000);
      setTimeout(() => fetchInsights(), 5000);
    } catch (e) {
      console.error('Agent run error:', e);
      setRunning(false);
    }
  };

  const [runningAgent, setRunningAgent] = useState(null);

  const runSingleAgent = async (agentId) => {
    setRunningAgent(agentId);
    try {
      // Cache market data first if running regime/macro
      if (agentId === 'regime' || agentId === 'macro') {
        await fetch(`${API_URL}/api/agent-run?agent=cache`, { method: 'POST' });
      }
      await fetch(`${API_URL}/api/agent-run?agent=${agentId}`, { method: 'POST' });
      setTimeout(() => fetchInsights(), 2000);
    } catch (e) {
      console.error(`Run ${agentId} error:`, e);
    }
    setRunningAgent(null);
  };

  // Group insights by agent for cards
  const byAgent = {};
  for (const a of AGENTS) byAgent[a.id] = [];
  for (const i of insights) {
    if (byAgent[i.agent_name]) byAgent[i.agent_name].push(i);
  }

  // Latest insight per agent
  const latestByAgent = {};
  for (const a of AGENTS) {
    const list = byAgent[a.id];
    if (list.length) latestByAgent[a.id] = list[0];
  }

  // Filtered timeline
  const timeline = [...insights].filter(i => {
    // Apply yield filter for value agent
    if (minYield > 0 && i.agent_name === 'value') {
      const yieldNum = i.details?.dividendYieldNum || parseFloat(i.details?.dividendYield) || 0;
      if (yieldNum < minYield) return false;
    }
    // Apply portfolio/new filter for value agent
    if (portfolioFilter !== 'all' && i.agent_name === 'value') {
      if (portfolioFilter === 'portfolio' && i.details?.enPortfolio !== 'SI') return false;
      if (portfolioFilter === 'new' && i.details?.enPortfolio !== 'NO') return false;
    }
    return true;
  }).sort((a, b) => {
    const sevDiff = (SEV_ORDER[a.severity] || 2) - (SEV_ORDER[b.severity] || 2);
    if (sevDiff !== 0) return sevDiff;
    return b.fecha > a.fecha ? 1 : -1;
  });

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto', padding: '0 8px' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, fontFamily: FB, color: 'var(--text-primary)', margin: 0 }}>
            AI Agents
          </h2>
          <p style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: FM, margin: '4px 0 0' }}>
            10 agentes monitorizando tu portfolio diariamente a las 11:00 Madrid
          </p>
        </div>
        <button
          onClick={runAgents}
          disabled={running}
          style={{
            background: running ? 'var(--border)' : GOLD, color: running ? 'var(--text-tertiary)' : '#000',
            border: 'none', borderRadius: 10, padding: '8px 18px', fontSize: 11,
            fontWeight: 700, fontFamily: FB, cursor: running ? 'default' : 'pointer',
            opacity: running ? .6 : 1, transition: 'all .2s',
          }}
        >
          {running ? 'Ejecutando...' : 'Ejecutar Agentes'}
        </button>
      </div>

      {/* ── Agent Cards Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 24 }}>
        {sortedAgents.map((agent, agentIdx) => {
          const agentInsights = byAgent[agent.id] || [];
          const latest = latestByAgent[agent.id];
          const critCount = agentInsights.filter(i => i.severity === 'critical').length;
          const warnCount = agentInsights.filter(i => i.severity === 'warning').length;
          const isActive = filterAgent === agent.id;
          const topSev = critCount ? 'critical' : warnCount ? 'warning' : 'info';
          const topColor = SEV_COLORS[topSev];

          return (
            <div
              key={agent.id}
              onClick={() => setFilterAgent(isActive ? null : agent.id)}
              style={{
                ...card({
                  padding: '16px 18px', cursor: 'pointer', transition: 'all .2s',
                  borderColor: isActive ? GOLD : BORDER,
                  boxShadow: isActive ? `0 0 0 1px ${GOLD}` : 'none',
                }),
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 20 }}>{agent.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, fontFamily: FB, color: 'var(--text-primary)' }}>{agent.name}</div>
                  <div style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: FM }}>{agent.desc}</div>
                </div>
                <div style={{ display: 'flex', gap: 2 }}>
                  {agentIdx > 0 && <button onClick={(e) => { e.stopPropagation(); moveAgent(agent.id, -1); }} style={{ width: 16, height: 16, borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-tertiary)', fontSize: 8, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Mover izquierda">&#9664;</button>}
                  {agentIdx < sortedAgents.length - 1 && <button onClick={(e) => { e.stopPropagation(); moveAgent(agent.id, 1); }} style={{ width: 16, height: 16, borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-tertiary)', fontSize: 8, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Mover derecha">&#9654;</button>}
                  <button onClick={(e) => { e.stopPropagation(); setShowAllInfo(!showAllInfo); }} style={{
                    width: 16, height: 16, borderRadius: '50%', border: `1px solid ${showAllInfo ? GOLD : 'var(--border)'}`,
                    background: showAllInfo ? GOLD_DIM : 'transparent', color: showAllInfo ? GOLD : 'var(--text-tertiary)',
                    fontSize: 8, fontWeight: 700, fontFamily: FM, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: 0, lineHeight: 1,
                  }}>i</button>
                </div>
              </div>

              {/* Info panel */}
              {showAllInfo && (
                <div style={{
                  marginBottom: 10, padding: '10px 12px', borderRadius: 8,
                  background: 'var(--bg)', fontSize: 9, fontFamily: FM,
                  color: 'var(--text-secondary)', lineHeight: 1.6,
                }}>
                  <div style={{ marginBottom: 6 }}>{agent.info}</div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <span><span style={{ color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: .5 }}>Modelo: </span><span style={{ color: GOLD, fontWeight: 700 }}>{agent.model}</span></span>
                    <span><span style={{ color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: .5 }}>Datos: </span>{agent.dataSources}</span>
                  </div>
                </div>
              )}

              {latest ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%', background: topColor, display: 'inline-block',
                    }} />
                    <SeverityPill severity={topSev} />
                    {(critCount > 0 || warnCount > 0) && (
                      <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: FM }}>
                        {critCount > 0 && `${critCount} crit`}{critCount > 0 && warnCount > 0 && ' · '}{warnCount > 0 && `${warnCount} warn`}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-secondary)', fontFamily: FM, lineHeight: 1.4 }}>
                    {latest.title}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                    <span style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: FM }}>{latest.fecha}</span>
                    <button onClick={(e) => { e.stopPropagation(); runSingleAgent(agent.id); }} disabled={runningAgent === agent.id} style={{
                      fontSize: 8, padding: '2px 8px', borderRadius: 4, cursor: runningAgent === agent.id ? 'default' : 'pointer',
                      background: runningAgent === agent.id ? 'var(--border)' : GOLD_DIM, color: runningAgent === agent.id ? 'var(--text-tertiary)' : GOLD,
                      border: 'none', fontWeight: 700, fontFamily: FM, letterSpacing: .3,
                    }}>{runningAgent === agent.id ? '...' : 'Ejecutar'}</button>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: FM, fontStyle: 'italic' }}>Sin datos</span>
                  <button onClick={(e) => { e.stopPropagation(); runSingleAgent(agent.id); }} disabled={runningAgent === agent.id} style={{
                    fontSize: 8, padding: '2px 8px', borderRadius: 4, cursor: runningAgent === agent.id ? 'default' : 'pointer',
                    background: runningAgent === agent.id ? 'var(--border)' : GOLD, color: runningAgent === agent.id ? 'var(--text-tertiary)' : '#000',
                    border: 'none', fontWeight: 700, fontFamily: FM,
                  }}>{runningAgent === agent.id ? 'Ejecutando...' : 'Ejecutar'}</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Filters ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {/* View toggle */}
        {['timeline', 'portfolio'].map(v => (
          <button key={v} onClick={() => setViewMode(v)} style={{
            fontSize: 9, padding: '4px 12px', borderRadius: 6, cursor: 'pointer',
            background: viewMode === v ? GOLD : 'transparent',
            color: viewMode === v ? '#000' : 'var(--text-tertiary)', fontWeight: 700, fontFamily: FB,
            border: `1px solid ${viewMode === v ? GOLD : 'var(--border)'}`,
          }}>{v === 'timeline' ? 'Timeline' : 'Por Empresa'}</button>
        ))}
        <span style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 2px' }} />
        <button onClick={() => { setFilterSev(null); setFilterAgent(null); }} style={{
          fontSize: 9, padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
          background: !filterSev && !filterAgent ? GOLD_DIM : 'transparent',
          color: !filterSev && !filterAgent ? GOLD : 'var(--text-tertiary)', fontWeight: 700, fontFamily: FM,
          border: `1px solid ${!filterSev && !filterAgent ? GOLD : 'var(--border)'}`,
        }}>Todos ({insights.length})</button>
        {['critical', 'warning', 'info'].map(sev => {
          const count = insights.filter(i => i.severity === sev).length;
          return (
            <button key={sev} onClick={() => setFilterSev(filterSev === sev ? null : sev)} style={{
              fontSize: 9, padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
              background: filterSev === sev ? `${SEV_COLORS[sev]}30` : 'transparent',
              color: SEV_COLORS[sev], fontWeight: 700, fontFamily: FM,
              border: `1px solid ${filterSev === sev ? SEV_COLORS[sev] : 'var(--border)'}`,
              letterSpacing: .5, textTransform: 'uppercase',
            }}>{sev} ({count})</button>
          );
        })}
        <span style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />
        {[1, 7, 30].map(d => (
          <button key={d} onClick={() => setDays(d)} style={{
            fontSize: 9, padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
            background: days === d ? GOLD_DIM : 'transparent',
            color: days === d ? GOLD : 'var(--text-tertiary)', fontWeight: 700, fontFamily: FM,
            border: `1px solid ${days === d ? GOLD : 'var(--border)'}`,
          }}>{d}d</button>
        ))}
        {/* Yield filter — only shows when Value Signals agent is selected */}
        {filterAgent === 'value' && (
          <>
            <span style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />
            <span style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: FM }}>Div min:</span>
            {[0, 2, 3, 4, 5].map(y => (
              <button key={y} onClick={() => setMinYield(minYield === y ? 0 : y)} style={{
                fontSize: 9, padding: '3px 8px', borderRadius: 6, cursor: 'pointer',
                background: minYield === y ? GREEN + '25' : 'transparent',
                color: minYield === y ? GREEN : 'var(--text-tertiary)', fontWeight: 700, fontFamily: FM,
                border: `1px solid ${minYield === y ? GREEN : 'var(--border)'}`,
              }}>{y === 0 ? 'All' : `${y}%+`}</button>
            ))}
            <span style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />
            {['all', 'portfolio', 'new'].map(f => (
              <button key={f} onClick={() => setPortfolioFilter(portfolioFilter === f ? 'all' : f)} style={{
                fontSize: 9, padding: '3px 8px', borderRadius: 6, cursor: 'pointer',
                background: portfolioFilter === f ? GOLD_DIM : 'transparent',
                color: portfolioFilter === f ? GOLD : 'var(--text-tertiary)', fontWeight: 700, fontFamily: FM,
                border: `1px solid ${portfolioFilter === f ? GOLD : 'var(--border)'}`,
              }}>{f === 'all' ? 'Todas' : f === 'portfolio' ? 'En cartera' : 'Nuevas'}</button>
            ))}
          </>
        )}
      </div>

      {/* ── Portfolio View ── */}
      {viewMode === 'portfolio' && !loading && (() => {
        const COLS = [
          { id: 'dividend', icon: '🛡️', label: 'Dividendo' },
          { id: 'earnings', icon: '📊', label: 'Earnings' },
          { id: 'trade', icon: '🎯', label: 'Asesor' },
          { id: 'options', icon: '🎰', label: 'Opciones' },
          { id: 'insider', icon: '🕵️', label: 'Insiders' },
          { id: 'value', icon: '💎', label: 'Valor' },
        ];

        // Group insights by ticker
        const byTicker = {};
        for (const i of insights) {
          if (i.ticker?.startsWith('_') || !i.ticker) continue;
          if (!byTicker[i.ticker]) byTicker[i.ticker] = {};
          if (!byTicker[i.ticker][i.agent_name]) byTicker[i.ticker][i.agent_name] = [];
          byTicker[i.ticker][i.agent_name].push(i);
        }

        // Sort function
        const sortCol = portfolioSort || 'severity';
        let rows = Object.entries(byTicker).map(([ticker, agents]) => {
          const all = Object.values(agents).flat();
          const worstSev = all.some(i => i.severity === 'critical') ? 2 : all.some(i => i.severity === 'warning') ? 1 : 0;
          const colScores = {};
          for (const c of COLS) {
            const top = agents[c.id]?.sort((a, b) => (b.score || 0) - (a.score || 0))[0];
            colScores[c.id] = top?.score || -1;
          }
          return { ticker, agents, worstSev, colScores, agentCount: Object.keys(agents).length };
        });

        if (sortCol === 'severity') rows.sort((a, b) => b.worstSev - a.worstSev || b.agentCount - a.agentCount);
        else if (sortCol === 'ticker') rows.sort((a, b) => a.ticker.localeCompare(b.ticker));
        else rows.sort((a, b) => (a.colScores[sortCol] ?? -1) - (b.colScores[sortCol] ?? -1)); // low score = worse = first

        return (
          <div style={{ overflowX: 'auto' }}>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: FM, marginBottom: 8 }}>
              {rows.length} empresas · Click en columna para ordenar
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 8, fontFamily: FM }}>
              <thead>
                <tr style={{ borderBottom: `2px solid var(--border)` }}>
                  <th onClick={() => setPortfolioSort(portfolioSort === 'ticker' ? 'severity' : 'ticker')} style={{ padding: '6px 8px', textAlign: 'left', cursor: 'pointer', color: portfolioSort === 'ticker' ? GOLD : 'var(--text-tertiary)', fontWeight: 700, fontSize: 9, fontFamily: FB, whiteSpace: 'nowrap' }}>
                    Ticker {portfolioSort === 'ticker' ? '▲' : portfolioSort === 'severity' ? '⚠' : ''}
                  </th>
                  {COLS.map(col => (
                    <th key={col.id} onClick={() => setPortfolioSort(portfolioSort === col.id ? 'severity' : col.id)} style={{ padding: '6px 8px', textAlign: 'center', cursor: 'pointer', color: portfolioSort === col.id ? GOLD : 'var(--text-tertiary)', fontWeight: 700, fontSize: 8, fontFamily: FB, minWidth: 110, whiteSpace: 'nowrap' }}>
                      {col.icon} {col.label} {portfolioSort === col.id ? '▲' : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ ticker, agents, worstSev }) => (
                  <tr key={ticker} style={{ borderBottom: '1px solid var(--subtle-border, var(--border))' }}>
                    <td style={{ padding: '8px', verticalAlign: 'top' }}>
                      <span style={{ fontSize: 11, fontWeight: 800, fontFamily: FB, color: GOLD }}>{ticker}</span>
                      <span style={{ marginLeft: 4 }}><SeverityPill severity={worstSev === 2 ? 'critical' : worstSev === 1 ? 'warning' : 'info'} /></span>
                    </td>
                    {COLS.map(col => {
                      const agentInsights = agents[col.id];
                      if (!agentInsights?.length) {
                        return <td key={col.id} style={{ padding: '6px 8px', textAlign: 'center', verticalAlign: 'top' }}>
                          <span style={{ fontSize: 8, color: 'var(--subtle-border, var(--border))' }}>—</span>
                        </td>;
                      }
                      const top = agentInsights.sort((a, b) => (b.score || 0) - (a.score || 0))[0];
                      const color = SEV_COLORS[top.severity] || GREEN;
                      return (
                        <td key={col.id} style={{ padding: '6px 8px', verticalAlign: 'top' }}>
                          <div style={{ padding: '6px 8px', borderRadius: 6, background: `${color}08`, borderLeft: `3px solid ${color}`, minHeight: 40 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                              <SeverityPill severity={top.severity} />
                              <span style={{ fontSize: 12, fontWeight: 800, fontFamily: FM, color }}>{top.score?.toFixed?.(1) || '—'}</span>
                            </div>
                            <div style={{ fontSize: 8, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3, marginBottom: 2 }}>
                              {top.title.replace(/^(CC|CSP|BPS|ADD|NEW|ACTION):?\s*/i, '').replace(ticker + ':', '').replace(ticker, '').trim().slice(0, 40)}
                            </div>
                            <div style={{ fontSize: 7, color: 'var(--text-secondary)', lineHeight: 1.3 }}>
                              {top.summary?.slice(0, 80)}{top.summary?.length > 80 ? '...' : ''}
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}

      {/* ── Timeline ── */}
      {viewMode === 'timeline' && loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><InlineLoading msg="Cargando insights..." /></div>
      ) : viewMode === 'timeline' && timeline.length === 0 ? (
        <div style={{ ...card({ textAlign: 'center', padding: 40 }) }}>
          <span style={{ fontSize: 32 }}>🤖</span>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: FM, marginTop: 8 }}>
            No hay insights. Pulsa "Ejecutar Agentes" para generar el primer analisis.
          </p>
        </div>
      ) : viewMode === 'timeline' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {timeline.map(insight => {
            const color = SEV_COLORS[insight.severity] || GREEN;
            const agentInfo = AGENTS.find(a => a.id === insight.agent_name);
            const isExpanded = expandedId === insight.id;
            const details = insight.details || {};

            return (
              <div
                key={insight.id}
                onClick={() => setExpandedId(isExpanded ? null : insight.id)}
                style={{
                  ...card({
                    padding: '14px 18px', cursor: 'pointer', transition: 'all .15s',
                    borderLeft: `4px solid ${color}`,
                  }),
                }}
              >
                {/* Row header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14 }}>{agentInfo?.icon || '🤖'}</span>
                  <SeverityPill severity={insight.severity} />
                  {insight.ticker && !insight.ticker.startsWith('_') && (
                    <span style={{
                      fontSize: 9, padding: '2px 7px', borderRadius: 4,
                      background: GOLD_DIM, color: GOLD, fontWeight: 700, fontFamily: FM,
                    }}>{insight.ticker}</span>
                  )}
                  <span style={{ flex: 1, fontSize: 11, fontWeight: 700, fontFamily: FB, color: 'var(--text-primary)' }}>
                    {insight.title}
                  </span>
                  <ScoreBadge score={insight.score} />
                  <span style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: FM, minWidth: 60, textAlign: 'right' }}>
                    {insight.fecha}
                  </span>
                </div>

                {/* Summary */}
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: FM, marginTop: 6, lineHeight: 1.5 }}>
                  {insight.summary}
                </div>

                {/* Expanded details */}
                {isExpanded && Object.keys(details).length > 0 && (() => {
                  const SKIP_KEYS = new Set(['trades','topTrades','vendedoresRecurrentes','positionsChecked']);
                  const LABEL_MAP = {
                    compras:'Compras', ventas:'Ventas', netBuys:'Neto', signal:'Senal',
                    precioActual:'Precio actual', impactoPrecioMedio:'Impacto medio',
                    regime:'Regimen', regimeConfidence:'Confianza', breadthSignal:'Amplitud',
                    creditStress:'Estres crediticio', factorSignal:'Factores', safeHavens:'Refugios',
                    actionGuidance:'Accion recomendada', vixRegime:'VIX', concentrationScore:'Concentracion',
                    diversificationScore:'Diversificacion', portfolioBeta:'Beta portfolio',
                    leverageCostVsIncome:'Margen vs income', regimeAlignment:'Alineacion regimen',
                    payoutRatio:'Payout ratio', fcfCoverage:'Cobertura FCF',
                    ownerEarningsCoverage:'Owner earnings', gfFinancialStrength:'GF Financial Strength',
                    shareholderYield:'Shareholder yield', streakYears:'Anos de racha', cutRisk:'Riesgo de corte',
                    debtConcern:'Preocupacion deuda', epsSurprise:'Sorpresa EPS', revenueSurprise:'Sorpresa revenue',
                    marginTrend:'Tendencia margen', analystAction:'Accion analistas',
                    transcript_insight:'Cita management', context:'Contexto', guidance:'Guidance',
                    action:'Accion', conviction:'Conviccion', bullSummary:'Argumento alcista',
                    bearSummary:'Argumento bajista', targetPrice:'Precio objetivo', timeHorizon:'Horizonte',
                    accuracy:'Precision', guru:'Guru',
                    portfolioBeta:'Beta portfolio', sectorConcentration:'Concentracion sector',
                    leverageCostVsIncome:'Margen vs income', regimeAlignment:'Alineacion regimen',
                    topRisks:'Riesgos top', recommendations:'Recomendaciones',
                  };
                  const pillColorFor = (val) => {
                    const sv = String(val).toLowerCase();
                    if (['bull','risk-on','healthy','none','working','full-risk','low','bullish','cluster-buy','correct','improving'].includes(sv)) return GREEN;
                    if (['bear','severe','collapsed','cash-priority','high','crisis','bearish','cluster-sell','incorrect','deteriorating'].includes(sv)) return RED;
                    if (['transition','transition-down','transition-up','elevated','deteriorating','reduce-risk','medium','unusual-sell','warning','planned-sales','mixed'].includes(sv)) return YELLOW;
                    return 'var(--text-tertiary)';
                  };
                  return (
                  <div style={{
                    marginTop: 10, padding: '12px 14px', borderRadius: 8,
                    background: 'var(--bg)', fontSize: 9, fontFamily: FM,
                    color: 'var(--text-secondary)', lineHeight: 1.6,
                  }}>
                    {/* Metric pills (short values only) */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                      {Object.entries(details).map(([key, val]) => {
                        if (val == null || val === '' || Array.isArray(val) || typeof val === 'object' || SKIP_KEYS.has(key)) return null;
                        // Long strings get their own block below — skip in pills
                        if (typeof val === 'string' && val.length > 60) return null;
                        const label = LABEL_MAP[key] || key.replace(/([A-Z])/g, ' $1').trim();
                        const pc = pillColorFor(val);
                        const isNum = typeof val === 'number';
                        const display = isNum ? (Number.isInteger(val) ? val : val.toFixed?.(1) ?? val) : String(val);
                        return (
                          <span key={key} style={{ padding: '3px 8px', borderRadius: 6, fontSize: 8, background: `${pc}15`, border: `1px solid ${pc}30` }}>
                            <span style={{ color: 'var(--text-tertiary)', letterSpacing: .3 }}>{label}: </span>
                            <span style={{ color: pc, fontWeight: 700 }}>{display}</span>
                          </span>
                        );
                      })}
                    </div>

                    {/* Long text fields (transcript quotes, context explanations) — quote-style block */}
                    {Object.entries(details).map(([key, val]) => {
                      if (typeof val !== 'string' || val.length <= 60 || SKIP_KEYS.has(key)) return null;
                      const label = LABEL_MAP[key] || key.replace(/([A-Z])/g, ' $1').trim();
                      const isQuote = key === 'transcript_insight';
                      return (
                        <div key={key} style={{ marginBottom: 8, padding: '8px 10px', borderLeft: `2px solid ${isQuote ? GOLD : 'var(--border)'}`, background: isQuote ? GOLD_DIM : 'transparent', borderRadius: '0 6px 6px 0' }}>
                          <div style={{ fontSize: 7, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 3 }}>
                            {isQuote && '💬 '}{label}
                          </div>
                          <div style={{ fontSize: 9, color: 'var(--text-primary)', fontStyle: isQuote ? 'italic' : 'normal', lineHeight: 1.5 }}>
                            {val}
                          </div>
                        </div>
                      );
                    })}

                    {/* Insider trades table */}
                    {details.trades && Array.isArray(details.trades) && details.trades.length > 0 && details.trades[0] && typeof details.trades[0] === 'object' && (
                      <div style={{ marginBottom: 8, overflowX: 'auto' }}>
                        <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 6 }}>Trades de insiders</div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 8 }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                              {['Fecha','Insider','Cargo','','Acciones','Precio','Actual','Impacto'].map(h => (
                                <th key={h} style={{ padding: '3px 6px', color: 'var(--text-tertiary)', fontWeight: 700, fontSize: 7, textTransform: 'uppercase', letterSpacing: .3, textAlign: ['Acciones','Precio','Actual','Impacto'].includes(h) ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {details.trades.map((t, idx) => {
                              if (typeof t !== 'object') return null;
                              const isBuy = t.type === 'COMPRA';
                              const impact = t.priceImpactPct;
                              const impactColor = impact > 2 ? GREEN : impact < -2 ? RED : 'var(--text-tertiary)';
                              return (
                                <tr key={idx} style={{ borderBottom: '1px solid var(--subtle-border, var(--border))' }}>
                                  <td style={{ padding: '4px 6px', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{t.date || '-'}</td>
                                  <td style={{ padding: '4px 6px', color: 'var(--text-primary)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.insider}>{t.insider || '?'}</td>
                                  <td style={{ padding: '4px 6px', color: 'var(--text-tertiary)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 7 }} title={t.position}>
                                    {t.position || '-'}
                                    {t.recurring && <span style={{ color: YELLOW, marginLeft: 3, fontWeight: 700 }} title="Vendedor recurrente — plan 10b5-1"> RPT</span>}
                                  </td>
                                  <td style={{ padding: '4px 6px', color: isBuy ? GREEN : RED, fontWeight: 700, whiteSpace: 'nowrap' }}>{t.type}</td>
                                  <td style={{ padding: '4px 6px', textAlign: 'right', color: 'var(--text-primary)' }}>{t.shares || '-'}</td>
                                  <td style={{ padding: '4px 6px', textAlign: 'right', color: 'var(--text-primary)' }}>{t.price ? `$${t.price}` : '-'}</td>
                                  <td style={{ padding: '4px 6px', textAlign: 'right', color: 'var(--text-primary)' }}>{t.currentPrice ? `$${t.currentPrice}` : '-'}</td>
                                  <td style={{ padding: '4px 6px', textAlign: 'right', color: impactColor, fontWeight: 700, whiteSpace: 'nowrap' }}>
                                    {impact != null ? `${impact > 0 ? '+' : ''}${impact}%` : '-'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        {details.vendedoresRecurrentes && details.vendedoresRecurrentes.length > 0 && (
                          <div style={{ marginTop: 4, fontSize: 7, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                            <span style={{ color: YELLOW, fontWeight: 700 }}>RPT</span> = Vendedor recurrente (4+ ventas/ano) — probable plan fiscal 10b5-1, menor relevancia
                          </div>
                        )}
                      </div>
                    )}

                    {/* String lists (risks, opportunities, recommendations, leaders, laggards) */}
                    {Object.entries(details).map(([key, val]) => {
                      if (!Array.isArray(val) || !val.length || SKIP_KEYS.has(key)) return null;
                      // Skip arrays of objects (handled above as trades)
                      if (val[0] && typeof val[0] === 'object') return null;
                      const label = LABEL_MAP[key] || key.replace(/([A-Z])/g, ' $1').trim();
                      const isRisk = /risk|laggard|concern/i.test(key);
                      const isOpp = /opportunit|leader|recommend|implication/i.test(key);
                      const dotColor = isRisk ? RED : isOpp ? GREEN : GOLD;
                      return (
                        <div key={key} style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 3 }}>{label}</div>
                          {val.map((item, idx) => (
                            <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 3 }}>
                              <span style={{ width: 5, height: 5, borderRadius: '50%', background: dotColor, marginTop: 4, flexShrink: 0 }} />
                              <span style={{ color: 'var(--text-primary)', lineHeight: 1.4 }}>{String(item)}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
