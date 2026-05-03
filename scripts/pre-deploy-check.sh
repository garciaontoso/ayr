#!/usr/bin/env bash
# Pre-deploy guard — bloquea el deploy si hay regresiones de datos detectables.
#
# Ejecuta:
#   1. Audit completo del portfolio
#   2. Compara contadores de issues con el snapshot anterior
#   3. Si hay nuevos red issues → ABORTA el deploy con explicación
#
# Uso:
#   bash scripts/pre-deploy-check.sh && cd frontend && npm run build && ...
#
# Configurable:
#   AUDIT_BASELINE — fichero con el snapshot anterior (default: .audit-baseline.json)
#   ALLOW_REGRESSION=1 → fuerza el deploy a pesar de regresión (emergency override)

set -euo pipefail

API_URL="${API_URL:-https://api.onto-so.com}"
BASELINE_FILE="${AUDIT_BASELINE:-.audit-baseline.json}"

echo "🩺 Pre-deploy data audit..."
echo

# Llamar al endpoint
RESPONSE=$(curl -s --max-time 30 "${API_URL}/api/audit/full" || echo '{}')
if [[ -z "$RESPONSE" ]] || [[ "$RESPONSE" == "{}" ]]; then
  echo "⚠️  WARN: audit endpoint no respondió. Continuando deploy (no se puede verificar)."
  exit 0
fi

# Parsear con python (siempre instalado)
SUMMARY=$(echo "$RESPONSE" | python3 -c "
import json, sys
d = json.load(sys.stdin)
s = d.get('summary', {})
total = s.get('total_issues', 0)
red = s.get('red', 0)
yellow = s.get('yellow', 0)
print(str(total) + '|' + str(red) + '|' + str(yellow))
")
TOTAL=$(echo "$SUMMARY" | cut -d'|' -f1)
RED=$(echo "$SUMMARY" | cut -d'|' -f2)
YELLOW=$(echo "$SUMMARY" | cut -d'|' -f3)

echo "📊 Audit actual: $TOTAL issues totales · 🔴$RED · 🟡$YELLOW"

# Comparar con baseline si existe
if [[ -f "$BASELINE_FILE" ]]; then
  BASE_SUMMARY=$(cat "$BASELINE_FILE" | python3 -c "
import json, sys
try:
  d = json.load(sys.stdin)
  s = d.get('summary', {})
  total = s.get('total_issues', 0)
  red = s.get('red', 0)
  yellow = s.get('yellow', 0)
  print(str(total) + '|' + str(red) + '|' + str(yellow))
except: print('0|0|0')
")
  BASE_TOTAL=$(echo "$BASE_SUMMARY" | cut -d'|' -f1)
  BASE_RED=$(echo "$BASE_SUMMARY" | cut -d'|' -f2)

  DELTA_RED=$((RED - BASE_RED))
  DELTA_TOTAL=$((TOTAL - BASE_TOTAL))

  echo "📈 vs baseline: total ${DELTA_TOTAL:+}${DELTA_TOTAL} · red ${DELTA_RED:+}${DELTA_RED}"
  echo

  # Bloqueo si hay nuevos red
  if [[ $DELTA_RED -gt 0 ]]; then
    echo "❌ BLOQUEADO: $DELTA_RED nuevos issues 🔴 vs baseline."
    echo "   Detalles:"
    echo "$RESPONSE" | python3 -c "
import json, sys
d = json.load(sys.stdin)
all_red = []
for cat, lst in (d.get('issues') or {}).items():
  for it in lst:
    if it.get('sev') == 'red':
      all_red.append('   * [' + cat + '] ' + str(it.get('ticker')) + ': ' + str(it.get('msg')))
print('\n'.join(all_red[:10]))
"
    echo
    if [[ "${ALLOW_REGRESSION:-0}" == "1" ]]; then
      echo "⚠️  ALLOW_REGRESSION=1 → forzando deploy a pesar de regresión"
    else
      echo "❌ Para forzar el deploy: ALLOW_REGRESSION=1 bash $0"
      exit 1
    fi
  fi

  if [[ $DELTA_TOTAL -gt 20 ]]; then
    echo "⚠️  WARN: $DELTA_TOTAL más issues totales vs baseline (pero ningún nuevo red)."
    echo "   Continuando deploy. Considera revisar tab Audit después."
  fi
else
  echo "ℹ️  No baseline (.audit-baseline.json) — creándolo ahora"
fi

# Persistir snapshot actual como nueva baseline
echo "$RESPONSE" > "$BASELINE_FILE"
echo "✅ Pre-deploy check OK. Baseline actualizada en $BASELINE_FILE"
