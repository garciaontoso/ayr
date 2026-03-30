#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# AA&R — Script de instalación completo
# Ejecutar: bash setup.sh
# ═══════════════════════════════════════════════════════════════

set -e
cd "$(dirname "$0")"

echo ""
echo "═══════════════════════════════════════════"
echo "  AA&R — Instalación de Base de Datos"
echo "═══════════════════════════════════════════"
echo ""

# Step 1: Create schema
echo "📊 Paso 1/6: Creando tablas..."
wrangler d1 execute aar-finanzas --file=./schema.sql --remote
echo "✅ Tablas creadas"
echo ""

# Step 2: Patrimonio
echo "🏦 Paso 2/6: Migrando patrimonio (43 registros)..."
wrangler d1 execute aar-finanzas --file=./02_migrate_patrimonio.sql --remote
echo "✅ Patrimonio migrado"
echo ""

# Step 3: Dividendos
echo "💰 Paso 3/6: Migrando dividendos (8,257 registros — puede tardar 10s)..."
wrangler d1 execute aar-finanzas --file=./03_migrate_dividendos.sql --remote
echo "✅ Dividendos migrados"
echo ""

# Step 4: Gastos
echo "🧾 Paso 4/6: Migrando gastos (6,191 registros — puede tardar 10s)..."
wrangler d1 execute aar-finanzas --file=./04_migrate_gastos.sql --remote
echo "✅ Gastos migrados"
echo ""

# Step 5: Ingresos
echo "📈 Paso 5/6: Migrando ingresos (48 registros)..."
wrangler d1 execute aar-finanzas --file=./05_migrate_ingresos.sql --remote
echo "✅ Ingresos migrados"
echo ""

# Step 6: Resto
echo "⚙️  Paso 6/6: Migrando holdings, FIRE, P&L, config..."
wrangler d1 execute aar-finanzas --file=./06_migrate_resto.sql --remote
echo "✅ Todo migrado"
echo ""

echo "═══════════════════════════════════════════"
echo "  ✅ BASE DE DATOS LISTA"
echo "  ~14,900 registros importados"
echo "═══════════════════════════════════════════"
echo ""
echo "Siguiente paso: wrangler deploy"
echo ""
