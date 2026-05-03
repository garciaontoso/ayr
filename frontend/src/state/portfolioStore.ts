import { create } from 'zustand';

// Runtime shape of a single position entry in the positions map.
// This is the "fat" shape that lives in App.jsx — richer than the D1 Position
// type (types/index.ts) because it carries computed USD values, IB overrides,
// CB-derived totals, and live price fields.
export interface PositionData {
  list?: string;
  name?: string;
  shares?: number;
  lastPrice?: number;
  avgCost?: number;
  adjustedBasis?: number;
  currency?: string;
  fx?: number;
  tags?: string;
  category?: string;
  cat?: string;
  mc?: number;
  sector?: string;
  usdValue?: number;
  marketValue?: number;
  totalInvertido?: number;
  pnlPct?: number;
  pnlAbs?: number;
  dps?: number;
  divTTM?: number;
  divYieldTTM?: number;
  yoc?: number;
  annualDivTotal?: number;
  totalDivs?: number;
  totalOptCredit?: number;
  hasCB?: boolean;
  notes?: string;
  // Live price fields (set by refreshPrices / refreshLivePrices)
  dayChange?: number;
  dayChangeAbs?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  spark?: number[];
  priceUpdated?: boolean;
  // Cost-basis derived (set after CB transactions recalculate)
  hasCb?: boolean;
  [key: string]: unknown;  // allow extra runtime fields without casting
}

export type PositionsMap = Record<string, PositionData>;

// Reducer type used by patchPositions — mirrors useState's functional updater.
export type PositionsPatcher = (prev: PositionsMap) => PositionsMap;

interface PortfolioState {
  positions: PositionsMap;
  /** Replace the entire positions map (e.g. initial load from D1). */
  setPositions: (p: PositionsMap) => void;
  /**
   * Apply a pure reducer to positions, returning the new map.
   * Use for all cases that were previously `setPositions(prev => ...)`.
   * Zustand does not support functional-update syntax on its own setters,
   * so this action reads current state before writing.
   */
  patchPositions: (fn: PositionsPatcher) => void;
}

export const usePortfolioStore = create<PortfolioState>((set, get) => ({
  positions: {},
  setPositions: (positions) => set({ positions }),
  patchPositions: (fn) => set({ positions: fn(get().positions) }),
}));
