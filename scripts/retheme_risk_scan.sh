#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_FILE="$ROOT_DIR/docs/RETHEME_RISKS.md"
BASE_URL="${BASE_URL:-http://localhost:3000}"

mkdir -p "$ROOT_DIR/docs"

escape_md() {
  printf '%s' "$1" | sed 's/|/\\|/g'
}

relpath() {
  local p="$1"
  p="${p#$ROOT_DIR/}"
  printf '%s' "$p"
}

append_row() {
  local contract="$1"
  local loc="$2"
  local risk="$3"
  local breakage="$4"
  local mitigation="$5"

  printf '| `%s` | `%s` | %s | %s | %s |\n' \
    "$(escape_md "$contract")" \
    "$(escape_md "$loc")" \
    "$(escape_md "$risk")" \
    "$(escape_md "$breakage")" \
    "$(escape_md "$mitigation")" \
    >> "$OUT_FILE"
}

write_table_header() {
  cat >> "$OUT_FILE" <<'TABLE'
| Contrato | Archivo/Línea | Riesgo | Qué puede romper | Mitigación recomendada |
|---|---|---|---|---|
TABLE
}

run_audit_section() {
  local audit_output=""
  local audit_rc=0

  if [[ -x "$ROOT_DIR/scripts/audit_p0.sh" ]]; then
    set +e
    audit_output="$(BASE_URL="$BASE_URL" bash "$ROOT_DIR/scripts/audit_p0.sh" 2>&1)"
    audit_rc=$?
    set -e
  else
    audit_output="audit_p0.sh no encontrado"
    audit_rc=127
  fi

  {
    echo "## 1) Resultado de auditoría P0"
    echo
    printf 'Base URL auditada: `%s`\n' "$BASE_URL"
    echo
    if [[ $audit_rc -eq 0 ]]; then
      echo "Estado general: **PASS**"
    else
      echo "Estado general: **FAIL** (rc=$audit_rc)"
    fi
    echo
    echo "| Ruta | Estado | Evidencia |"
    echo "|---|---|---|"
  } >> "$OUT_FILE"

  local routes=("/" "/diagnostico" "/resultado" "/solicitar-propuesta" "/confirmacion")
  local route
  for route in "${routes[@]}"; do
    if printf '%s\n' "$audit_output" | grep -Fq "[OK] GET $route -> HTTP 200"; then
      printf '| `%s` | PASS | HTTP 200 + contratos mínimos OK |\n' "$route" >> "$OUT_FILE"
    else
      printf '| `%s` | FAIL | revisar salida de audit_p0.sh |\n' "$route" >> "$OUT_FILE"
    fi
  done

  {
    echo
    echo "Resumen audit_p0.sh:"
    echo
    echo '```text'
    printf '%s\n' "$audit_output"
    echo '```'
    echo
  } >> "$OUT_FILE"
}

