#!/bin/bash
# A&R IB Stack — health check
# Run on the NAS via SSH:
#   ssh ricardo@nas
#   cd /volume1/docker/ib-stack
#   ./health-check.sh
#
# Shows:
#   - container status (running / exited / unhealthy)
#   - last 5 log lines per service
#   - ib-bridge /health response (with Bearer auth)
#   - cloudflared tunnel status (extracted from logs)

set -u

# -- colours (tty only) --------------------------------------------------------
if [ -t 1 ]; then
  GREEN="\033[1;32m"; RED="\033[1;31m"; YELLOW="\033[1;33m"; DIM="\033[2m"; RST="\033[0m"
else
  GREEN=""; RED=""; YELLOW=""; DIM=""; RST=""
fi

ok()   { printf "${GREEN}✓${RST} %s\n" "$1"; }
bad()  { printf "${RED}✗${RST} %s\n" "$1"; }
warn() { printf "${YELLOW}!${RST} %s\n" "$1"; }
hr()   { printf "${DIM}%s${RST}\n" "----------------------------------------------------------------"; }

# -- where are we --------------------------------------------------------------
COMPOSE_DIR="${COMPOSE_DIR:-/volume1/docker/ib-stack}"
ENV_FILE="$COMPOSE_DIR/.env"

if [ ! -f "$COMPOSE_DIR/docker-compose.yml" ]; then
  bad "no docker-compose.yml at $COMPOSE_DIR — run setup.sh first?"
  exit 1
fi

cd "$COMPOSE_DIR"

# -- 1) container status -------------------------------------------------------
hr
echo "Container status (docker compose ps)"
hr
docker compose ps 2>&1 || { bad "'docker compose ps' failed — is Container Manager running?"; exit 1; }
echo

# -- 2) per-service log tail ---------------------------------------------------
for svc in ib-gateway ib-bridge cloudflared; do
  hr
  echo "$svc — last 5 log lines"
  hr
  docker compose logs --tail=5 --no-log-prefix "$svc" 2>&1 || warn "logs unavailable for $svc"
  echo
done

# -- 3) ib-bridge /health (with Bearer auth) ----------------------------------
hr
echo "ib-bridge /health (auth-protected)"
hr
if [ ! -f "$ENV_FILE" ]; then
  warn "no $ENV_FILE — skipping auth probe"
else
  TOKEN="$(grep -E '^BRIDGE_AUTH_TOKEN=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
  if [ -z "$TOKEN" ]; then
    warn "BRIDGE_AUTH_TOKEN is empty in .env — skipping auth probe"
  else
    # exec inside the cloudflared container so we hit the bridge over the
    # internal network (no host port published).
    RESPONSE="$(docker compose exec -T cloudflared sh -c \
      "wget -qO- --header='Authorization: Bearer $TOKEN' http://ib-bridge:8080/health" 2>&1 || true)"
    if [ -z "$RESPONSE" ]; then
      bad "no response from ib-bridge:/health"
    else
      echo "$RESPONSE"
      if echo "$RESPONSE" | grep -q '"ib_connected":true'; then
        ok "ib-bridge healthy AND connected to IB Gateway"
      elif echo "$RESPONSE" | grep -q '"ok":true'; then
        warn "ib-bridge process up but NOT connected to IB Gateway"
      else
        bad "/health returned unexpected payload"
      fi
    fi
  fi
fi
echo

# -- 4) cloudflared tunnel registration ----------------------------------------
hr
echo "cloudflared — tunnel registration"
hr
TUNNEL_LOG="$(docker compose logs --tail=200 --no-log-prefix cloudflared 2>&1 || true)"
REGISTERED="$(echo "$TUNNEL_LOG" | grep -i 'Registered tunnel connection' | tail -4)"
if [ -n "$REGISTERED" ]; then
  echo "$REGISTERED"
  ok "cloudflared has registered connections"
else
  bad "no 'Registered tunnel connection' lines in last 200 log entries"
  echo "  recent errors:"
  echo "$TUNNEL_LOG" | grep -iE '(error|fail|unauthor)' | tail -5
fi
echo

# -- 5) public reachability (best effort) --------------------------------------
hr
echo "Public reachability — https://ib.onto-so.com/health (no auth)"
hr
PUBLIC="$(docker compose exec -T cloudflared sh -c \
  "wget -qO- --tries=1 --timeout=5 https://ib.onto-so.com/health" 2>&1 || true)"
if [ -n "$PUBLIC" ]; then
  echo "$PUBLIC"
  ok "tunnel is publicly reachable"
else
  warn "no public response (might be normal if /health is auth-only or DNS still propagating)"
fi
echo

hr
echo "Done."
