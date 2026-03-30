#!/bin/bash
set -e
cd "$(dirname "$0")"

echo ""
echo "═══════════════════════════════════════════"
echo "  AA&R — Migración de datos (parte 2)"
echo "═══════════════════════════════════════════"
echo ""

echo "💰 Migrando dividendos (2,066 registros)..."
for f in div_chunks/div_*.sql; do
  echo -n "  $(basename $f)... "
  wrangler d1 execute aar-finanzas --file="./$f" --remote --yes 2>&1 | tail -1
done
echo "✅ Dividendos migrados"
echo ""

echo "🧾 Migrando gastos (6,192 registros)..."
for f in gast_chunks/gast_*.sql; do
  echo -n "  $(basename $f)... "
  wrangler d1 execute aar-finanzas --file="./$f" --remote --yes 2>&1 | tail -1
done
echo "✅ Gastos migrados"
echo ""

echo "📈 Migrando ingresos..."
wrangler d1 execute aar-finanzas --file=./05_migrate_ingresos.sql --remote --yes 2>&1 | tail -1
echo "✅ Ingresos migrados"
echo ""

echo "⚙️  Migrando holdings, FIRE, P&L, config..."
wrangler d1 execute aar-finanzas --file=./06_migrate_resto.sql --remote --yes 2>&1 | tail -1
echo "✅ Todo migrado"
echo ""

echo "═══════════════════════════════════════════"
echo "  ✅ BASE DE DATOS COMPLETA"
echo "═══════════════════════════════════════════"
