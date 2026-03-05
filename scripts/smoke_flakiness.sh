#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNS="${RUNS:-5}"
BASE_URL="${BASE_URL:-http://localhost:3000}"
OUT_DIR="$ROOT_DIR/docs/diagnostics/flakiness_runs"
REPORT="$ROOT_DIR/docs/diagnostics/flakiness_report.md"

mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR"/run_*.json "$OUT_DIR"/run_*.log

function wait_for_server() {
  local attempts=30
  for _ in $(seq 1 "$attempts"); do
    code="$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/" || true)"
    if [[ "$code" == "200" ]]; then
      return 0
    fi
    sleep 1
  done
  return 1
}

for run in $(seq 1 "$RUNS"); do
  echo "[flakiness] run $run/$RUNS"
  TMP_DATA_DIR="$(mktemp -d "/tmp/ps-smoke-data.${run}.XXXXXX")"
  SERVER_LOG="/tmp/ps_smoke_server_${run}.log"
  RUN_LOG="$OUT_DIR/run_${run}.log"
  RUN_SUMMARY="$OUT_DIR/run_${run}.json"

  DATA_DIR="$TMP_DATA_DIR" node "$ROOT_DIR/server.js" >"$SERVER_LOG" 2>&1 &
  SERVER_PID=$!

  if ! wait_for_server; then
    echo "server did not boot for run $run" | tee -a "$RUN_LOG"
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" 2>/dev/null || true
    rm -rf "$TMP_DATA_DIR"
    continue
  fi

  set +e
  BASE_URL="$BASE_URL" node "$ROOT_DIR/scripts/runtime_smoke_playwright.js" >"$RUN_LOG" 2>&1
  EXIT_CODE=$?
  set -e

  if [[ -f "$ROOT_DIR/docs/diagnostics/runtime_smoke_summary.json" ]]; then
    cp "$ROOT_DIR/docs/diagnostics/runtime_smoke_summary.json" "$RUN_SUMMARY"
  fi

  if [[ -f "$RUN_SUMMARY" ]]; then
    node - <<'NODE' "$RUN_SUMMARY" "$EXIT_CODE"
const fs = require('fs');
const summaryPath = process.argv[2];
const exitCode = Number(process.argv[3]);
const data = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
data.run_exit_code = exitCode;
fs.writeFileSync(summaryPath, JSON.stringify(data, null, 2));
NODE
  fi

  kill "$SERVER_PID" >/dev/null 2>&1 || true
  wait "$SERVER_PID" 2>/dev/null || true
  rm -rf "$TMP_DATA_DIR"
done

{
  echo "# Runtime Smoke Flakiness Report"
  echo
  echo "Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  echo "Runs: $RUNS"
  echo "Base URL: $BASE_URL"
  echo
  echo "| Run | Exit | OTP status | Tracking missing | Network failures* | Console errors |"
  echo "|---|---:|---|---|---:|---:|"
} >"$REPORT"

PASS_COUNT=0

for run in $(seq 1 "$RUNS"); do
  RUN_SUMMARY="$OUT_DIR/run_${run}.json"
  if [[ ! -f "$RUN_SUMMARY" ]]; then
    echo "| $run | n/a | n/a | n/a | n/a | n/a |" >>"$REPORT"
    continue
  fi

  row="$(node - <<'NODE' "$RUN_SUMMARY"
const fs = require('fs');
const p = process.argv[2];
const s = JSON.parse(fs.readFileSync(p, 'utf8'));
const exitCode = Number.isFinite(Number(s.run_exit_code)) ? Number(s.run_exit_code) : 1;
const otp = s.otpStatus || 'UNKNOWN';
const missing = Array.isArray(s.trackingMissing) ? s.trackingMissing.join(', ') : '';
const consoleErrors = Array.isArray(s.consoleErrors) ? s.consoleErrors.length : 0;
const pageErrors = Array.isArray(s.pageErrors) ? s.pageErrors.length : 0;
const failures = Array.isArray(s.networkFailures)
  ? s.networkFailures.filter((f) => !((f.url === '/api/eval-snapshot/me') && f.status === 404)).length
  : 0;
console.log([exitCode, otp, missing || '-', failures, consoleErrors + pageErrors].join('|'));
NODE
)"

  IFS='|' read -r exitCode otpStatus trackingMissing failureCount errorCount <<<"$row"
  if [[ "$exitCode" == "0" ]]; then
    PASS_COUNT=$((PASS_COUNT + 1))
  fi

  echo "| $run | $exitCode | $otpStatus | $trackingMissing | $failureCount | $errorCount |" >>"$REPORT"
done

{
  echo
  echo "\\* Network failures exclude expected \`GET /api/eval-snapshot/me -> 404\`."
  echo
  echo "Pass ratio: $PASS_COUNT/$RUNS"
} >>"$REPORT"

echo "[smoke_flakiness] report generated: $REPORT"
