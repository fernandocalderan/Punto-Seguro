# GUARDRAILS_RETHEME

Fecha: 2026-03-05  
Objetivo: bloquear quiebras funcionales durante retheme visual-only.

## Qué añade este pack

1. `contracts/no_tocar_p0.json`
- Fuente de verdad en formato máquina para contratos P0:
  - IDs, clases, data-attrs
  - orden CSS/JS por ruta
  - keys de storage
  - endpoints API y probes esperados
  - eventos tracking y assets críticos
  - aislamiento admin

2. `scripts/guardrail_visual_only.sh`
- Falla si hay cambios fuera de allowlist visual (`css/`, `styles/`, `assets/`, `*.html`, `docs/`, `scripts/`, `contracts/`).
- Falla si se tocan rutas funcionales (`js/`, `server.js`, `api/`, `db/`, `migrations/`, `lib/`, `package*.json`, `vercel.json`).

3. `scripts/guardrail_validate_contracts.js`
- Valida contratos NO TOCAR contra entorno ejecutándose en `BASE_URL`:
  - rutas P0 responden 200
  - IDs/clases/data attrs críticos presentes
  - orden de refs CSS/JS congelado
  - snippets inline obligatorios
  - assets críticos 200
  - probes API (sin OTP real)
  - keys storage presentes en código
  - endpoints críticos presentes en `server.js`
  - eventos/attrs tracking presentes
  - admin aislado de CSS de retheme global

4. `scripts/guardrail_retheme_gate.sh`
- Gate unificado para ejecutar todo:
  1) visual-only diff
  2) arranque server local
  3) `audit_p0.sh`
  4) validación contrato máquina
  5) risk scan
  6) css collision scan

## Comandos recomendados

- Validación completa local:
```bash
BASE_REF=main bash scripts/guardrail_retheme_gate.sh
```

- Validación de infraestructura (si el propio PR modifica `package.json` o backend de guardrails):
```bash
SKIP_VISUAL_ONLY=1 BASE_REF=main bash scripts/guardrail_retheme_gate.sh
```

- Solo contrato máquina:
```bash
BASE_URL=http://localhost:3000 node scripts/guardrail_validate_contracts.js
```

- Solo bloqueo de cambios funcionales:
```bash
BASE_REF=main bash scripts/guardrail_visual_only.sh
```

Notas:
- Por defecto ignora archivos no trackeados (`INCLUDE_UNTRACKED=0`).
- Para incluir no trackeados en la validación: `INCLUDE_UNTRACKED=1`.

## Política de merge recomendada

1. No mergear PR de retheme si falla cualquier guardrail.
2. No permitir bypass de `guardrail_visual_only.sh` en PR visual-only.
3. Si hay cambio de contrato, actualizar primero `contracts/no_tocar_p0.json` + docs y justificarlo en PR.
4. Repetir `docs/SMOKE_P0.md` manual en desktop y móvil antes de merge.

## Limitación explícita

Este pack reduce mucho el riesgo, pero no garantiza matemáticamente 0 errores de UX/negocio.  
Para acercarse al máximo, combinarlo con canary rollout + kill switch y monitorización de conversión/eventos.
