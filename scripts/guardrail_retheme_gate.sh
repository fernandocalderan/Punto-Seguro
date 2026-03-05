#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${BASE_URL:-http://localhost:3000}"
START_SERVER="${START_SERVER:-1}"
BASE_REF="${BASE_REF:-main}"
SKIP_VISUAL_ONLY="${SKIP_VISUAL_ONLY:-0}"
RUNTIME_DATA_DIR="${DATA_DIR:-}"
TMP_DATA_DIR=""

SERVER_PID=""
cleanup() {
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  if [[ -n "$TMP_DATA_DIR" && -d "$TMP_DATA_DIR" ]]; then
    rm -rf "$TMP_DATA_DIR"
  fi
}
trap cleanup EXIT

echo "== Retheme guardrail gate =="
echo "BASE_REF: $BASE_REF"
echo "BASE_URL: $BASE_URL"

echo
if [[ "$SKIP_VISUAL_ONLY" == "1" ]]; then
  echo "[1/6] Visual-only diff guard (SKIPPED)"
else
  echo "[1/6] Visual-only diff guard"
  BASE_REF="$BASE_REF" bash "$ROOT_DIR/scripts/guardrail_visual_only.sh"
fi

if [[ "$START_SERVER" == "1" ]]; then
  echo
  echo "[2/6] Starting local server"
  if [[ -z "$RUNTIME_DATA_DIR" ]]; then
    TMP_DATA_DIR="$(mktemp -d "/tmp/ps-guardrail-data.XXXXXX")"
    RUNTIME_DATA_DIR="$TMP_DATA_DIR"
  fi
  DATA_DIR="$RUNTIME_DATA_DIR" node "$ROOT_DIR/server.js" >/tmp/ps_guardrail_server.log 2>&1 &
  SERVER_PID=$!
  sleep 2
else
  echo
  echo "[2/6] Skipping server start (START_SERVER=$START_SERVER)"
fi

echo
echo "[3/6] Static+runtime route audit"
BASE_URL="$BASE_URL" bash "$ROOT_DIR/scripts/audit_p0.sh"

echo
echo "[4/6] NO_TOCAR machine-contract validation"
BASE_URL="$BASE_URL" node "$ROOT_DIR/scripts/guardrail_validate_contracts.js"

echo
echo "[5/6] Risk scan matrix"
BASE_URL="$BASE_URL" bash "$ROOT_DIR/scripts/retheme_risk_scan.sh"

echo
echo "[6/6] CSS collision scan"
bash "$ROOT_DIR/scripts/retheme_css_collision_scan.sh"

echo
echo "[guardrail_retheme_gate] PASS"
