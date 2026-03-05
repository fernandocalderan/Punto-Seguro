#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
TMP_DIR="$(mktemp -d)"
EXIT_CODE=0

trap 'rm -rf "$TMP_DIR"' EXIT

ROUTES=(
  "/"
  "/diagnostico"
  "/resultado"
  "/solicitar-propuesta"
  "/confirmacion"
)

declare -A REQUIRED_IDS=(
  ["/"]="hero-primary-cta eval-restore-banner ps-iei-title ps-iei-desc"
  ["/diagnostico"]="evaluador-form tipo-inmueble formulario-vivienda formulario-comercio iei-vivienda-root iei-comercio-root"
  ["/resultado"]="risk-score risk-level-badge recommendations-list top-factors-list cta-request cta-keep iei-bar-fill"
  ["/solicitar-propuesta"]="lead-form name phone email postal_code consent ps-otp-overlay ps-otp-confirm ps-otp-resend ps-otp-close"
  ["/confirmacion"]="confirmation-message"
)

declare -A REQUIRED_REFS=(
  ["/"]="/css/ps-ui.css /js/analytics.js /js/ps-cta.js /js/iei-meta.js /js/iei-ui.js"
  ["/diagnostico"]="/css/ps-ui.css /js/analytics.js /js/iei-evaluador-user-v1.js /js/ps-cta.js /js/iei-meta.js /js/iei-ui.js"
  ["/resultado"]="styles/leads.css /css/ps-ui.css /js/analytics.js js/resultado.js /js/ps-cta.js /js/iei-meta.js /js/iei-ui.js"
  ["/solicitar-propuesta"]="styles/leads.css /css/ps-ui.css /js/analytics.js js/lead-form.js /js/ps-cta.js /js/iei-meta.js /js/iei-ui.js"
  ["/confirmacion"]="styles/leads.css /css/ps-ui.css /js/analytics.js /js/ps-cta.js /js/iei-meta.js /js/iei-ui.js"
)

CRITICAL_ASSETS=(
  "/css/ps-ui.css"
  "/styles/leads.css"
  "/js/analytics.js"
  "/js/ps-cta.js"
  "/js/iei-meta.js"
  "/js/iei-ui.js"
  "/js/iei-evaluador-user-v1.js"
  "/js/resultado.js"
  "/js/lead-form.js"
  "/Motor-IEI/iei_questions_premium.json"
  "/Motor-IEI/calculateIEI.js"
  "/logo-punto-seguro.png"
  "/favicon.ico"
  "/favicon-32x32.png"
  "/favicon-16x16.png"
  "/apple-touch-icon.png"
)

function route_to_name() {
  local route="$1"
  if [[ "$route" == "/" ]]; then
    echo "root"
    return
  fi
  echo "${route#/}" | tr '/' '_'
}

function fetch_route() {
  local route="$1"
  local out_file="$2"
  local url="${BASE_URL}${route}"
  local code

  code="$(curl -sS -L -o "$out_file" -w "%{http_code}" "$url" || true)"
  if [[ "$code" != "200" ]]; then
    echo "  [FAIL] GET $route -> HTTP $code"
    EXIT_CODE=1
    return 1
  fi
  echo "  [OK] GET $route -> HTTP 200"
  return 0
}

function assert_ids() {
  local route="$1"
  local html_file="$2"
  local id
  for id in ${REQUIRED_IDS[$route]}; do
    if grep -q "id=\"$id\"" "$html_file"; then
      echo "    [OK] id=\"$id\""
    else
      echo "    [FAIL] missing id=\"$id\""
      EXIT_CODE=1
    fi
  done
}

function assert_refs() {
  local route="$1"
  local html_file="$2"
  local ref
  for ref in ${REQUIRED_REFS[$route]}; do
    if grep -Fq "$ref" "$html_file"; then
      echo "    [OK] ref contains \"$ref\""
    else
      echo "    [FAIL] missing ref \"$ref\""
      EXIT_CODE=1
    fi
  done
}

function is_asset_referenced() {
  local asset="$1"
  local relative="${asset#/}"

  if grep -R -Fq "$asset" "$TMP_DIR" 2>/dev/null; then
    return 0
  fi

  if grep -R -Fq "$relative" "$TMP_DIR" 2>/dev/null; then
    return 0
  fi

  return 1
}

function assert_iei_module_contracts() {
  local js_file="$TMP_DIR/iei-evaluador-user-v1.js"
  local js_url="${BASE_URL}/js/iei-evaluador-user-v1.js"
  local code

  echo "-- Module contracts: /js/iei-evaluador-user-v1.js"
  code="$(curl -sS -L -o "$js_file" -w "%{http_code}" "$js_url" || true)"
  if [[ "$code" != "200" ]]; then
    echo "  [FAIL] GET /js/iei-evaluador-user-v1.js -> HTTP $code"
    EXIT_CODE=1
    echo
    return
  fi

  echo "  [OK] GET /js/iei-evaluador-user-v1.js -> HTTP 200"

  if grep -Fq '"/Motor-IEI/iei_questions_premium.json"' "$js_file"; then
    echo "  [OK] references QUESTIONS_URL (/Motor-IEI/iei_questions_premium.json)"
  else
    echo "  [FAIL] missing QUESTIONS_URL contract"
    EXIT_CODE=1
  fi

  if grep -Fq '"/Motor-IEI/calculateIEI.js"' "$js_file"; then
    echo "  [OK] references MOTOR_URL (/Motor-IEI/calculateIEI.js)"
  else
    echo "  [FAIL] missing MOTOR_URL contract"
    EXIT_CODE=1
  fi

  if grep -Fq "window.calcularRiesgo" "$js_file"; then
    echo "  [OK] exposes window.calcularRiesgo"
  else
    echo "  [FAIL] missing window.calcularRiesgo bridge"
    EXIT_CODE=1
  fi
  echo
}

echo "== Punto Seguro P0 audit =="
echo "Base URL: $BASE_URL"
echo "Nota: este script no ejecuta OTP real; solo valida contratos estáticos y referencias."
echo

for route in "${ROUTES[@]}"; do
  name="$(route_to_name "$route")"
  html_file="$TMP_DIR/${name}.html"

  echo "-- Route: $route"
  if fetch_route "$route" "$html_file"; then
    echo "  IDs mínimos:"
    assert_ids "$route" "$html_file"
    echo "  Referencias JS/CSS mínimas:"
    assert_refs "$route" "$html_file"
  fi
  echo
done

assert_iei_module_contracts

echo "== Critical assets (referenced + HTTP status) =="
for asset in "${CRITICAL_ASSETS[@]}"; do
  referenced="NO"
  if is_asset_referenced "$asset"; then
    referenced="YES"
  fi

  code="$(curl -sS -L -o /dev/null -w "%{http_code}" "${BASE_URL}${asset}" || true)"
  if [[ "$code" == "200" ]]; then
    echo "  [OK] $asset referenced=$referenced status=200"
  else
    echo "  [WARN] $asset referenced=$referenced status=$code"
    if [[ "$referenced" == "YES" ]]; then
      EXIT_CODE=1
    fi
  fi
done

echo
if [[ "$EXIT_CODE" -eq 0 ]]; then
  echo "Audit result: PASS"
else
  echo "Audit result: FAIL"
fi

exit "$EXIT_CODE"
