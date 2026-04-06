import { useState, useEffect, useCallback } from 'react';
import { API_URL } from '../../constants/index.js';
import { InlineLoading } from '../ui/EmptyState.jsx';

/* ═══════════════════════════════════════════
   AI Agents Dashboard — A&R v3.2
   5 agents: Earnings, Dividend, Macro, Risk, Trade
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
  { id: 'earnings', name: 'Earnings Monitor', icon: '📊', desc: 'Earnings, revenue, guidance' },
  { id: 'dividend', name: 'Dividend Safety', icon: '🛡️', desc: 'Payout, FCF, streak' },
  { id: 'macro',    name: 'Macro Sentinel',  icon: '🌍', desc: 'Rates, CPI, Fed, FX' },
  { id: 'risk',     name: 'Portfolio Risk',   icon: '⚠️', desc: 'Concentration, drawdown' },
  { id: 'trade',    name: 'Trade Advisor',    icon: '🎯', desc: 'Bull/bear debate' },
  { id: 'regime',   name: 'Market Regime',    icon: '🧭', desc: 'Risk-on/off, sectors, credit' },
  { id: 'postmortem', name: 'Signal Postmortem', icon: '📋', desc: 'Signal accuracy tracking' },
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

export default function AgentesTab() {
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [filterAgent, setFilterAgent] = useState(null);
  const [filterSev, setFilterSev] = useState(null);
  const [days, setDays] = useState(7);
  const [expandedId, setExpandedId] = useState(null);

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

  useEffect(() => { fetchInsights(); }, [fetchInsights]);

  const runAgents = async () => {
    setRunning(true);
    try {
      await fetch(`${API_URL}/api/agent-run`, { method: 'POST' });
      // Agents run in background (~5 min). Auto-refresh every 30s while running.
      let checks = 0;
      const interval = setInterval(async () => {
        checks++;
        await fetchInsights();
        if (checks >= 12) { clearInterval(interval); setRunning(false); } // Stop after 6 min
      }, 30000);
      // Also refresh immediately
      setTimeout(() => fetchInsights(), 5000);
    } catch (e) {
      console.error('Agent run error:', e);
      setRunning(false);
    }
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
  const timeline = [...insights].sort((a, b) => {
    const sevDiff = (SEV_ORDER[a.severity] || 2) - (SEV_ORDER[b.severity] || 2);
    if (sevDiff !== 0) return sevDiff;
    return b.fecha > a.fecha ? 1 : -1;
  });

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, fontFamily: FB, color: 'var(--text-primary)', margin: 0 }}>
            AI Agents
          </h2>
          <p style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: FM, margin: '4px 0 0' }}>
            7 agentes monitorizando tu portfolio diariamente a las 11:00 Madrid
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
        {AGENTS.map(agent => {
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
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, fontFamily: FB, color: 'var(--text-primary)' }}>{agent.name}</div>
                  <div style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: FM }}>{agent.desc}</div>
                </div>
              </div>

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
                  <div style={{ fontSize: 8, color: 'var(--text-tertiary)', fontFamily: FM, marginTop: 4 }}>
                    {latest.fecha}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: FM, fontStyle: 'italic' }}>
                  Sin datos — ejecutar agentes
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Filters ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: FM, textTransform: 'uppercase', letterSpacing: .5 }}>
          Filtros:
        </span>
        {['critical', 'warning', 'info'].map(sev => (
          <button key={sev} onClick={() => setFilterSev(filterSev === sev ? null : sev)} style={{
            fontSize: 9, padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
            background: filterSev === sev ? `${SEV_COLORS[sev]}30` : 'transparent',
            color: SEV_COLORS[sev], fontWeight: 700, fontFamily: FM,
            border: `1px solid ${filterSev === sev ? SEV_COLORS[sev] : 'var(--border)'}`,
            letterSpacing: .5, textTransform: 'uppercase',
          }}>{sev}</button>
        ))}
        <span style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />
        {[1, 7, 30].map(d => (
          <button key={d} onClick={() => setDays(d)} style={{
            fontSize: 9, padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
            background: days === d ? GOLD_DIM : 'transparent',
            color: days === d ? GOLD : 'var(--text-tertiary)', fontWeight: 700, fontFamily: FM,
            border: `1px solid ${days === d ? GOLD : 'var(--border)'}`,
          }}>{d}d</button>
        ))}
      </div>

      {/* ── Timeline ── */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><InlineLoading msg="Cargando insights..." /></div>
      ) : timeline.length === 0 ? (
        <div style={{ ...card({ textAlign: 'center', padding: 40 }) }}>
          <span style={{ fontSize: 32 }}>🤖</span>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: FM, marginTop: 8 }}>
            No hay insights. Pulsa "Ejecutar Agentes" para generar el primer analisis.
          </p>
        </div>
      ) : (
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
                  {insight.ticker && insight.ticker !== '_GLOBAL_' && insight.ticker !== '_MACRO_' && insight.ticker !== '_PORTFOLIO_' && (
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
                {isExpanded && Object.keys(details).length > 0 && (
                  <div style={{
                    marginTop: 10, padding: '10px 12px', borderRadius: 8,
                    background: 'var(--bg)', fontSize: 9, fontFamily: FM,
                    color: 'var(--text-secondary)', lineHeight: 1.6,
                  }}>
                    {Object.entries(details).map(([key, val]) => {
                      if (val == null || val === '') return null;
                      const displayVal = Array.isArray(val) ? val.join(', ') : typeof val === 'object' ? JSON.stringify(val) : String(val);
                      return (
                        <div key={key} style={{ display: 'flex', gap: 8, marginBottom: 3 }}>
                          <span style={{ color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: .5, minWidth: 100 }}>
                            {key.replace(/([A-Z])/g, ' $1').trim()}:
                          </span>
                          <span style={{ color: 'var(--text-primary)' }}>{displayVal}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
