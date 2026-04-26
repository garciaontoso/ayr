#!/bin/bash
# A&R IB Stack — setup helper
# Creates the bind-mount directory tree, copies docker-compose.yml + .env.example,
# and (if missing) generates a strong BRIDGE_AUTH_TOKEN.
#
# Run on the NAS via SSH AFTER you've copied this whole folder over, e.g.:
#   scp -r nas-deploy ricardo@nas:/volume1/docker/ib-stack/_repo/
#   ssh ricardo@nas
#   cd /volume1/docker/ib-stack/_repo/
#   ./setup.sh
#
# Idempotent — safe to re-run. Won't overwrite an existing .env.

set -eu

TARGET="/volume1/docker/ib-stack"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ">> A&R IB Stack — setup"
echo "   target: $TARGET"
echo "   source: $SCRIPT_DIR"
echo

# --- 1) bind-mount tree -------------------------------------------------------
echo ">> creating bind-mount directories..."
mkdir -p "$TARGET/ib-gateway/config"
mkdir -p "$TARGET/ib-gateway/logs"
echo "   ok"

# --- 2) copy docker-compose.yml ----------------------------------------------
echo ">> copying docker-compose.yml..."
cp "$SCRIPT_DIR/docker-compose.yml" "$TARGET/docker-compose.yml"
echo "   ok"

# --- 3) copy .env.example (always) and create .env if missing ----------------
echo ">> copying .env.example..."
cp "$SCRIPT_DIR/.env.example" "$TARGET/.env.example"

if [ -f "$TARGET/.env" ]; then
  echo ">> .env already exists — leaving it alone"
else
  echo ">> creating $TARGET/.env from template..."
  cp "$SCRIPT_DIR/.env.example" "$TARGET/.env"

  # generate a strong bridge auth token
  TOKEN="$(openssl rand -hex 32)"
  # macOS sed needs '' after -i, GNU sed (Synology) doesn't — try GNU first
  if sed --version >/dev/null 2>&1; then
    sed -i "s|^BRIDGE_AUTH_TOKEN=.*|BRIDGE_AUTH_TOKEN=$TOKEN|" "$TARGET/.env"
  else
    sed -i '' "s|^BRIDGE_AUTH_TOKEN=.*|BRIDGE_AUTH_TOKEN=$TOKEN|" "$TARGET/.env"
  fi
  chmod 600 "$TARGET/.env"
  echo "   ok — BRIDGE_AUTH_TOKEN generated and written"
fi

# --- 4) copy health-check.sh -------------------------------------------------
if [ -f "$SCRIPT_DIR/health-check.sh" ]; then
  cp "$SCRIPT_DIR/health-check.sh" "$TARGET/health-check.sh"
  chmod +x "$TARGET/health-check.sh"
  echo ">> copied health-check.sh"
fi

echo
echo ">> done. Next steps:"
echo
echo "   1. Edit $TARGET/.env — fill in TWS_USERID, TWS_PASSWORD, TUNNEL_TOKEN"
echo "      (BRIDGE_AUTH_TOKEN was already generated)"
echo
echo "   2. Create the Cloudflare Tunnel (one-time, in browser):"
echo "      Zero Trust → Networks → Tunnels → Create"
echo "        Name: ib-bridge-nas"
echo "        Save Token, paste into TUNNEL_TOKEN in .env"
echo "      Add Public Hostname:"
echo "        Subdomain: ib"
echo "        Domain: onto-so.com"
echo "        Service: http://ib-bridge:8080"
echo
echo "   3. Bring the stack up:"
echo "        cd $TARGET"
echo "        docker compose up -d"
echo
echo "   4. Watch logs:"
echo "        docker compose logs -f"
echo
echo "   5. Verify from your laptop:"
echo "        TOKEN=\$(grep BRIDGE_AUTH_TOKEN $TARGET/.env | cut -d= -f2)"
echo "        curl https://ib.onto-so.com/healthz -H \"Authorization: Bearer \$TOKEN\""
echo
