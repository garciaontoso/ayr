#!/usr/bin/env bash
# Install cron entry para ejecutar monthly-snapshot.py el día 1 de cada mes a las 7am Madrid.
# Output va a iCloud Drive ~/Library/Mobile Documents/com~apple~CloudDocs/A&R/snapshots/
# Coste $0 (corre local con tu API token A&R).

set -euo pipefail

REPO="/Users/ricardogarciaontoso/IA/AyR"
SCRIPT="$REPO/scripts/monthly-snapshot.py"
CRON_LINE="0 7 1 * * cd $REPO && /usr/local/bin/python3 $SCRIPT >> ~/Library/Logs/ayr-monthly-snapshot.log 2>&1"

# Check si ya existe
if crontab -l 2>/dev/null | grep -qF "monthly-snapshot.py"; then
  echo "✓ Cron entry ya existe. Para reinstalar: crontab -e y borra la línea con monthly-snapshot.py"
  exit 0
fi

# Append a crontab actual
(crontab -l 2>/dev/null || true; echo "$CRON_LINE") | crontab -

echo "✓ Cron entry instalado: día 1 de cada mes a 7am"
echo "  Comando: $CRON_LINE"
echo "  Logs: ~/Library/Logs/ayr-monthly-snapshot.log"
echo ""
echo "Para verificar:"
echo "  crontab -l | grep monthly-snapshot"
echo ""
echo "Para test manual ahora:"
echo "  python3 $SCRIPT"
echo ""
echo "Para borrar cron:"
echo "  crontab -e   # y eliminar la línea con monthly-snapshot.py"
