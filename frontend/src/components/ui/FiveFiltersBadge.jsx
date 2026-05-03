import { useState } from 'react';

// ── FiveFiltersBadge ─────────────────────────────────────────────────────────
// Displays the A&R Decision Framework 5-filter scores inline.
// filters = { business, moat, management, valuation, conviction }
// Each score is 0-10 or null (pending user input — conviction is always user-owned).
// reasoning = { business, moat, management, valuation, conviction } — optional strings
// devilsAdvocate = string — optional
// invalidation = string — optional
// action = 'BUY'|'SELL'|'TRIM'|'HOLD'|'ADD'|'WAIT' — used for composite decision rule display

const FILTER_LABELS = [
  { key: 'business',   code: 'B', label: 'Negocio',    labelFull: 'Entender el Negocio'          },
  { key: 'moat',       code: 'M', label: 'Foso',       labelFull: 'Durabilidad del Foso'          },
  { key: 'management', code: 'G', label: 'Gestión',    labelFull: 'Honestidad & Capital Alloc.'   },
  { key: 'valuation',  code: 'V', label: 'Precio',     labelFull: 'Precio vs. Valor'              },
  { key: 'conviction', code: 'C', label: 'Convicción', labelFull: 'Convicción Emocional (tuya)'   },
];

function filterColor(v) {
  if (v === null || v === undefined) return 'var(--text-tertiary)';
  if (v >= 8) return 'var(--green)';
  if (v >= 6) return 'var(--gold)';
  if (v >= 4) return '#ff9f0a';
  return 'var(--red)';
}

function filterBg(v) {
  if (v === null || v === undefined) return 'var(--subtle-bg)';
  if (v >= 8) return 'rgba(48,209,88,.08)';
  if (v >= 6) return 'rgba(200,164,78,.08)';
  if (v >= 4) return 'rgba(255,159,10,.08)';
  return 'rgba(255,69,58,.08)';
}

function compositeScore(filters) {
  const vals = FILTER_LABELS.map(f => filters[f.key]).filter(v => v !== null && v !== undefined);
  if (vals.length === 0) return null;
  return (vals.reduce((a, b) => a + b, 0) / vals.length);
}

// Composite BUY/HOLD decision rule evaluation
function evalDecision(filters, action) {
  const vals = {};
  FILTER_LABELS.forEach(f => { vals[f.key] = filters[f.key]; });
  const allScored = FILTER_LABELS.every(f => vals[f.key] !== null && vals[f.key] !== undefined);
  if (!allScored) return null;

  const isBuy    = action === 'BUY' || action === 'ADD';
  const isSell   = action === 'SELL' || action === 'TRIM';

  if (isBuy) {
    const allGe6  = FILTER_LABELS.every(f => vals[f.key] >= 6);
    const twoGe8  = FILTER_LABELS.filter(f => vals[f.key] >= 8).length >= 2;
    const mgmtOk  = vals.management >= 7;
    const valOk   = vals.valuation >= 3;
    if (allGe6 && twoGe8 && mgmtOk && valOk) return { pass: true, label: 'CUMPLE CRITERIOS BUY' };
    const fails = [];
    if (!allGe6)  fails.push('algún filtro <6');
    if (!twoGe8)  fails.push('<2 filtros ≥8');
    if (!mgmtOk)  fails.push('Gestión <7');
    if (!valOk)   fails.push('Precio 0-2');
    return { pass: false, label: 'NO CUMPLE: ' + fails.join(', ') };
  }
  if (isSell) {
    const anyBroken = FILTER_LABELS.some(f => vals[f.key] <= 2);
    if (anyBroken) return { pass: true, label: 'CONFIRM EXIT — filtro roto (≤2)' };
    return { pass: null, label: 'TRIM — revisar peso objetivo' };
  }
  return null;
}