scan_dom_contracts() {
  echo "## 2) Matriz de ruptura - DOM contracts" >> "$OUT_FILE"
  echo >> "$OUT_FILE"
  write_table_header

  local -A seen=()
  local count=0
  local limit=120
  local dom_regex
  dom_regex="getElementById\\(\\s*['\\\"][^'\\\"]+['\\\"]\\)|querySelector(All)?\\(\\s*['\\\"][^'\\\"]+['\\\"]\\)|closest\\(\\s*['\\\"][^'\\\"]+['\\\"]\\)"

  mapfile -t lines < <(
    rg -H -n -o --no-heading --glob '!node_modules/**' \
      "$dom_regex" \
      "$ROOT_DIR/js" \
      "$ROOT_DIR/index.html" \
      "$ROOT_DIR/evaluador.html" \
      "$ROOT_DIR/resultado.html" \
      "$ROOT_DIR/solicitar-propuesta.html" \
      "$ROOT_DIR/confirmacion.html" \
      "$ROOT_DIR/iei.html" \
      "$ROOT_DIR/proveedores.html" \
      "$ROOT_DIR/blog.html" \
      "$ROOT_DIR/admin" 2>/dev/null || true
  )

  local line file rest line_no match selector kind risk breakage mitigation key
  for line in "${lines[@]}"; do
    file="${line%%:*}"
    rest="${line#*:}"
    line_no="${rest%%:*}"
    match="${rest#*:}"

    selector="$(printf '%s' "$match" | sed -E "s/getElementById\([\"']([^\"']+)[\"']\)/#\\1/; s/querySelectorAll?\([\"']([^\"']+)[\"']\)/\\1/; s/closest\([\"']([^\"']+)[\"']\)/\\1/")"
    [[ -z "$selector" ]] && continue

    if [[ "$match" == getElementById* ]]; then
      kind="DOM ID"
      risk="Alta"
      breakage="Eventos/render/validación no encuentran nodo"
      mitigation="Mantener ID exacto; si cambia markup, añadir alias en el nodo final"
    elif [[ "$selector" == *"data-"* ]]; then
      kind="DOM data-attr selector"
      risk="Alta"
      breakage="Delegación de eventos y tracking dejan de disparar"
      mitigation="Preservar data-attrs legacy y mapearlos en markup nuevo"
    elif [[ "$selector" == *"#"* ]]; then
      kind="DOM ID selector"
      risk="Alta"
      breakage="Lógica JS acoplada a selector específico"
      mitigation="No renombrar; usar alias de compatibilidad"
    else
      kind="DOM class/compound selector"
      risk="Media"
      breakage="Eventos delegados o UX dinámica inestable"
      mitigation="Mantener clase legacy o añadir selector alias en compat.css/markup"
    fi

    key="$kind|$selector"
    [[ -n "${seen[$key]:-}" ]] && continue
    seen[$key]=1

    append_row "$kind: $selector" "$(relpath "$file"):$line_no" "$risk" "$breakage" "$mitigation"
    count=$((count + 1))
    [[ $count -ge $limit ]] && break
  done

  echo >> "$OUT_FILE"
}

scan_storage_contracts() {
  echo "## 3) Matriz de ruptura - Storage contracts" >> "$OUT_FILE"
  echo >> "$OUT_FILE"
  write_table_header

  local -A seen=()
  local storage_regex
  storage_regex="(sessionStorage|localStorage)\\.(getItem|setItem)\\(\\s*['\\\"][^'\\\"]+['\\\"]\\)"
  mapfile -t lines < <(
    rg -H -n -o --no-heading --glob '!node_modules/**' \
      "$storage_regex" \
      "$ROOT_DIR/js" "$ROOT_DIR/index.html" "$ROOT_DIR/confirmacion.html" 2>/dev/null || true
  )

  local line file rest line_no match key_name contract key
  for line in "${lines[@]}"; do
    file="${line%%:*}"
    rest="${line#*:}"
    line_no="${rest%%:*}"
    match="${rest#*:}"

    key_name="$(printf '%s' "$match" | sed -E "s/.*\([\"']([^\"']+)[\"']\).*/\\1/")"
    [[ -z "$key_name" ]] && continue

    key="storage|$key_name"
    [[ -n "${seen[$key]:-}" ]] && continue
    seen[$key]=1

    contract="Storage key: $key_name"
    append_row "$contract" "$(relpath "$file"):$line_no" "Alta" "Se rompe traspaso entre páginas (resultado/lead/confirmación/restore)" "No renombrar key; si migras estructura, usar compat de lectura y escritura dual temporal"
  done

  echo >> "$OUT_FILE"
}

scan_api_contracts() {
  echo "## 4) Matriz de ruptura - API contracts" >> "$OUT_FILE"
  echo >> "$OUT_FILE"
  write_table_header

  local -A seen=()
  local client_regex
  client_regex="fetch\\(\\s*['\\\"]/api[^'\\\" )]*['\\\"]|axios\\.(get|post|put|patch|delete)\\(\\s*['\\\"]/api[^'\\\" )]*['\\\"]"

  mapfile -t client_lines < <(
    rg -H -n -o --no-heading --glob '!node_modules/**' \
      "$client_regex" \
      "$ROOT_DIR/js" "$ROOT_DIR/index.html" "$ROOT_DIR/evaluador.html" "$ROOT_DIR/resultado.html" "$ROOT_DIR/solicitar-propuesta.html" "$ROOT_DIR/admin" 2>/dev/null || true
  )

  local line file rest line_no match route key
  for line in "${client_lines[@]}"; do
    file="${line%%:*}"
    rest="${line#*:}"
    line_no="${rest%%:*}"
    match="${rest#*:}"

    route="$(printf '%s' "$match" | sed -E "s/.*[\"'](\/api[^\"']*)[\"'].*/\\1/")"
    [[ -z "$route" ]] && continue

    key="client|$route"
    [[ -n "${seen[$key]:-}" ]] && continue
    seen[$key]=1

    append_row "API cliente: $route" "$(relpath "$file"):$line_no" "Alta" "Flujos OTP/leads/tracking/admin fallan por endpoint roto" "Mantener ruta, método y payload; introducir alias backend solo si no hay alternativa"
  done

  mapfile -t server_lines < <(
    rg -H -n -o 'app\.(get|post|put|patch|delete)\("/api[^"]*"' "$ROOT_DIR/server.js" 2>/dev/null || true
  )

  local method
  for line in "${server_lines[@]}"; do
    file="${line%%:*}"
    rest="${line#*:}"
    line_no="${rest%%:*}"
    match="${rest#*:}"

    method="$(printf '%s' "$match" | sed -E 's/app\.([a-z]+)\(.*/\1/' | tr '[:lower:]' '[:upper:]')"
    route="$(printf '%s' "$match" | sed -E 's/app\.[a-z]+\("([^"]*)".*/\1/')"
    [[ -z "$route" ]] && continue

    key="server|$method|$route"
    [[ -n "${seen[$key]:-}" ]] && continue
    seen[$key]=1

    append_row "API servidor: $method $route" "$(relpath "$file"):$line_no" "Alta" "Incompatibilidad con frontend existente" "No cambiar contrato en retheme; si evoluciona API, hacerlo detrás de versión/feature flag"
  done

  echo >> "$OUT_FILE"
}

scan_tracking_contracts() {
  echo "## 5) Matriz de ruptura - Tracking y CTA contracts" >> "$OUT_FILE"
  echo >> "$OUT_FILE"
  write_table_header

  local -A seen=()
  local event_regex
  event_regex="trackEvent\\(\\s*['\\\"][^'\\\"]+['\\\"]|track\\(\\s*['\\\"][^'\\\"]+['\\\"]"

  mapfile -t attr_lines < <(
    rg -H -n -o --no-heading --glob '!node_modules/**' 'data-ps-[a-z0-9-]+' \
      "$ROOT_DIR/index.html" "$ROOT_DIR/evaluador.html" "$ROOT_DIR/resultado.html" "$ROOT_DIR/solicitar-propuesta.html" "$ROOT_DIR/confirmacion.html" "$ROOT_DIR/iei.html" "$ROOT_DIR/proveedores.html" "$ROOT_DIR/blog.html" "$ROOT_DIR/js" 2>/dev/null || true
  )

  local line file rest line_no attr key
  for line in "${attr_lines[@]}"; do
    file="${line%%:*}"
    rest="${line#*:}"
    line_no="${rest%%:*}"
    attr="${rest#*:}"

    key="attr|$attr"
    [[ -n "${seen[$key]:-}" ]] && continue
    seen[$key]=1

    append_row "Tracking attr: $attr" "$(relpath "$file"):$line_no" "Alta" "Atribución CTA/segmento y analítica de placement" "Mantener data-attrs legacy en markup nuevo"
  done

  mapfile -t event_lines < <(
    rg -H -n -o --no-heading --glob '!node_modules/**' "$event_regex" \
      "$ROOT_DIR/js" "$ROOT_DIR/index.html" "$ROOT_DIR/evaluador.html" 2>/dev/null || true
  )

  local event
  for line in "${event_lines[@]}"; do
    file="${line%%:*}"
    rest="${line#*:}"
    line_no="${rest%%:*}"
    match="${rest#*:}"

    event="$(printf '%s' "$match" | sed -E "s/.*\\(\\s*['\\\"]([^'\\\"]+)['\\\"].*/\\1/")"
    [[ -z "$event" ]] && continue

    key="event|$event"
    [[ -n "${seen[$key]:-}" ]] && continue
    seen[$key]=1

    append_row "Tracking event: $event" "$(relpath "$file"):$line_no" "Media-Alta" "Métricas de funnel/conversión incompletas" "Conservar puntos de disparo y payload base; si cambia markup, mantener clases/attrs alias"
  done

  echo >> "$OUT_FILE"
}

write_header() {
  cat > "$OUT_FILE" <<EOF_HEAD
# RETHEME_RISKS - matriz de ruptura y mitigaciones

Generado por: \`scripts/retheme_risk_scan.sh\`  
Fecha: $(date '+%Y-%m-%d %H:%M:%S %z')

Objetivo: predecir puntos de ruptura del retheme global antes de implementación y fijar mitigaciones con preferencia \`compat.css\` + HTML alias (sin tocar JS salvo último recurso).

EOF_HEAD
}

write_notes() {
  cat >> "$OUT_FILE" <<'EOF_NOTES'
## 6) Notas operativas de mitigación

- Prioridad de mitigación: `compat.css` -> ajustes HTML sin cambiar IDs/data-attrs -> CSS por página scoped -> JS mínimo (último recurso).
- Reglas de seguridad activas:
  - No renombrar IDs usados por JS.
  - No cambiar storage keys.
  - No alterar endpoints/payloads OTP y leads.
  - Mantener orden de carga de scripts en P0.
- Referencias de control:
  - `docs/NO_TOCAR.md`
  - `docs/SMOKE_P0.md`
  - `docs/BASELINE.md`
EOF_NOTES
}

main() {
  write_header
  run_audit_section
  scan_dom_contracts
  scan_storage_contracts
  scan_api_contracts
  scan_tracking_contracts
  write_notes
  echo "[retheme_risk_scan] report generated: $OUT_FILE"
}

main "$@"
