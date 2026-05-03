import React, { useState, useEffect, useCallback, useRef } from 'react';
import { API_URL } from '../../constants/index.js';
import { InlineLoading } from '../ui/EmptyState.jsx';
import { Button, Toast } from '../ui';
import { useDraggableOrder } from '../../hooks/useDraggableOrder.js';
import AccountabilityWidget from './AccountabilityWidget.jsx';

/* ═══════════════════════════════════════════
   AI Agents Dashboard — A&R v4.1 (FMP Ultimate)
   11 agents — 5 Opus, 1 Haiku, 5 sin LLM
   ═══════════════════════════════════════════ */

const GOLD = '#c8a44e';
const GOLD_DIM = 'rgba(200,164,78,.12)';
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
  // `summary` phantom tile removed 2026-04-08 — no backend runner existed, the card
  // never showed data. Audit finding: ghost tile. Either build runSummaryAgent
  // reading today's agent_insights, or keep this removed.
  { id: 'dividend_cut_warning', name: 'Dividend Cut Early Warning', icon: '🚨', desc: 'FCF payout, coverage trend',
    info: 'Sin LLM. Detecta riesgo de recorte de dividendo 4-8 semanas antes del anuncio. Computa rolling TTM windows (4 quarters) de FCF coverage y payout ratio. Critical si TTM coverage < 0.85x. Excluye REITs, BDCs, MLPs y asset managers (carve-out por su modelo de distribucion no-FCF).',
    model: 'Sin LLM', dataSources: 'Q+S inputs cached (fcf, dividendsPaid, payoutRatio TTM)' },
  { id: 'analyst_downgrade', name: 'Analyst Downgrade Tracker', icon: '📉', desc: 'Cluster downgrades 14d',
    info: 'Sin LLM. Pulla FMP /stable/grades-historical y compara sentimiento analistas hoy vs hace 14 dias. Critical si sentimiento cae 4+ puntos con >=6 analistas (cluster downgrades real). Historicamente precede recortes de dividendo en 4-8 semanas.',
    model: 'Sin LLM', dataSources: 'FMP grades-historical' },
  { id: 'earnings_trend', name: 'Earnings Trend Pattern', icon: '📊', desc: '2+ misses + margin compression',
    info: 'Sin LLM. Detecta 2+ trimestres consecutivos de operating income miss YoY combinado con compresion de margenes >100bps. Critical si 3+ misses + revenue cayendo. Carve-out: skip REITs y growth companies (revenue +8% YoY).',
    model: 'Sin LLM', dataSources: 'FMP financials cached (8 quarters operatingIncome, revenue)' },
  { id: 'sec_filings', name: 'SEC Filings Tracker', icon: '📋', desc: '8-K material events',
    info: 'Sin LLM. Pulla SEC EDGAR submissions API por CIK para los ultimos 30 dias. Detecta items 8-K criticos: 2.05 (restructuring), 2.06 (impairments), 3.03 (modificacion derechos), 4.01/4.02 (audit issues), 5.02 (CEO/CFO departure). Critical si 2+ items materiales en 30d.',
    model: 'Sin LLM', dataSources: 'SEC EDGAR /submissions API + CIK lookup cache' },
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
  // Manual-run status: polled from /api/agent-run/status so the UI knows
  // if there's a run in progress AND when was the last successful run.
  const [runStatus, setRunStatus] = useState(null);
  // Prompt drawer (transparency feature): when set, opens a side drawer
  // showing the agent's system prompt + I/O shapes + recent insights.
  const [promptDrawer, setPromptDrawer] = useState(null); // selected agent id
  const [drawerTab, setDrawerTab] = useState('prompt');   // prompt | io | insights
  const [agentsMetadata, setAgentsMetadata] = useState([]);
  // Drag-reorder agent cards (persisted per user via cloud).
  // Replaces the previous arrow-button approach (moveAgent) with the
  // shared useDraggableOrder hook. localStorage 'ayr-agent-order' is
  // still read as a fallback seed via the hook's localStorage path.
  const {
    orderedItems: sortedAgents,
    dragHandlers: agentDragHandlers,
    getDragVisuals: agentDragVisuals,
  } = useDraggableOrder(AGENTS, 'ui_agents_order');

  // Fetch agent prompts metadata once on mount (for the transparency drawer)
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/api/agents/prompts`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setAgentsMetadata(d.agents || []); })
      .catch(e => console.error('agents/prompts fetch:', e));
    return () => { cancelled = true; };
  }, []);

  const metadataFor = (id) => agentsMetadata.find(a => a.id === id);

  const openPromptDrawer = (agentId) => {
    setPromptDrawer(agentId);
    setDrawerTab('prompt');
  };

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
  const statusPollRef = useRef(null);

  // Fetch run-status once and on each tick of the status poll
  const fetchStatus = useCallback(async () => {
    try {
      const resp = await fetch(`${API_URL}/api/agent-run/status`);
      const data = await resp.json();
      setRunStatus(data);
      if (data.state === "running") setRunning(true);
      else if (running && (data.state === "completed" || data.state === "failed")) {
        setRunning(false);
        // Refresh insights when the pipeline ends
        fetchInsights();
      }
    } catch (e) { /* silent */ }
  }, [running, fetchInsights]);

  useEffect(() => {
    fetchInsights();
    fetchStatus();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (statusPollRef.current) clearInterval(statusPollRef.current);
    };
  }, [fetchInsights, fetchStatus]);

  const runAgents = async () => {
    setRunning(true);
    try {
      const resp = await fetch(`${API_URL}/api/agent-run`, { method: 'POST' });
      const data = await resp.json();
      if (data.already_running) {
        // Another run is in progress — just attach to it
        console.log('Agents already running, attaching to existing run');
      }
      // Poll the status endpoint every 10s to detect completion
      if (statusPollRef.current) clearInterval(statusPollRef.current);
      let ticks = 0;
      statusPollRef.current = setInterval(async () => {
        ticks++;
        await fetchStatus();
        // Give up polling after 20 minutes (max realistic run duration)
        if (ticks >= 120) {
          clearInterval(statusPollRef.current);
          statusPollRef.current = null;
        }
      }, 10000);
      // Also refresh insights at 5s + 60s so the user sees partial results quickly
      setTimeout(() => fetchInsights(), 5000);
      setTimeout(() => fetchInsights(), 60000);
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
      {/* ── Manual Run Card ── */}
      {(() => {
        const s = runStatus || {};
        const isRunning = running || s.state === "running";
        const lastRunIso = s.finished_at || (s.state === "never_run" ? null : s.started_at);
        const lastRunDate = lastRunIso ? new Date(lastRunIso) : null;
        const todayUtc = new Date().toISOString().slice(0, 10);
        const lastRunDay = lastRunIso ? lastRunIso.slice(0, 10) : null;
        const ranToday = lastRunDay === todayUtc;
        const ageSec = s.age_s;
        const ageLabel = (() => {
          if (!ageSec) return null;
          if (ageSec < 60) return `hace ${ageSec}s`;
          if (ageSec < 3600) return `hace ${Math.round(ageSec/60)} min`;
          if (ageSec < 86400) return `hace ${Math.round(ageSec/3600)} h`;
          return `hace ${Math.round(ageSec/86400)} días`;
        })();
        const stateLabel = ({
          running: "⏳ Ejecutando...",
          completed: "✅ Completado",
          failed: "❌ Falló",
          never_run: "Nunca ejecutado",
        })[s.state] || "—";
        const stateColor = ({
          running: GOLD,
          completed: GREEN,
          failed: RED,
          never_run: 'var(--text-tertiary)',
        })[s.state] || 'var(--text-tertiary)';
        const bannerColor = isRunning ? GOLD : (ranToday ? GREEN : RED);
        return (
          <div style={{
            ...card({ padding: '18px 24px', marginBottom: 20, borderColor: bannerColor, borderWidth: 1 }),
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap',
          }}>
            <div style={{ flex: '1 1 auto', minWidth: 260 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, fontFamily: FB, color: 'var(--text-primary)', margin: 0 }}>
                AI Agents — Ejecución manual
              </h2>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: FM, margin: '4px 0 10px' }}>
                {AGENTS.length} agentes (sin cron automático). Pulsa cuando quieras refrescar el análisis.
              </div>
              <div style={{ display: 'flex', gap: 14, fontSize: 10, fontFamily: FM, alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <span style={{ color: 'var(--text-tertiary)' }}>Estado: </span>
                  <span style={{ color: stateColor, fontWeight: 700 }}>{stateLabel}</span>
                </div>
                {lastRunDate && (
                  <div>
                    <span style={{ color: 'var(--text-tertiary)' }}>Último run: </span>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {lastRunDate.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      {ageLabel ? ` (${ageLabel})` : ''}
                    </span>
                  </div>
                )}
                {s.duration_s != null && (
                  <div>
                    <span style={{ color: 'var(--text-tertiary)' }}>Duración: </span>
                    <span style={{ color: 'var(--text-secondary)' }}>{s.duration_s}s</span>
                  </div>
                )}
                {s.insights_today != null && (
                  <div>
                    <span style={{ color: 'var(--text-tertiary)' }}>Insights hoy (UTC): </span>
                    <span style={{ color: 'var(--text-secondary)' }}>{s.insights_today}</span>
                  </div>
                )}
                {s.agents_ok != null && (
                  <div>
                    <span style={{ color: 'var(--text-tertiary)' }}>Agentes OK: </span>
                    <span style={{ color: GREEN }}>{s.agents_ok}</span>
                    {s.agents_failed > 0 && <>/<span style={{ color: RED }}>{s.agents_failed}</span></>}
                  </div>
                )}
              </div>
              {!ranToday && !isRunning && s.state !== "never_run" && (
                <div style={{ marginTop: 8, padding: '6px 10px', background: `${RED}20`, border: `1px solid ${RED}60`, borderRadius: 6, color: RED, fontSize: 10, fontFamily: FM, display: 'inline-block' }}>
                  ⚠️ No has ejecutado los agentes hoy. Pulsa el botón para analizar tu portfolio con datos frescos.
                </div>
              )}
            </div>
            <Button onClick={runAgents} loading={isRunning} variant="primary" size="lg">
              {isRunning ? 'Ejecutando agentes...' : '🚀 Ejecutar agentes ahora'}
            </Button>
          </div>
        );
      })()}

      {/* ── Accountability widget: how well have past recommendations performed? ── */}
      <AccountabilityWidget />

      {/* ── Agent Cards Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 24 }}>
        {sortedAgents.map((agent, _agentIdx) => {
          const agentInsights = byAgent[agent.id] || [];
          const latest = latestByAgent[agent.id];
          const critCount = agentInsights.filter(i => i.severity === 'critical').length;
          const warnCount = agentInsights.filter(i => i.severity === 'warning').length;
          const isActive = filterAgent === agent.id;
          const topSev = critCount ? 'critical' : warnCount ? 'warning' : 'info';
          const topColor = SEV_COLORS[topSev];

          const { extraStyle: agentExtraStyle } = agentDragVisuals(agent.id);
          return (
            <div
              key={agent.id}
              {...agentDragHandlers(agent.id)}
              onClick={() => openPromptDrawer(agent.id)}
              title="Arrastra para reordenar · Click para ver prompt completo"
              style={{
                ...card({
                  padding: '16px 18px', cursor: 'pointer', transition: 'all .2s',
                  borderColor: isActive ? GOLD : BORDER,
                  boxShadow: isActive ? `0 0 0 1px ${GOLD}` : 'none',
                }),
                ...agentExtraStyle,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 20 }}>{agent.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, fontFamily: FB, color: 'var(--text-primary)' }}>{agent.name}</div>
                  <div style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: FM }}>{agent.desc}</div>
                </div>
                <div style={{ display: 'flex', gap: 2 }}>
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
                    sectorConcentration:'Concentracion sector',
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

      {/* Prompt drawer — opens when user clicks an agent card */}
      {promptDrawer && (
        <PromptDrawer
          agent={AGENTS.find(a => a.id === promptDrawer)}
          meta={metadataFor(promptDrawer)}
          insights={(byAgent[promptDrawer] || []).slice(0, 30)}
          activeTab={drawerTab}
          setActiveTab={setDrawerTab}
          onClose={() => setPromptDrawer(null)}
        />
      )}
    </div>
  );
}

// ─── Prompt Drawer ────────────────────────────────────────────────
// Side drawer that exposes the system prompt + I/O shapes + insights
// for a single agent. Opens when user clicks any agent card.
function PromptDrawer({ agent, meta, insights, activeTab, setActiveTab, onClose }) {
  const [toast, setToast] = useState(null);
  // Escape key handler (a11y). Added 2026-04-08 per Audit D finding —
  // the drawer is a full-height side panel with no way to close via
  // keyboard. Registered only when the drawer is open (agent truthy).
  useEffect(() => {
    if (!agent) return;
    const handler = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [agent, onClose]);

  if (!agent) return null;

  const copyPrompt = () => {
    if (!meta?.system_prompt) return;
    navigator.clipboard.writeText(meta.system_prompt)
      .then(() => setToast({ type: 'success', message: '✓ Prompt copiado' }))
      .catch(e => setToast({ type: 'error', message: '✗ Error copiando: ' + (e?.message || e) }));
  };

  const TabBtn = ({ id, label }) => (
    <button
      onClick={() => setActiveTab(id)}
      style={{
        background: activeTab === id ? GOLD : 'transparent',
        color: activeTab === id ? '#000' : 'var(--text-secondary)',
        border: `1px solid ${activeTab === id ? GOLD : BORDER}`,
        borderRadius: 8,
        padding: '6px 14px',
        fontSize: 11,
        fontFamily: FB,
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >{label}</button>
  );

  const codeBox = {
    background: 'var(--bg)',
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    padding: 14,
    fontSize: 10,
    lineHeight: 1.5,
    fontFamily: 'ui-monospace, monospace',
    color: 'var(--text-secondary)',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
        zIndex: 9999, display: 'flex', justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(720px, 92vw)', height: '100vh', background: 'var(--card)',
          borderLeft: `1px solid ${BORDER}`, overflow: 'auto',
          padding: '24px 28px', boxShadow: '-8px 0 32px rgba(0,0,0,.4)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 22, fontFamily: FB, fontWeight: 800, color: 'var(--text-primary)' }}>
              {agent.icon} {agent.name}
            </div>
            <div style={{ fontSize: 10, fontFamily: FM, color: 'var(--text-tertiary)', marginTop: 4 }}>
              {meta?.model || agent.model || '—'}
              {meta?.cost_per_run_estimate_usd > 0 && (
                <> · ~${meta.cost_per_run_estimate_usd.toFixed(2)}/run</>
              )}
              {meta?.type === 'no_llm' && <> · Sin LLM</>}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6,
              color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px 12px',
              fontSize: 16, fontFamily: FM,
            }}
          >×</button>
        </div>

        {/* Sub-tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          <TabBtn id="prompt" label="🧾 Prompt" />
          <TabBtn id="io" label="📥 Input / 📤 Output" />
          <TabBtn id="insights" label={`📊 Insights (${insights.length})`} />
        </div>

        {/* PROMPT TAB */}
        {activeTab === 'prompt' && (
          <div>
            {meta?.description && (
              <div style={{
                fontSize: 11, fontFamily: FM, color: 'var(--text-secondary)',
                marginBottom: 14, padding: 10, background: 'var(--bg)', borderRadius: 8,
                border: `1px solid ${BORDER}`,
              }}>
                {meta.description}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 10, fontFamily: FM, color: 'var(--text-tertiary)' }}>SYSTEM PROMPT</span>
              {meta?.type === 'llm' && (
                <button
                  onClick={copyPrompt}
                  style={{
                    background: GOLD_DIM, color: GOLD, border: `1px solid ${GOLD}40`,
                    borderRadius: 6, padding: '2px 10px', fontSize: 10, fontFamily: FB,
                    fontWeight: 700, cursor: 'pointer',
                  }}
                >Copiar</button>
              )}
            </div>
            <pre style={{ ...codeBox, maxHeight: '60vh', overflow: 'auto', margin: 0 }}>
              {meta?.system_prompt || '(no metadata cargada — verifica /api/agents/prompts)'}
            </pre>
            {meta && (
              <div style={{ marginTop: 14, fontSize: 10, fontFamily: FM, color: 'var(--text-tertiary)', lineHeight: 1.7 }}>
                <div><strong style={{ color: 'var(--text-secondary)' }}>Trigger:</strong> {meta.trigger || '—'}</div>
                <div><strong style={{ color: 'var(--text-secondary)' }}>Cuándo se ejecuta:</strong> {meta.when_it_fires || '—'}</div>
                <div><strong style={{ color: 'var(--text-secondary)' }}>Tipo:</strong> {meta.type === 'llm' ? `LLM (${meta.model})` : 'Sin LLM (cálculo puro)'}</div>
              </div>
            )}
          </div>
        )}

        {/* I/O TAB */}
        {activeTab === 'io' && (
          <div>
            <div style={{ fontSize: 10, fontFamily: FM, color: 'var(--text-tertiary)', marginBottom: 4 }}>📥 INPUT SHAPE</div>
            <pre style={{ ...codeBox, marginBottom: 18 }}>
              {JSON.stringify(meta?.input_shape || {}, null, 2)}
            </pre>
            <div style={{ fontSize: 10, fontFamily: FM, color: 'var(--text-tertiary)', marginBottom: 4 }}>📤 OUTPUT SHAPE</div>
            <pre style={codeBox}>
              {JSON.stringify(meta?.output_shape || {}, null, 2)}
            </pre>
          </div>
        )}

        {/* INSIGHTS TAB */}
        {activeTab === 'insights' && (
          <div>
            {insights.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: FM, padding: 20, textAlign: 'center' }}>
                Sin insights recientes para este agente. Pulsa "🚀 Ejecutar agentes ahora" para generar nuevos.
              </div>
            ) : insights.map((i, idx) => (
              <div key={i.id || `${i.ticker}-${i.fecha}-${idx}`} style={{
                border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12, marginBottom: 10,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'center' }}>
                  <strong style={{ fontSize: 11, fontFamily: FB, color: 'var(--text-primary)' }}>
                    {i.ticker} · {i.title}
                  </strong>
                  <SeverityPill severity={i.severity} />
                </div>
                <div style={{ fontSize: 10, fontFamily: FM, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {i.summary}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  );
}
