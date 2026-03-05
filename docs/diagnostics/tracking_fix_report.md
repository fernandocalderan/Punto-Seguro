# Tracking CTA Fix Report

Fecha: 2026-03-05  
Rama: `fix/tracking-cta-events`

## Objetivo
Cerrar el gap de `cta_proposals_click` sin mezclar con retheme visual y sin tocar lógica de funnel/OTP/leads.

## 1) Punto exacto de emisión

Evento detectado en [js/resultado.js](/tmp/ps-prs/tracking-cta/js/resultado.js#L775):

- Selector/escucha: `#cta-request` con `addEventListener("click", ...)`
- Emisión: `window.PuntoSeguroAnalytics?.trackEvent("cta_proposals_click", ...)`
- Navegación inmediata: `window.location.href = "/solicitar-propuesta"`

## 2) Ajuste de smoke (sin tocar producción)

Archivo modificado: [scripts/runtime_smoke_playwright.js](/tmp/ps-prs/tracking-cta/scripts/runtime_smoke_playwright.js)

Cambios aplicados:

1. Click explícito sobre el elemento real `#cta-request` (visible, scrolleado y habilitado).
2. Espera explícita de request `POST /api/events` con `event_name="cta_proposals_click"` antes de concluir.
3. Captura de tracking también en `page.on("request")` (no solo en `response`), para no perder eventos cuando hay navegación rápida.
4. Registro en artefacto de `ctaTrackingCheck` (`requestDetected`, `navigated`).

## 3) Resultado 5 corridas post-fix (smoke)

Reporte: [flakiness_report.md](/tmp/ps-prs/tracking-cta/docs/diagnostics/flakiness_report.md)

- Pass ratio: **5/5**
- `cta_proposals_click`: **presente 5/5**
- `lead_submit_success`: missing 5/5 (esperado por OTP `SKIPPED_ENV_NOT_CONFIGURED`)

Conclusión:

- El missing `cta_proposals_click` (5/5) era un gap de instrumentación del smoke, no una regresión funcional del tracking productivo.
- No fue necesario parchear `analytics.js` ni `js/resultado.js`.

## 4) ¿Hace falta patch mínimo en tracking productivo?

No, con la validación corregida el evento aparece consistentemente.

Patch de contingencia (no aplicado):

1. `fetch('/api/events', { keepalive: true, ... })` en `js/analytics.js`.
2. Delay de 120 ms antes de `location.href` en `js/resultado.js`.

Se deja sin aplicar para evitar cambios innecesarios de runtime.
