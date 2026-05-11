// Sprint 22.6 — Reconcile heuristics: detecta CAUSA probable de discrepancy
// entre IB live (autoritativo) y cost_basis (historial de trades).
//
// IB qty es la verdad. Discrepancies legítimas:
//   - Stock splits / reverse splits (broker ajusta automáticamente)
//   - DRIP (dividend reinvestment, fractional shares)
//   - Option assignment (call/put assigned → shares aparecen/desaparecen)
//   - Spin-offs (NewCo shares aparecen sin trade)
//   - Symbol changes (AHH → AHRT post-rebrand)
//   - Transfers entre brokers
// Y bugs:
//   - cost_basis duplicates (opt_tipo="-" + opt_tipo=null)
//   - Manual trade import errors
//
// Pure functions, no DB, no fetch. Compatible Cloudflare Worker.

// ─── Cause types ─────────────────────────────────────────────────────────
export const CAUSES = {
  STOCK_SPLIT:        'STOCK_SPLIT',          // qty ratio = N:1
  REVERSE_SPLIT:      'REVERSE_SPLIT',        // qty ratio = 1:N
  DRIP:               'DRIP',                 // small fractional addition
  OPTION_ASSIGNMENT:  'OPTION_ASSIGNMENT',    // exact multiple of 100 shares
  SPIN_OFF:           'SPIN_OFF',             // ticker in IB but not in cost_basis (new)
  SYMBOL_CHANGE:      'SYMBOL_CHANGE',        // ticker in cost_basis but IB has similar
  COST_BASIS_DUPLICATE: 'COST_BASIS_DUPLICATE', // trades = 2× IB exactly (dup rows)
  TRANSFER_OUT:       'TRANSFER_OUT',         // ticker in cost_basis, IB=0
  TRANSFER_IN:        'TRANSFER_IN',          // ticker in IB, cost_basis=0 (no trades)
  UNKNOWN:            'UNKNOWN',
};