// ── Compact inline badge (default view) ────────────────────────────────────
export function FiveFiltersBadge({ filters, reasoning, devilsAdvocate, invalidation, action, _compact }) {
  const [expanded, setExpanded] = useState(false);

  if (!filters) return null;

  const comp = compositeScore(filters);
  const compColor = filterColor(comp !== null ? Math.round(comp) : null);
  const decision  = evalDecision(filters, action);

  return (
    <div>
      {/* Inline pill row */}
      <div
        onClick={() => setExpanded(e => !e)}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && setExpanded(v => !v)}
        title="Ver análisis de 5 Filtros A&R"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          cursor: 'pointer', userSelect: 'none',
          padding: '3px 6px', borderRadius: 6,
          border: '1px solid var(--border)',
          background: 'var(--subtle-bg)',
        }}
      >
        {/* Label */}
        <span style={{
          fontSize: 8, fontWeight: 800, letterSpacing: '.5px',
          color: 'var(--text-tertiary)', fontFamily: 'var(--fb)',
          textTransform: 'uppercase', marginRight: 2,
        }}>5F</span>

        {/* Individual filter pills */}
        {FILTER_LABELS.map(f => {
          const v = filters[f.key];
          const c = filterColor(v);
          return (
            <span key={f.key} style={{
              fontFamily: 'var(--fm)', fontSize: 9, fontWeight: 700,
              color: c, whiteSpace: 'nowrap',
            }}>
              {f.code}:{v !== null && v !== undefined ? v : '?'}
            </span>
          );
        })}

        {/* Composite */}
        {comp !== null && (
          <>
            <span style={{ color: 'var(--text-tertiary)', fontSize: 9, marginLeft: 2 }}>=</span>
            <span style={{ fontFamily: 'var(--fm)', fontSize: 10, fontWeight: 800, color: compColor }}>
              {comp.toFixed(1)}
            </span>
          </>
        )}

        {/* Expand chevron */}
        <span style={{ fontSize: 8, color: 'var(--text-tertiary)', marginLeft: 2 }}>
          {expanded ? '▲' : '▼'}
        </span>
      </div>

      {/* Expanded detail panel */}
      {expanded && (
        <div style={{
          marginTop: 8,
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '12px 14px',
          fontSize: 11,
          fontFamily: 'var(--fb)',
        }}>
          {/* Decision rule banner */}
          {decision && (
            <div style={{
              marginBottom: 10,
              padding: '5px 10px',
              borderRadius: 6,
              background: decision.pass === true
                ? 'rgba(48,209,88,.1)'
                : decision.pass === false
                  ? 'rgba(255,69,58,.1)'
                  : 'rgba(255,159,10,.08)',
              border: `1px solid ${decision.pass === true ? 'rgba(48,209,88,.3)' : decision.pass === false ? 'rgba(255,69,58,.3)' : 'rgba(255,159,10,.25)'}`,
              color: decision.pass === true ? 'var(--green)' : decision.pass === false ? 'var(--red)' : '#ff9f0a',
              fontSize: 10, fontWeight: 800, fontFamily: 'var(--fm)', letterSpacing: '.3px',
            }}>
              {decision.label}
            </div>
          )}

          {/* Filter rows */}
          {FILTER_LABELS.map(f => {
            const v = filters[f.key];
            const c = filterColor(v);
            const bg = filterBg(v);
            const text = reasoning?.[f.key];
            const isPending = v === null || v === undefined;
            return (
              <div key={f.key} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '7px 0',
                borderBottom: '1px solid var(--border)',
              }}>
                {/* Score box */}
                <div style={{
                  flexShrink: 0, width: 36, height: 36,
                  borderRadius: 8, background: bg,
                  border: `1px solid ${c}40`,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontFamily: 'var(--fm)', fontSize: 14, fontWeight: 800, color: c, lineHeight: 1 }}>
                    {isPending ? '?' : v}
                  </span>
                  <span style={{ fontSize: 7, color: 'var(--text-tertiary)', fontFamily: 'var(--fm)' }}>
                    /10
                  </span>
                </div>

                {/* Label + reasoning */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--fb)', marginBottom: 2 }}>
                    Filtro {FILTER_LABELS.findIndex(x => x.key === f.key) + 1} — {f.labelFull}
                  </div>
                  {text ? (
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      {text}
                    </div>
                  ) : isPending ? (
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                      {f.key === 'conviction' ? 'Tuya — ¿añadirías más si cae 40%?' : 'Pendiente de análisis.'}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}

          {/* Devil's advocate */}
          {devilsAdvocate && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--red)', letterSpacing: '.5px', fontFamily: 'var(--fb)', textTransform: 'uppercase', marginBottom: 4 }}>
                Abogado del Diablo
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {devilsAdvocate}
              </div>
            </div>
          )}

          {/* Invalidation condition */}
          {invalidation && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--gold)', letterSpacing: '.5px', fontFamily: 'var(--fb)', textTransform: 'uppercase', marginBottom: 4 }}>
                Condición de Invalidación
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {invalidation}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default FiveFiltersBadge;
