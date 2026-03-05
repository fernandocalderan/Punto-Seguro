#!/usr/bin/env bash
set -euo pipefail

BASE_REF="${BASE_REF:-main}"
INCLUDE_UNTRACKED="${INCLUDE_UNTRACKED:-0}"

if ! git rev-parse --verify "$BASE_REF" >/dev/null 2>&1; then
  echo "[guardrail_visual_only] FAIL: base ref '$BASE_REF' no existe"
  exit 1
fi

mapfile -t committed < <(git diff --name-only "$BASE_REF...HEAD" || true)
mapfile -t staged < <(git diff --name-only --cached || true)
mapfile -t unstaged < <(git diff --name-only || true)
untracked=()
if [[ "$INCLUDE_UNTRACKED" == "1" ]]; then
  mapfile -t untracked < <(git ls-files --others --exclude-standard || true)
fi

all_changes="$(printf '%s\n' "${committed[@]}" "${staged[@]}" "${unstaged[@]}" "${untracked[@]:-}" | sed '/^$/d' | sort -u)"

if [[ -z "$all_changes" ]]; then
  echo "[guardrail_visual_only] PASS: no hay cambios"
  exit 0
fi

echo "[guardrail_visual_only] BASE_REF=$BASE_REF"
echo "[guardrail_visual_only] Archivos detectados:"
printf '  - %s\n' $all_changes

allowed_regex='^(docs/|scripts/|contracts/|css/|styles/|assets/|.*\.html$|.*\.(png|jpg|jpeg|webp|svg|ico)$)'
forbidden_regex='^(js/|server\.js$|api/|db/|migrations/|lib/|package\.json$|package-lock\.json$|vercel\.json$)'

fail=0
while IFS= read -r file; do
  [[ -z "$file" ]] && continue

  if [[ "$file" =~ $forbidden_regex ]]; then
    echo "  [FAIL] cambio funcional no permitido en modo visual-only: $file"
    fail=1
    continue
  fi

  if [[ ! "$file" =~ $allowed_regex ]]; then
    echo "  [FAIL] archivo fuera de allowlist visual-only: $file"
    fail=1
    continue
  fi

  echo "  [OK] $file"
done <<< "$all_changes"

if [[ $fail -ne 0 ]]; then
  echo "[guardrail_visual_only] FAIL"
  exit 1
fi

echo "[guardrail_visual_only] PASS"
