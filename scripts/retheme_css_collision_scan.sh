#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_FILE="$ROOT_DIR/docs/RETHEME_CSS_COLLISIONS.md"

mkdir -p "$ROOT_DIR/docs"

PAGES=(
  "index.html:/"
  "evaluador.html:/diagnostico"
  "resultado.html:/resultado"
  "solicitar-propuesta.html:/solicitar-propuesta"
  "confirmacion.html:/confirmacion"
)

escape_md() {
  printf '%s' "$1" | sed 's/|/\\|/g'
}

selector_count() {
  local file="$1"
  local pattern="$2"
  { rg -n "$pattern" "$file" 2>/dev/null || true; } | wc -l | tr -d ' '
}

extract_css_order() {
  local page="$1"
  local css_link_regex
  css_link_regex="<link[^>]+rel=['\\\"]stylesheet['\\\"][^>]*href=['\\\"][^'\\\"]+['\\\"]"
  { rg -n "$css_link_regex" "$page" 2>/dev/null || true; } \
    | sed -E "s/.*href=[\"']([^\"']+)[\"'].*/\\1/" \
    | paste -sd ' -> ' -
}

page_risk_level() {
  local file="$1"
  local inline_blocks="$2"
  local inline_attrs="$3"
  local css_order="$4"

  if [[ "$file" == "index.html" || "$file" == "evaluador.html" ]]; then
    if (( inline_blocks > 0 )); then
      echo "Alta"
      return
    fi
  fi

  if [[ "$css_order" == *"styles/leads.css"* && "$css_order" == *"/css/ps-ui.css"* ]]; then
    if (( inline_attrs > 0 || inline_blocks > 0 )); then
      echo "Media-Alta"
      return
    fi
    echo "Media"
    return
  fi

  if (( inline_blocks > 0 || inline_attrs > 5 )); then
    echo "Media"
    return
  fi

  echo "Baja"
}

cat > "$OUT_FILE" <<EOF_HEAD
# RETHEME_CSS_COLLISIONS - detección básica de colisiones CSS

Generado por: \`scripts/retheme_css_collision_scan.sh\`  
Fecha: $(date '+%Y-%m-%d %H:%M:%S %z')

Objetivo: identificar conflictos probables de orden/especificidad/inline styles antes del retheme.

## 1) Páginas P0 - carga CSS y riesgo

| Ruta | Archivo | CSS cargados (orden) | Inline \`<style>\` | Atributos \`style=\` | Riesgo | Mitigación sugerida |
|---|---|---|---:|---:|---|---|
EOF_HEAD

entry=""
for entry in "${PAGES[@]}"; do
  file="${entry%%:*}"
  route="${entry##*:}"
  abs="$ROOT_DIR/$file"

  css_order="$(extract_css_order "$abs")"
  [[ -z "$css_order" ]] && css_order="(sin stylesheets detectados)"

  inline_blocks="$({ rg -n '<style' "$abs" 2>/dev/null || true; } | wc -l | tr -d ' ')"
  inline_attrs="$({ rg -o 'style=' "$abs" 2>/dev/null || true; } | wc -l | tr -d ' ')"
  risk="$(page_risk_level "$file" "$inline_blocks" "$inline_attrs" "$css_order")"

  mitigation="Scope por body class + compat.css; mantener orden scripts/CSS y extraer inline gradualmente"

  printf '| `%s` | `%s` | %s | %s | %s | %s | %s |\n' \
    "$(escape_md "$route")" \
    "$(escape_md "$file")" \
    "$(escape_md "$css_order")" \
    "$(escape_md "$inline_blocks")" \
    "$(escape_md "$inline_attrs")" \
    "$(escape_md "$risk")" \
    "$(escape_md "$mitigation")" \
    >> "$OUT_FILE"
done

PS_UI="$ROOT_DIR/css/ps-ui.css"
LEADS="$ROOT_DIR/styles/leads.css"

GLOBAL_PATTERN='^[[:space:]]*(\*|body\b|a\b|button\b|input\b|form\b|section\b|\.container\b|\.header\b|\.main\b|\.card\b|\.brand\b|\.nav\b)'
PS_GLOBAL="$(selector_count "$PS_UI" "$GLOBAL_PATTERN")"
LEADS_GLOBAL="$(selector_count "$LEADS" "$GLOBAL_PATTERN")"
PS_IMPORTANT="$(selector_count "$PS_UI" '!important')"
LEADS_IMPORTANT="$(selector_count "$LEADS" '!important')"
PS_IDSEL="$(selector_count "$PS_UI" '#[a-zA-Z0-9_-]+')"
LEADS_IDSEL="$(selector_count "$LEADS" '#[a-zA-Z0-9_-]+')"

COMMON_SELECTORS=(
  ".container"
  ".header"
  ".header-inner"
  ".brand"
  ".nav"
  ".main"
  ".card"
  ".actions"
  ".btn"
  ".footer"
)

COMMON_FOUND=()
sel=""
for sel in "${COMMON_SELECTORS[@]}"; do
  esc="${sel//./\\.}"
  if rg -n "^\\s*${esc}([\\s,{:]|$)" "$PS_UI" >/dev/null 2>&1 && rg -n "^\\s*${esc}([\\s,{:]|$)" "$LEADS" >/dev/null 2>&1; then
    COMMON_FOUND+=("$sel")
  fi
done

COMMON_TEXT="(ninguno del set básico)"
if (( ${#COMMON_FOUND[@]} > 0 )); then
  COMMON_TEXT="${COMMON_FOUND[*]}"
fi

cat >> "$OUT_FILE" <<EOF_SUMMARY

## 2) Señales de colisión global (ps-ui.css vs leads.css)

| Métrica | ps-ui.css | leads.css | Riesgo |
|---|---:|---:|---|
| Reglas globales peligrosas (\`*\`, \`body\`, \`a\`, \`.container\`, etc.) | $PS_GLOBAL | $LEADS_GLOBAL | Alto si ambas hojas se cargan en la misma ruta |
| Uso de \`!important\` | $PS_IMPORTANT | $LEADS_IMPORTANT | Incrementa imprevisibilidad en overrides |
| Selectores con \`#id\` | $PS_IDSEL | $LEADS_IDSEL | Puede bloquear cambios de componentes |

Selectores comunes detectados en ambas hojas: $COMMON_TEXT

## 3) Recomendaciones de mitigación CSS

1. Aplicar scope por ruta con body class ('body.home-page', 'body.diagnostico-page', etc.).
2. Definir capas: 'ps-tokens.css' -> 'ps-components.css' -> 'ps-pages/*.css' -> 'compat.css'.
3. Mantener 'compat.css' para alias de clases legacy durante migración.
4. Evitar nuevos '!important'; usarlo solo para parche puntual documentado.
5. Migrar inline '<style>' de '/' y '/diagnostico' por fases para reducir colisiones.
EOF_SUMMARY

echo "[retheme_css_collision_scan] report generated: $OUT_FILE"
