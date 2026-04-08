#!/usr/bin/env bash
# install-yt-poller.sh — One-shot installer for the YouTube poller launchd agent.
# Run once: ./scripts/install-yt-poller.sh
# Uninstall: launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.ayr.yt-poller.plist

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLIST_SOURCE="$SCRIPT_DIR/com.ayr.yt-poller.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/com.ayr.yt-poller.plist"

if [ ! -f "$PLIST_SOURCE" ]; then
  echo "ERROR: $PLIST_SOURCE not found"
  exit 1
fi

chmod +x "$SCRIPT_DIR/yt-poller.sh" "$SCRIPT_DIR/scan-youtube.sh"

mkdir -p "$HOME/Library/LaunchAgents"

# Unload existing instance if loaded (idempotent reinstall)
launchctl bootout "gui/$(id -u)/com.ayr.yt-poller" 2>/dev/null || true

# Copy plist + load
cp "$PLIST_SOURCE" "$PLIST_DEST"
launchctl bootstrap "gui/$(id -u)" "$PLIST_DEST"

echo "✅ YouTube poller installed and running."
echo ""
echo "It will check the Worker every 60 seconds and run scan-youtube.sh"
echo "whenever you press '🔔 Procesar' in the El Dividendo tab."
echo ""
echo "Logs:"
echo "  ~/Library/Logs/ayr-yt-poller.log         (poller activity)"
echo "  ~/Library/Logs/ayr-scan-youtube.log      (scan detail)"
echo ""
echo "To stop:    launchctl bootout gui/\$(id -u)/com.ayr.yt-poller"
echo "To restart: ./scripts/install-yt-poller.sh"
