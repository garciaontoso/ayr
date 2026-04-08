// ─────────────────────────────────────────────────────────────
// useNetLiquidationValue — single source of truth for current NLV.
//
// Priority order:
//   1. ibData?.summary?.nlv?.amount  — live from IB OAuth (cash + margin + positions)
//   2. Latest CTRL_DATA snapshot     — manual patrimonio entry (offline fallback)
//   3. 0
//
// Note: PatrimonioTab intentionally uses CTRL snapshots directly because
// its purpose is showing historical evolution, NOT current NLV. Don't
// migrate that tab to this hook.
//
// IB NLV is authoritative because it includes:
//   - Cash balances across all 4 accounts
//   - Margin loan balance (negative)
//   - All position market values in real-time
// portfolioTotals.totalValueUSD only sums positions and OMITS cash/margin.
// ─────────────────────────────────────────────────────────────
import { useMemo } from 'react';

export function useNetLiquidationValue({ ibData, ctrlData = [] } = {}) {
  return useMemo(() => {
    const ibNlv = Number(ibData?.summary?.nlv?.amount) || 0;
    if (ibNlv > 0) return ibNlv;

    // Fallback: latest manual snapshot (most recent date with pu > 0)
    const latest = (ctrlData || [])
      .filter(c => Number(c?.pu) > 0)
      .sort((a, b) => String(a.d || '').localeCompare(String(b.d || '')))
      .pop();
    return Number(latest?.pu) || 0;
  }, [ibData?.summary?.nlv?.amount, ctrlData]);
}

export default useNetLiquidationValue;
