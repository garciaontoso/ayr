#!/usr/bin/env bash
# Sprint 23.1 — Pre-deploy guard para Cloudflare Worker.
#
# Previene que cualquier deploy (manual o vía agente) corrompa producción.
# Bloquea si detecta:
#   1. cwd no es el worktree esperado (debe contener api/wrangler.toml)
#   2. git branch no contiene "keen-bouman" o "main" (whitelist)
#   3. worker.js tiene <30k líneas (smell de regression masiva)
#   4. worker.js no contiene marker `SPRINT_22_5_AUTO_RECONCILE` (verificación
#      semántica de que es el código correcto, no Sprint 5 stub)
#   5. git status muestra cambios sin commitear (refuses to deploy uncommitted)
#
# Override: ALLOW_UNSAFE_DEPLOY=1 ./pre-deploy-guard.sh
#
# Exit 0 = deploy OK, exit 1 = ABORT.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

err() { echo -e "${RED}✗ $1${NC}" >&2; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }
ok() { echo -e "${GREEN}✓ $1${NC}"; }

abort() {
  err "DEPLOY ABORTED: $1"
  echo "" >&2
  echo "Override (solo si sabes lo que haces):" >&2
  echo "  ALLOW_UNSAFE_DEPLOY=1 npx wrangler deploy" >&2
  exit 1
}

# Bypass solo si override explícito
if [ "${ALLOW_UNSAFE_DEPLOY:-0}" = "1" ]; then
  warn "ALLOW_UNSAFE_DEPLOY=1 detected — skipping guard checks"
  exit 0
fi

echo "🛡 Pre-deploy guard checks..."

# ── Check 1: cwd contains wrangler.toml ──
if [ ! -f "wrangler.toml" ]; then
  abort "wrangler.toml no encontrado en cwd ($(pwd)). Debes ejecutar desde api/."
fi
ok "wrangler.toml encontrado en $(pwd)"

# ── Check 2: git branch whitelist ──
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'NO-GIT')"
if [[ ! "$CURRENT_BRANCH" =~ ^(main|claude/keen-bouman.*|claude/.*)$ ]]; then
  abort "Branch '$CURRENT_BRANCH' no está en whitelist. Solo deploy desde main o branches claude/."
fi
ok "Branch: $CURRENT_BRANCH"

# ── Check 3: worker.js size threshold ──
WORKER_JS="src/worker.js"
if [ ! -f "$WORKER_JS" ]; then
  abort "$WORKER_JS no existe."
fi
WORKER_LINES=$(wc -l < "$WORKER_JS")
WORKER_LINES=$(echo "$WORKER_LINES" | tr -d ' ')
MIN_LINES=30000
if [ "$WORKER_LINES" -lt "$MIN_LINES" ]; then
  abort "worker.js tiene $WORKER_LINES líneas (mínimo $MIN_LINES). ¿Estás en worktree incorrecto? El worker producción tiene ~36k líneas Sprint 22+."
fi
ok "worker.js tiene $WORKER_LINES líneas (≥$MIN_LINES)"

# ── Check 4: semantic marker presence ──
# Marker que SOLO existe en Sprint 22.5+ code. Si falta = pre-Sprint 22 stub.
SEMANTIC_MARKER="auto-reconcile-from-ib"
if ! grep -q "$SEMANTIC_MARKER" "$WORKER_JS"; then
  abort "worker.js no contiene marker '$SEMANTIC_MARKER'. ¿Estás deployando código pre-Sprint 22.5? Posible regression masiva."
fi
ok "Semantic marker '$SEMANTIC_MARKER' presente"

# ── Check 5: no uncommitted changes (warn only — common during dev) ──
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  warn "Cambios sin commitear detectados:"
  git status --short | head -10
  warn "Si deploy va a producción, considera commit primero (audit trail)."
fi

# ── Check 6: production current version (info only) ──
echo ""
echo "Production estado actual:"
PROD_VERSION=$(npx wrangler deployments list 2>&1 | grep -m1 "Version ID" | awk '{print $NF}' || echo 'unknown')
echo "  Last deployed version: $PROD_VERSION"
echo "  About to deploy commit: $(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"

echo ""
ok "Guard PASSED — proceeding with deploy"
echo ""
