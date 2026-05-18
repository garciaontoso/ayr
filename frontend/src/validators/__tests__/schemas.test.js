import { describe, it, expect } from 'vitest';
import {
  FundamentalsResponseSchema,
  PositionSchema,
  PositionsArraySchema,
  DividendSchema,
  BridgePositionsResponseSchema,
  normalizeBridgePositions,
  checkSignConventions,
  safeParseFundamentals,
  safeParseFundamentalsBulk,
} from '../schemas';

describe('FundamentalsResponseSchema — Bug #001 + #010 drift detection', () => {
  it('accepts minimal valid shape', () => {
    const r = FundamentalsResponseSchema.safeParse({
      profile: { symbol: 'AAPL' },
      ratios: [], keyMetrics: [], income: [], balance: [], cashflow: [],
    });
    expect(r.success).toBe(true);
  });

  it('accepts new schema with income/balance/cashflow', () => {
    const r = FundamentalsResponseSchema.safeParse({
      profile: { symbol: 'KO', sector: 'Consumer Staples' },
      ratios: [{ priceToEarningsRatio: 25 }],
      keyMetrics: [{ marketCap: 250e9 }],
      income: [{ revenue: 47000000000, interestExpense: 500000000 }],
      balance: [{ totalDebt: 40000000000, totalStockholdersEquity: 20000000000 }],
      cashflow: [{ operatingCashFlow: 12000000000, capitalExpenditure: -2000000000, commonDividendsPaid: -8000000000 }],
    });
    expect(r.success).toBe(true);
  });

  it('rejects invalid types in ratios', () => {
    const r = FundamentalsResponseSchema.safeParse({
      profile: { symbol: 'AAPL' },
      ratios: [{ priceToEarningsRatio: 'twenty-five' }],  // string en lugar de number
    });
    expect(r.success).toBe(false);
  });

  it('passthrough allows new FMP fields', () => {
    const r = FundamentalsResponseSchema.safeParse({
      profile: { symbol: 'KO', somethingFutureFMP: 'x' },
      ratios: [{ priceToEarningsRatio: 25, newRatioField: 1.5 }],
    });
    expect(r.success).toBe(true);
  });
});

describe('PositionSchema — currency consistency', () => {
  it('accepts minimal position', () => {
    const r = PositionSchema.safeParse({ ticker: 'KO', shares: 100 });
    expect(r.success).toBe(true);
  });

  it('accepts position with full multi-currency fields', () => {
    const r = PositionSchema.safeParse({
      ticker: 'HKG:2219', shares: 100, avgCost: 5.5,
      currency: 'HKD', market_value: 770, usd_value: 99,
      account: 'U7257686', sector: 'Industrials',
    });
    expect(r.success).toBe(true);
  });

  it('rejects ticker that is not a string', () => {
    const r = PositionSchema.safeParse({ ticker: 123, shares: 100 });
    expect(r.success).toBe(false);
  });

  it('rejects empty ticker', () => {
    const r = PositionSchema.safeParse({ ticker: '', shares: 100 });
    expect(r.success).toBe(false);
  });

  it('passthrough preserves extra fields like _fund', () => {
    const r = PositionSchema.safeParse({
      ticker: 'KO', shares: 100,
      _fund: { sector: 'Consumer Staples', industry: 'Beverages' },
    });
    expect(r.success).toBe(true);
    expect(r.data._fund).toBeDefined();
  });
});

describe('PositionsArraySchema — bulk validation', () => {
  it('validates array of positions', () => {
    const r = PositionsArraySchema.safeParse([
      { ticker: 'KO', shares: 100 },
      { ticker: 'PG', shares: 50, currency: 'USD' },
      { ticker: 'TEF.MC', shares: 200, currency: 'EUR' },
    ]);
    expect(r.success).toBe(true);
  });

  it('rejects entire array if one position invalid', () => {
    const r = PositionsArraySchema.safeParse([
      { ticker: 'KO', shares: 100 },
      { ticker: '', shares: 50 },  // invalid
    ]);
    expect(r.success).toBe(false);
  });
});

describe('DividendSchema — DEO phantom guard', () => {
  it('accepts minimal dividend', () => {
    const r = DividendSchema.safeParse({ ticker: 'KO', fecha: '2025-04-01' });
    expect(r.success).toBe(true);
  });

  it('accepts full dividend with shares + bruto', () => {
    const r = DividendSchema.safeParse({
      ticker: 'KO', fecha: '2025-04-01', shares: 100,
      bruto: 47.5, neto: 40.4, account: 'U6735130', currency: 'USD',
    });
    expect(r.success).toBe(true);
  });
});

