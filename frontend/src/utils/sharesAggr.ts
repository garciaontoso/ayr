// sharesAggr.ts — agregación canonical de shares desde un array de trades.
//
// Defensiva contra varios bugs catalogados (docs/bug-patterns.md):
//   • Bug #002 (PG 150 vs 250): nunca confiar en running balance per-account
//     de la última fila — sumar siempre buys − sells multi-account.
//   • Bug #011 (DIVIDENDS+shares legacy): filtrar tipo='DIVIDENDS' para no
//     contarlos como buys.
//
// Uso:
//   import { aggregateShares } from '@/utils/sharesAggr';
//   const total = aggregateShares(trades);
//
// Notas:
//   • `tipo` se compara en mayúsculas. Acepta variantes EQUITY / OPTION /
//     DIVIDENDS / SELL etc.
//   • `shares` negativo se interpreta como venta (Flex usa esa convención
//     para SELL/SLD).
//   • Si el trade tiene tipo=='SELL' o tipo=='SLD', se cuenta como venta
//     incluso si shares fuera positivo (defensivo ante schemas inconsistentes).

import type { Trade } from '../types';

const DIVIDEND_TYPES = new Set(['DIVIDENDS', 'DIVIDEND', 'DIV']);
const SELL_TYPES = new Set(['SELL', 'SLD', 'CLOSE', 'CLS']);
const EQUITY_TYPES = new Set(['EQUITY', 'STOCK', 'STK', 'BUY']);

/**
 * Suma neta de shares para un ticker dado un array de trades.
 *
 * @param trades Array de trades (legacy puede traer `type` en lugar de `tipo`).
 * @returns buys − sells (puede ser 0 o negativo si vendió en corto).
 */
export function aggregateShares(
  trades: ReadonlyArray<Trade & { type?: string }> | null | undefined
): number {
  if (!Array.isArray(trades) || trades.length === 0) return 0;
  let buys = 0;
  let sells = 0;
  for (const t of trades) {
    if (!t) continue;
    const tipo = String(t.tipo || t.type || '').toUpperCase();
    // Bug #011 — ignorar filas DIVIDENDS legacy aunque tengan shares populated.
    if (DIVIDEND_TYPES.has(tipo)) continue;
    const sh = Number(t.shares);
    if (!Number.isFinite(sh) || sh === 0) continue;
    // Si el tipo dice SELL o el campo shares es negativo, es venta.
    if (SELL_TYPES.has(tipo) || sh < 0) {
      sells += Math.abs(sh);
      continue;
    }
    // EQUITY / STOCK / BUY (o tipo vacío con shares>0 — fallback compatible).
    if (EQUITY_TYPES.has(tipo) || tipo === '') {
      buys += sh;
    } else {
      // Tipos no reconocidos (OPTION, etc.) NO suman a shares de equity.
      // Si en el futuro queremos contar OPCIONES asignadas, sería aquí.
      continue;
    }
  }
  return buys - sells;
}

/**
 * Suma neta de shares POR cuenta (NULL agrupa todas las legacy sin account).
 *
 * @param trades Array de trades.
 * @returns Mapping {accountId: netShares, ...}; key '__NULL__' agrupa los sin account.
 */
export function aggregateSharesByAccount(
  trades: ReadonlyArray<Trade & { type?: string }> | null | undefined
): Record<string, number> {
  if (!Array.isArray(trades) || trades.length === 0) return {};
  const buckets: Record<string, Array<Trade & { type?: string }>> = {};
  for (const t of trades) {
    if (!t) continue;
    const acct = t.account == null ? '__NULL__' : String(t.account);
    if (!buckets[acct]) buckets[acct] = [];
    buckets[acct].push(t);
  }
  const out: Record<string, number> = {};
  for (const [acct, list] of Object.entries(buckets)) {
    out[acct] = aggregateShares(list);
  }
  return out;
}