// ─── classifyDiscrepancy(ibQty, tradesQty, opts) ─────────────────────────
// Returns { cause, confidence: 'HIGH'|'MEDIUM'|'LOW', explanation, suggested_action }
//
// opts: {
//   ticker, allTickers, recentOptionAssignment, hasDividendHistory,
//   costBasisRows, ...
// }
export function classifyDiscrepancy(ibQty, tradesQty, opts = {}) {
  const ib = Number(ibQty) || 0;
  const tr = Number(tradesQty) || 0;
  const diff = ib - tr;                       // + = IB has more, - = trades has more
  const absDiff = Math.abs(diff);

  // ── Case 1: trades >> IB and ticker in IB (cost_basis duplicates) ──
  if (tr > 0 && ib > 0 && Math.abs(tr - 2 * ib) <= 2) {
    return {
      cause: CAUSES.COST_BASIS_DUPLICATE,
      confidence: 'HIGH',
      explanation: `trades = 2× IB exactamente (${tr} vs ${ib}). Probable filas duplicadas en cost_basis (opt_tipo="-" + opt_tipo=NULL).`,
      suggested_action: 'DELETE_DUPLICATES',
      suggested_data: { excess: tr - ib },
    };
  }

  // ── Case 2: IB = 0 and trades > 0 (ticker no longer held) ──
  if (ib === 0 && tr > 0) {
    if (opts.allTickers && opts.ticker) {
      // Check if a similar ticker exists in IB (e.g., AHH → AHRT)
      const t = opts.ticker.toUpperCase();
      const similar = Array.from(opts.allTickers).find(x => {
        const xUp = x.toUpperCase();
        if (xUp === t) return false;
        return xUp.startsWith(t) || t.startsWith(xUp) || levenshtein(xUp, t) <= 2;
      });
      if (similar) {
        return {
          cause: CAUSES.SYMBOL_CHANGE,
          confidence: 'MEDIUM',
          explanation: `${t} no aparece en IB pero ${similar} sí. Probable cambio de símbolo (rebrand/M&A).`,
          suggested_action: 'CONFIRM_SYMBOL_CHANGE',
          suggested_data: { from: t, to: similar },
        };
      }
    }
    return {
      cause: CAUSES.TRANSFER_OUT,
      confidence: 'MEDIUM',
      explanation: `cost_basis dice ${tr} shares, IB no tiene esta posición. Probable: vendido todo / transferido a otro broker / símbolo cambió.`,
      suggested_action: 'MARK_TRANSFERRED_OUT',
      suggested_data: { trades: tr },
    };
  }

  // ── Case 3: trades = 0 and IB > 0 (ticker without trades) ──
  if (tr === 0 && ib > 0) {
    return {
      cause: CAUSES.TRANSFER_IN,
      confidence: 'MEDIUM',
      explanation: `IB tiene ${ib} shares pero cost_basis no tiene trades. Probable: spin-off / transferencia entrante / DRIP completo / asignación de opción.`,
      suggested_action: 'INSERT_CORPORATE_ACTION',
      suggested_data: { type: 'unknown_origin', shares: ib, cost_per_share: 0 },
    };
  }

  // ── Case 4: Option assignment — diff is exact multiple of 100 (FIRST: more common than splits)
  // For wheel strategy users, assignments happen weekly; splits maybe once per decade per ticker.
  // Priority over splits when diff <= 500 (5 contracts) — most assignments are 1-3 contracts.
  if (absDiff > 0 && absDiff % 100 === 0 && absDiff <= 500) {
    return {
      cause: CAUSES.OPTION_ASSIGNMENT,
      confidence: opts.recentOptionAssignment ? 'HIGH' : 'MEDIUM',
      explanation: `Diff = ${diff} = exacto múltiplo de 100. Probable asignación de opción (${Math.abs(diff)/100} contratos ${diff > 0 ? 'recibidas' : 'cedidas'}).`,
      suggested_action: 'INSERT_CORPORATE_ACTION',
      suggested_data: { type: 'option_assignment', shares: diff, contracts: Math.abs(diff) / 100 },
    };
  }

  // ── Case 5: Stock split — ratio exact integer ≥ 2 ──
  if (ib > tr && tr > 0) {
    const ratio = ib / tr;
    const nearInt = Math.round(ratio);
    if (Math.abs(ratio - nearInt) < 0.02 && nearInt >= 2 && nearInt <= 10) {
      return {
        cause: CAUSES.STOCK_SPLIT,
        confidence: 'HIGH',
        explanation: `IB/trades = ${ratio.toFixed(2)} ≈ ${nearInt}. Probable stock split ${nearInt}:1.`,
        suggested_action: 'INSERT_CORPORATE_ACTION',
        suggested_data: { type: `stock_split_${nearInt}_to_1`, shares: diff, ratio: nearInt },
      };
    }
  }

  // ── Case 6: Reverse split — ratio = 1/N ──
  if (tr > ib && ib > 0) {
    const ratio = tr / ib;
    const nearInt = Math.round(ratio);
    if (Math.abs(ratio - nearInt) < 0.02 && nearInt >= 2 && nearInt <= 10) {
      return {
        cause: CAUSES.REVERSE_SPLIT,
        confidence: 'HIGH',
        explanation: `trades/IB = ${ratio.toFixed(2)} ≈ ${nearInt}. Probable reverse split 1:${nearInt}.`,
        suggested_action: 'INSERT_CORPORATE_ACTION',
        suggested_data: { type: `reverse_split_1_to_${nearInt}`, shares: diff, ratio: 1 / nearInt },
      };
    }
  }

  // ── Case 7: Larger option assignments (>500 shares, less common but possible) ──
  if (absDiff > 0 && absDiff % 100 === 0 && absDiff <= 1000) {
    return {
      cause: CAUSES.OPTION_ASSIGNMENT,
      confidence: opts.recentOptionAssignment ? 'HIGH' : 'LOW',
      explanation: `Diff = ${diff} = múltiplo de 100 (${Math.abs(diff)/100} contratos). Posible asignación grande.`,
      suggested_action: 'INSERT_CORPORATE_ACTION',
      suggested_data: { type: 'option_assignment', shares: diff, contracts: Math.abs(diff) / 100 },
    };
  }

  // ── Case 7: DRIP — small positive diff (fractional or <5% of total) ──
  if (diff > 0 && tr > 0) {
    const diffPct = (diff / tr) * 100;
    if (diffPct <= 5 || (diff < 10 && diff > 0)) {
      return {
        cause: CAUSES.DRIP,
        confidence: opts.hasDividendHistory ? 'HIGH' : 'MEDIUM',
        explanation: `IB - trades = +${diff} (${diffPct.toFixed(1)}%). Probable DRIP (dividend reinvestment) acumulado.`,
        suggested_action: 'INSERT_CORPORATE_ACTION',
        suggested_data: { type: 'drip_reinvest', shares: diff, cost_per_share: 0 },
      };
    }
  }

  // ── Default: unknown, manual review ──
  return {
    cause: CAUSES.UNKNOWN,
    confidence: 'LOW',
    explanation: `IB ${ib} vs trades ${tr}, diff ${diff}. Sin causa probable detectada. Review manual.`,
    suggested_action: 'MANUAL_REVIEW',
    suggested_data: { diff },
  };
}

// ─── classifyAll(ibMap, tradesMap, opts) ─────────────────────────────────
// Returns array of { ticker, ib_qty, trades_qty, ...classifyDiscrepancy result }
export function classifyAll(ibMap, tradesMap, opts = {}) {
  const allTickers = new Set([...Object.keys(ibMap), ...Object.keys(tradesMap)]);
  const results = [];
  for (const ticker of allTickers) {
    const ibQty = ibMap[ticker] || 0;
    const tradesQty = tradesMap[ticker] || 0;
    if (Math.abs(ibQty - tradesQty) < 1) continue;  // no discrepancy
    const classified = classifyDiscrepancy(ibQty, tradesQty, { ...opts, ticker, allTickers });
    results.push({
      ticker,
      ib_qty: ibQty,
      trades_qty: tradesQty,
      diff: ibQty - tradesQty,
      ...classified,
    });
  }
  // Sort by severity: HIGH confidence + larger absDiff first
  const confWeight = { HIGH: 3, MEDIUM: 2, LOW: 1 };
  results.sort((a, b) => {
    const aw = (confWeight[a.confidence] || 0) * 1000 + Math.abs(a.diff);
    const bw = (confWeight[b.confidence] || 0) * 1000 + Math.abs(b.diff);
    return bw - aw;
  });
  return results;
}

// ─── Helpers ────────────────────────────────────────────────────────────
function levenshtein(a, b) {
  if (a === b) return 0;
  const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + cost,
      );
    }
  }
  return matrix[b.length][a.length];
}