describe('BridgePositionsResponseSchema — Bug #BridgeArray', () => {
  it('accepts array directly', () => {
    const r = BridgePositionsResponseSchema.safeParse([
      { ticker: 'KO', position: 100 },
      { ticker: 'PG', position: 50 },
    ]);
    expect(r.success).toBe(true);
  });

  it('accepts {positions: [...]} wrapped', () => {
    const r = BridgePositionsResponseSchema.safeParse({
      positions: [{ ticker: 'KO', position: 100 }],
    });
    expect(r.success).toBe(true);
  });

  it('accepts {data: [...]} wrapped (NAS variant)', () => {
    const r = BridgePositionsResponseSchema.safeParse({
      data: [{ ticker: 'KO', position: 100 }],
    });
    expect(r.success).toBe(true);
  });

  it('rejects naked object', () => {
    const r = BridgePositionsResponseSchema.safeParse({ ticker: 'KO', position: 100 });
    expect(r.success).toBe(false);
  });
});

describe('normalizeBridgePositions — defense central', () => {
  it('returns array as-is', () => {
    const arr = [{ ticker: 'KO' }, { ticker: 'PG' }];
    expect(normalizeBridgePositions(arr)).toBe(arr);
  });

  it('extracts from {positions: [...]}', () => {
    const arr = [{ ticker: 'KO' }];
    expect(normalizeBridgePositions({ positions: arr })).toBe(arr);
  });

  it('extracts from {data: [...]}', () => {
    const arr = [{ ticker: 'KO' }];
    expect(normalizeBridgePositions({ data: arr })).toBe(arr);
  });

  it('returns [] for null/undefined/scalar', () => {
    expect(normalizeBridgePositions(null)).toEqual([]);
    expect(normalizeBridgePositions(undefined)).toEqual([]);
    expect(normalizeBridgePositions('not-array')).toEqual([]);
    expect(normalizeBridgePositions(123)).toEqual([]);
  });

  it('returns [] when none of positions/data is array', () => {
    expect(normalizeBridgePositions({ foo: 'bar' })).toEqual([]);
  });
});

describe('checkSignConventions — capex/dividendsPaid/interestExpense', () => {
  it('returns no drifts for well-formed FMP data', () => {
    const r = checkSignConventions({
      cashflow: [{ capitalExpenditure: -2000, commonDividendsPaid: -8000, commonStockRepurchased: -1000 }],
      income: [{ interestExpense: 500 }],
    }, 'KO');
    expect(r.drifts).toEqual([]);
  });

  it('flags capex POSITIVE (FMP drift)', () => {
    const r = checkSignConventions({
      cashflow: [{ capitalExpenditure: 2000 }],
    }, 'X');
    expect(r.drifts.find(d => d.field === 'capitalExpenditure')).toBeTruthy();
  });

  it('flags dividendsPaid POSITIVE (drift)', () => {
    const r = checkSignConventions({
      cashflow: [{ commonDividendsPaid: 8000, commonStockRepurchased: -100 }],
    }, 'X');
    expect(r.drifts.find(d => d.field === 'dividendsPaid')).toBeTruthy();
  });

  it('flags interestExpense NEGATIVE (drift)', () => {
    const r = checkSignConventions({
      income: [{ interestExpense: -500 }],
    }, 'X');
    expect(r.drifts.find(d => d.field === 'interestExpense')).toBeTruthy();
  });

  it('flags when all dividends keys are missing', () => {
    const r = checkSignConventions({
      cashflow: [{ operatingCashFlow: 1000 }],
    }, 'X');
    expect(r.drifts.find(d => d.field.includes('dividendsPaid'))).toBeTruthy();
  });

  it('handles empty/invalid input gracefully', () => {
    expect(checkSignConventions(null, 'X').drifts).toEqual([]);
    expect(checkSignConventions({}, 'X').drifts).toEqual([]);
  });
});

describe('safeParseFundamentals — degrades gracefully', () => {
  it('returns isValid=true for clean data', () => {
    const r = safeParseFundamentals({
      profile: { symbol: 'KO' }, ratios: [], keyMetrics: [],
    }, 'KO');
    expect(r.isValid).toBe(true);
  });

  it('returns raw data with isValid=false on drift', () => {
    const bad = { profile: { symbol: 'KO' }, ratios: 'not-array' };
    const r = safeParseFundamentals(bad, 'KO');
    expect(r.isValid).toBe(false);
    expect(r.value).toBe(bad);
  });

  it('handles null input', () => {
    const r = safeParseFundamentals(null, 'X');
    expect(r.isValid).toBe(false);
    expect(r.value).toBeNull();
  });
});

describe('safeParseFundamentalsBulk — counts valid/invalid', () => {
  it('counts mixed ticker results', () => {
    const bulk = {
      KO: { profile: { symbol: 'KO' }, ratios: [] },
      BAD: { profile: { symbol: 'BAD' }, ratios: 'not-array' },
      PG: { profile: { symbol: 'PG' }, ratios: [] },
    };
    const r = safeParseFundamentalsBulk(bulk);
    expect(r.validCount).toBe(2);
    expect(r.invalidCount).toBe(1);
  });

  it('handles null/non-object', () => {
    expect(safeParseFundamentalsBulk(null).validCount).toBe(0);
    expect(safeParseFundamentalsBulk('not-object').validCount).toBe(0);
  });
});
