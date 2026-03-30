#!/bin/bash
# Backup código AyR a Google Drive
# Excluye node_modules, dist, .wrangler, .claude

DRIVE_DIR="$HOME/Library/CloudStorage/GoogleDrive-garciaontoso@gmail.com/Mi unidad/IA/AyR"

rsync -av --delete \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude '.wrangler' \
  --exclude '.claude' \
  /Users/ricardogarciaontoso/IA/AyR/ \
  "$DRIVE_DIR/"

echo "Backup completado: $(date)"
