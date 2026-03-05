# RETHEME_RISKS - matriz de ruptura y mitigaciones

Generado por: `scripts/retheme_risk_scan.sh`  
Fecha: 2026-03-05 10:07:25 +0100

Objetivo: predecir puntos de ruptura del retheme global antes de implementación y fijar mitigaciones con preferencia `compat.css` + HTML alias (sin tocar JS salvo último recurso).

## 1) Resultado de auditoría P0

Base URL auditada: `http://localhost:3000`

Estado general: **PASS**

| Ruta | Estado | Evidencia |
|---|---|---|
| `/` | PASS | HTTP 200 + contratos mínimos OK |
| `/diagnostico` | PASS | HTTP 200 + contratos mínimos OK |
| `/resultado` | PASS | HTTP 200 + contratos mínimos OK |
| `/solicitar-propuesta` | PASS | HTTP 200 + contratos mínimos OK |
| `/confirmacion` | PASS | HTTP 200 + contratos mínimos OK |

Resumen audit_p0.sh:

```text
== Punto Seguro P0 audit ==
Base URL: http://localhost:3000
Nota: este script no ejecuta OTP real; solo valida contratos estáticos y referencias.

-- Route: /
  [OK] GET / -> HTTP 200
  IDs mínimos:
    [OK] id="hero-primary-cta"
    [OK] id="eval-restore-banner"
    [OK] id="ps-iei-title"
    [OK] id="ps-iei-desc"
  Referencias JS/CSS mínimas:
    [OK] ref contains "/css/ps-ui.css"
    [OK] ref contains "/js/analytics.js"
    [OK] ref contains "/js/ps-cta.js"
    [OK] ref contains "/js/iei-meta.js"
    [OK] ref contains "/js/iei-ui.js"

-- Route: /diagnostico
  [OK] GET /diagnostico -> HTTP 200
  IDs mínimos:
    [OK] id="evaluador-form"
    [OK] id="tipo-inmueble"
    [OK] id="formulario-vivienda"
    [OK] id="formulario-comercio"
    [OK] id="iei-vivienda-root"
    [OK] id="iei-comercio-root"
  Referencias JS/CSS mínimas:
    [OK] ref contains "/css/ps-ui.css"
    [OK] ref contains "/js/analytics.js"
    [OK] ref contains "/js/iei-evaluador-user-v1.js"
    [OK] ref contains "/js/ps-cta.js"
    [OK] ref contains "/js/iei-meta.js"
    [OK] ref contains "/js/iei-ui.js"

-- Route: /resultado
  [OK] GET /resultado -> HTTP 200
  IDs mínimos:
    [OK] id="risk-score"
    [OK] id="risk-level-badge"
    [OK] id="recommendations-list"
    [OK] id="top-factors-list"
    [OK] id="cta-request"
    [OK] id="cta-keep"
    [OK] id="iei-bar-fill"
  Referencias JS/CSS mínimas:
    [OK] ref contains "styles/leads.css"
    [OK] ref contains "/css/ps-ui.css"
    [OK] ref contains "/js/analytics.js"
    [OK] ref contains "js/resultado.js"
    [OK] ref contains "/js/ps-cta.js"
    [OK] ref contains "/js/iei-meta.js"
    [OK] ref contains "/js/iei-ui.js"

-- Route: /solicitar-propuesta
  [OK] GET /solicitar-propuesta -> HTTP 200
  IDs mínimos:
    [OK] id="lead-form"
    [OK] id="name"
    [OK] id="phone"
    [OK] id="email"
    [OK] id="postal_code"
    [OK] id="consent"
    [OK] id="ps-otp-overlay"
    [OK] id="ps-otp-confirm"
    [OK] id="ps-otp-resend"
    [OK] id="ps-otp-close"
  Referencias JS/CSS mínimas:
    [OK] ref contains "styles/leads.css"
    [OK] ref contains "/css/ps-ui.css"
    [OK] ref contains "/js/analytics.js"
    [OK] ref contains "js/lead-form.js"
    [OK] ref contains "/js/ps-cta.js"
    [OK] ref contains "/js/iei-meta.js"
    [OK] ref contains "/js/iei-ui.js"

-- Route: /confirmacion
  [OK] GET /confirmacion -> HTTP 200
  IDs mínimos:
    [OK] id="confirmation-message"
  Referencias JS/CSS mínimas:
    [OK] ref contains "styles/leads.css"
    [OK] ref contains "/css/ps-ui.css"
    [OK] ref contains "/js/analytics.js"
    [OK] ref contains "/js/ps-cta.js"
    [OK] ref contains "/js/iei-meta.js"
    [OK] ref contains "/js/iei-ui.js"

-- Module contracts: /js/iei-evaluador-user-v1.js
  [OK] GET /js/iei-evaluador-user-v1.js -> HTTP 200
  [OK] references QUESTIONS_URL (/Motor-IEI/iei_questions_premium.json)
  [OK] references MOTOR_URL (/Motor-IEI/calculateIEI.js)
  [OK] exposes window.calcularRiesgo

== Critical assets (referenced + HTTP status) ==
  [OK] /css/ps-ui.css referenced=YES status=200
  [OK] /styles/leads.css referenced=YES status=200
  [OK] /js/analytics.js referenced=YES status=200
  [OK] /js/ps-cta.js referenced=YES status=200
  [OK] /js/iei-meta.js referenced=YES status=200
  [OK] /js/iei-ui.js referenced=YES status=200
  [OK] /js/iei-evaluador-user-v1.js referenced=YES status=200
  [OK] /js/resultado.js referenced=YES status=200
  [OK] /js/lead-form.js referenced=YES status=200
  [OK] /Motor-IEI/iei_questions_premium.json referenced=YES status=200
  [OK] /Motor-IEI/calculateIEI.js referenced=YES status=200
  [OK] /logo-punto-seguro.png referenced=YES status=200
  [OK] /favicon.ico referenced=YES status=200
  [OK] /favicon-32x32.png referenced=YES status=200
  [OK] /favicon-16x16.png referenced=YES status=200
  [OK] /apple-touch-icon.png referenced=YES status=200

Audit result: PASS
```

## 2) Matriz de ruptura - DOM contracts

| Contrato | Archivo/Línea | Riesgo | Qué puede romper | Mitigación recomendada |
|---|---|---|---|---|
| `DOM class/compound selector: querySelector(".blog-page .ps-sticky-bar")` | `blog.html:1122` | Media | Eventos delegados o UX dinámica inestable | Mantener clase legacy o añadir selector alias en compat.css/markup |
| `DOM class/compound selector: querySelector(".hero")` | `blog.html:1134` | Media | Eventos delegados o UX dinámica inestable | Mantener clase legacy o añadir selector alias en compat.css/markup |
| `DOM ID: #confirmation-message` | `confirmacion.html:65` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #form-alerta` | `evaluador.html:1510` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM class/compound selector: select` | `evaluador.html:1526` | Media | Eventos delegados o UX dinámica inestable | Mantener clase legacy o añadir selector alias en compat.css/markup |
| `DOM ID: #ps-stepbar-pct` | `evaluador.html:1542` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #ps-stepbar-fill` | `evaluador.html:1543` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM class/compound selector: querySelector(".ps-stepbar-bar")` | `evaluador.html:1544` | Media | Eventos delegados o UX dinámica inestable | Mantener clase legacy o añadir selector alias en compat.css/markup |
| `DOM ID: #tipo-inmueble` | `evaluador.html:1545` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID selector: #formulario-vivienda select` | `evaluador.html:1553` | Alta | Lógica JS acoplada a selector específico | No renombrar; usar alias de compatibilidad |
| `DOM ID selector: #formulario-comercio select` | `evaluador.html:1555` | Alta | Lógica JS acoplada a selector específico | No renombrar; usar alias de compatibilidad |
| `DOM ID: #formulario-vivienda` | `evaluador.html:1574` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #formulario-comercio` | `evaluador.html:1575` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #evaluador-form` | `evaluador.html:1637` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM class/compound selector: .ps-type-btn` | `evaluador.html:1649` | Media | Eventos delegados o UX dinámica inestable | Mantener clase legacy o añadir selector alias en compat.css/markup |
| `DOM ID: #ps-progress` | `evaluador.html:1650` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #ps-eval-body` | `evaluador.html:1651` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #eval-restore-banner` | `index.html:1444` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #hero-primary-cta` | `index.html:1459` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM class/compound selector: querySelector(".home-page .ps-sticky-bar")` | `index.html:1479` | Media | Eventos delegados o UX dinámica inestable | Mantener clase legacy o añadir selector alias en compat.css/markup |
| `DOM data-attr selector: select[data-qid]` | `js/iei-evaluador-user-v1.js:94` | Alta | Delegación de eventos y tracking dejan de disparar | Preservar data-attrs legacy y mapearlos en markup nuevo |
| `DOM ID: #iei-vivienda-root` | `js/iei-evaluador-user-v1.js:99` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #iei-comercio-root` | `js/iei-evaluador-user-v1.js:100` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #risk-score` | `js/resultado.js:566` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #risk-level-badge` | `js/resultado.js:567` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #risk-explanation` | `js/resultado.js:568` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #recommendations-list` | `js/resultado.js:569` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #top-factors-list` | `js/resultado.js:570` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #risk-human-text` | `js/resultado.js:571` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #cta-request` | `js/resultado.js:572` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #cta-keep` | `js/resultado.js:573` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #decision-feedback` | `js/resultado.js:574` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #iei-bar-fill` | `js/resultado.js:575` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM class/compound selector: querySelector("header.iei-hero")` | `js/resultado.js:576` | Media | Eventos delegados o UX dinámica inestable | Mantener clase legacy o añadir selector alias en compat.css/markup |
| `DOM ID: #ps-premium-meaning` | `js/resultado.js:605` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #ps-premium-priority` | `js/resultado.js:624` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #ps-premium-drivers` | `js/resultado.js:644` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #operational-exposure` | `js/resultado.js:666` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM class/compound selector: .ps-sticky-bar` | `js/ps-cta.js:20` | Media | Eventos delegados o UX dinámica inestable | Mantener clase legacy o añadir selector alias en compat.css/markup |
| `DOM class/compound selector: header` | `js/ps-cta.js:21` | Media | Eventos delegados o UX dinámica inestable | Mantener clase legacy o añadir selector alias en compat.css/markup |
| `DOM class/compound selector: a.ps-cta-primary, a.ps-sticky-cta` | `js/ps-cta.js:42` | Media | Eventos delegados o UX dinámica inestable | Mantener clase legacy o añadir selector alias en compat.css/markup |
| `DOM class/compound selector: a[href]` | `js/ps-cta.js:110` | Media | Eventos delegados o UX dinámica inestable | Mantener clase legacy o añadir selector alias en compat.css/markup |
| `DOM ID selector: #ps-iei-title, .ps-iei-title` | `js/iei-ui.js:13` | Alta | Lógica JS acoplada a selector específico | No renombrar; usar alias de compatibilidad |
| `DOM ID: #psPreviewModal` | `js/iei-ui.js:36` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM class/compound selector: querySelector(".ps-modal-close")` | `js/iei-ui.js:47` | Media | Eventos delegados o UX dinámica inestable | Mantener clase legacy o añadir selector alias en compat.css/markup |
| `DOM ID selector: querySelector("#collaborators-table tbody")` | `js/admin/collaborators.js:2` | Alta | Lógica JS acoplada a selector específico | No renombrar; usar alias de compatibilidad |
| `DOM ID: #collaborator-form` | `js/admin/collaborators.js:3` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #collaborators-metrics` | `js/admin/collaborators.js:4` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #collaborator-detail` | `js/admin/collaborators.js:5` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #collaborator-detail-content` | `js/admin/collaborators.js:6` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #collaborator-alert` | `js/admin/collaborators.js:7` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #collaborator-new-btn` | `js/admin/collaborators.js:8` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #collaborator-modal` | `js/admin/collaborators.js:9` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #collaborator-modal-title` | `js/admin/collaborators.js:10` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #collaborator-modal-close` | `js/admin/collaborators.js:11` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM data-attr selector: querySelector("[data-close-collaborator-modal]")` | `js/admin/collaborators.js:12` | Alta | Delegación de eventos y tracking dejan de disparar | Preservar data-attrs legacy y mapearlos en markup nuevo |
| `DOM ID: #collaborator-id` | `js/admin/collaborators.js:15` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #collaborator-name` | `js/admin/collaborators.js:16` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #collaborator-type` | `js/admin/collaborators.js:17` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #collaborator-tracking-code` | `js/admin/collaborators.js:18` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #collaborator-commission-type` | `js/admin/collaborators.js:19` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #collaborator-commission-value` | `js/admin/collaborators.js:20` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #collaborator-status` | `js/admin/collaborators.js:21` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #collaborator-email` | `js/admin/collaborators.js:22` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #collaborator-phone` | `js/admin/collaborators.js:23` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM data-attr selector: [data-edit]` | `js/admin/collaborators.js:292` | Alta | Delegación de eventos y tracking dejan de disparar | Preservar data-attrs legacy y mapearlos en markup nuevo |
| `DOM data-attr selector: [data-toggle]` | `js/admin/collaborators.js:304` | Alta | Delegación de eventos y tracking dejan de disparar | Preservar data-attrs legacy y mapearlos en markup nuevo |
| `DOM data-attr selector: [data-ban]` | `js/admin/collaborators.js:323` | Alta | Delegación de eventos y tracking dejan de disparar | Preservar data-attrs legacy y mapearlos en markup nuevo |
| `DOM data-attr selector: [data-leads]` | `js/admin/collaborators.js:341` | Alta | Delegación de eventos y tracking dejan de disparar | Preservar data-attrs legacy y mapearlos en markup nuevo |
| `DOM ID: #collaborator-reset` | `js/admin/collaborators.js:359` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #logout-btn` | `js/admin/collaborators.js:374` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #lead-form` | `js/lead-form.js:2` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #form-alert` | `js/lead-form.js:3` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #lead-summary` | `js/lead-form.js:4` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #ps-otp-overlay` | `js/lead-form.js:6` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM class/compound selector: .otp-digit` | `js/lead-form.js:7` | Media | Eventos delegados o UX dinámica inestable | Mantener clase legacy o añadir selector alias en compat.css/markup |
| `DOM ID: #ps-otp-confirm` | `js/lead-form.js:8` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #ps-otp-resend` | `js/lead-form.js:9` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #ps-otp-close` | `js/lead-form.js:10` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #ps-otp-error` | `js/lead-form.js:11` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #ps-otp-status` | `js/lead-form.js:12` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #business_type` | `js/lead-form.js:137` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #urgency` | `js/lead-form.js:142` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #name` | `js/lead-form.js:525` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #consent` | `js/lead-form.js:531` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #phone` | `js/lead-form.js:537` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #postal_code` | `js/lead-form.js:548` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #email` | `js/lead-form.js:558` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #city` | `js/lead-form.js:573` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #budget_range` | `js/lead-form.js:577` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #notes` | `js/lead-form.js:578` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID selector: querySelector("#providers-table tbody")` | `js/admin/providers.js:2` | Alta | Lógica JS acoplada a selector específico | No renombrar; usar alias de compatibilidad |
| `DOM ID: #provider-form` | `js/admin/providers.js:3` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #provider-alert` | `js/admin/providers.js:4` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #provider-related-section` | `js/admin/providers.js:5` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #provider-related-title` | `js/admin/providers.js:6` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #provider-related-meta` | `js/admin/providers.js:7` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID selector: querySelector("#provider-related-table tbody")` | `js/admin/providers.js:8` | Alta | Lógica JS acoplada a selector específico | No renombrar; usar alias de compatibilidad |
| `DOM ID: #provider-new-btn` | `js/admin/providers.js:9` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #provider-modal` | `js/admin/providers.js:10` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #provider-modal-title` | `js/admin/providers.js:11` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #provider-modal-close` | `js/admin/providers.js:12` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM data-attr selector: querySelector("[data-close-provider-modal]")` | `js/admin/providers.js:13` | Alta | Delegación de eventos y tracking dejan de disparar | Preservar data-attrs legacy y mapearlos en markup nuevo |
| `DOM ID: #provider-id` | `js/admin/providers.js:16` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #provider-name` | `js/admin/providers.js:17` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #provider-email` | `js/admin/providers.js:18` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #provider-phone` | `js/admin/providers.js:19` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #provider-zones` | `js/admin/providers.js:20` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #provider-types` | `js/admin/providers.js:21` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #provider-priority` | `js/admin/providers.js:22` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #provider-daily-cap` | `js/admin/providers.js:23` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #provider-active` | `js/admin/providers.js:24` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #provider-reset` | `js/admin/providers.js:288` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #admin-login-form` | `js/admin/login.js:2` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #login-alert` | `js/admin/login.js:3` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #password` | `js/admin/login.js:22` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID selector: querySelector("#leads-table tbody")` | `js/admin/leads.js:2` | Alta | Lógica JS acoplada a selector específico | No renombrar; usar alias de compatibilidad |
| `DOM ID: #lead-detail` | `js/admin/leads.js:3` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #lead-detail-content` | `js/admin/leads.js:4` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |
| `DOM ID: #lead-update-form` | `js/admin/leads.js:5` | Alta | Eventos/render/validación no encuentran nodo | Mantener ID exacto; si cambia markup, añadir alias en el nodo final |

## 3) Matriz de ruptura - Storage contracts

| Contrato | Archivo/Línea | Riesgo | Qué puede romper | Mitigación recomendada |
|---|---|---|---|---|
| `Storage key: puntoSeguro.lastLead` | `confirmacion.html:67` | Alta | Se rompe traspaso entre páginas (resultado/lead/confirmación/restore) | No renombrar key; si migras estructura, usar compat de lectura y escritura dual temporal |
| `Storage key: puntoSeguro.latestEvaluation` | `js/resultado.js:3` | Alta | Se rompe traspaso entre páginas (resultado/lead/confirmación/restore) | No renombrar key; si migras estructura, usar compat de lectura y escritura dual temporal |
| `Storage key: ps_urgency_variant` | `js/resultado.js:15` | Alta | Se rompe traspaso entre páginas (resultado/lead/confirmación/restore) | No renombrar key; si migras estructura, usar compat de lectura y escritura dual temporal |
| `Storage key: ps_eval_restore_attempted` | `js/resultado.js:489` | Alta | Se rompe traspaso entre páginas (resultado/lead/confirmación/restore) | No renombrar key; si migras estructura, usar compat de lectura y escritura dual temporal |
| `Storage key: ps_eval_snapshot_saved` | `js/resultado.js:511` | Alta | Se rompe traspaso entre páginas (resultado/lead/confirmación/restore) | No renombrar key; si migras estructura, usar compat de lectura y escritura dual temporal |
| `Storage key: puntoSeguro.intent` | `js/lead-form.js:39` | Alta | Se rompe traspaso entre páginas (resultado/lead/confirmación/restore) | No renombrar key; si migras estructura, usar compat de lectura y escritura dual temporal |
| `Storage key: puntoSeguro.evaluationSummary` | `js/lead-form.js:49` | Alta | Se rompe traspaso entre páginas (resultado/lead/confirmación/restore) | No renombrar key; si migras estructura, usar compat de lectura y escritura dual temporal |
| `Storage key: puntoSeguro.collaborator` | `js/lead-form.js:59` | Alta | Se rompe traspaso entre páginas (resultado/lead/confirmación/restore) | No renombrar key; si migras estructura, usar compat de lectura y escritura dual temporal |

## 4) Matriz de ruptura - API contracts

| Contrato | Archivo/Línea | Riesgo | Qué puede romper | Mitigación recomendada |
|---|---|---|---|---|
| `API cliente: /api/eval-snapshot/me` | `index.html:1438` | Alta | Flujos OTP/leads/tracking/admin fallan por endpoint roto | Mantener ruta, método y payload; introducir alias backend solo si no hay alternativa |
| `API cliente: /api/eval-snapshot` | `js/iei-evaluador-user-v1.js:545` | Alta | Flujos OTP/leads/tracking/admin fallan por endpoint roto | Mantener ruta, método y payload; introducir alias backend solo si no hay alternativa |
| `API cliente: /api/events` | `js/analytics.js:21` | Alta | Flujos OTP/leads/tracking/admin fallan por endpoint roto | Mantener ruta, método y payload; introducir alias backend solo si no hay alternativa |
| `API cliente: /api/admin/logout` | `js/admin/collaborators.js:375` | Alta | Flujos OTP/leads/tracking/admin fallan por endpoint roto | Mantener ruta, método y payload; introducir alias backend solo si no hay alternativa |
| `API cliente: /api/admin/login` | `js/admin/login.js:26` | Alta | Flujos OTP/leads/tracking/admin fallan por endpoint roto | Mantener ruta, método y payload; introducir alias backend solo si no hay alternativa |
| `API cliente: /api/otp/start` | `js/lead-form.js:317` | Alta | Flujos OTP/leads/tracking/admin fallan por endpoint roto | Mantener ruta, método y payload; introducir alias backend solo si no hay alternativa |
| `API cliente: /api/otp/check` | `js/lead-form.js:330` | Alta | Flujos OTP/leads/tracking/admin fallan por endpoint roto | Mantener ruta, método y payload; introducir alias backend solo si no hay alternativa |
| `API cliente: /api/otp/token` | `js/lead-form.js:343` | Alta | Flujos OTP/leads/tracking/admin fallan por endpoint roto | Mantener ruta, método y payload; introducir alias backend solo si no hay alternativa |
| `API cliente: /api/leads` | `js/lead-form.js:357` | Alta | Flujos OTP/leads/tracking/admin fallan por endpoint roto | Mantener ruta, método y payload; introducir alias backend solo si no hay alternativa |
| `API servidor: POST /api/events` | `server.js:749` | Alta | Incompatibilidad con frontend existente | No cambiar contrato en retheme; si evoluciona API, hacerlo detrás de versión/feature flag |
| `API servidor: POST /api/eval-snapshot` | `server.js:769` | Alta | Incompatibilidad con frontend existente | No cambiar contrato en retheme; si evoluciona API, hacerlo detrás de versión/feature flag |
| `API servidor: GET /api/eval-snapshot/me` | `server.js:796` | Alta | Incompatibilidad con frontend existente | No cambiar contrato en retheme; si evoluciona API, hacerlo detrás de versión/feature flag |
| `API servidor: POST /api/otp/start` | `server.js:823` | Alta | Incompatibilidad con frontend existente | No cambiar contrato en retheme; si evoluciona API, hacerlo detrás de versión/feature flag |
| `API servidor: POST /api/otp/check` | `server.js:861` | Alta | Incompatibilidad con frontend existente | No cambiar contrato en retheme; si evoluciona API, hacerlo detrás de versión/feature flag |
| `API servidor: POST /api/otp/token` | `server.js:889` | Alta | Incompatibilidad con frontend existente | No cambiar contrato en retheme; si evoluciona API, hacerlo detrás de versión/feature flag |
| `API servidor: POST /api/leads` | `server.js:919` | Alta | Incompatibilidad con frontend existente | No cambiar contrato en retheme; si evoluciona API, hacerlo detrás de versión/feature flag |
| `API servidor: POST /api/admin/login` | `server.js:1000` | Alta | Incompatibilidad con frontend existente | No cambiar contrato en retheme; si evoluciona API, hacerlo detrás de versión/feature flag |
| `API servidor: POST /api/admin/logout` | `server.js:1016` | Alta | Incompatibilidad con frontend existente | No cambiar contrato en retheme; si evoluciona API, hacerlo detrás de versión/feature flag |
| `API servidor: GET /api/admin/providers` | `server.js:1025` | Alta | Incompatibilidad con frontend existente | No cambiar contrato en retheme; si evoluciona API, hacerlo detrás de versión/feature flag |
| `API servidor: GET /api/admin/providers/:id/leads` | `server.js:1031` | Alta | Incompatibilidad con frontend existente | No cambiar contrato en retheme; si evoluciona API, hacerlo detrás de versión/feature flag |
| `API servidor: POST /api/admin/providers` | `server.js:1050` | Alta | Incompatibilidad con frontend existente | No cambiar contrato en retheme; si evoluciona API, hacerlo detrás de versión/feature flag |
| `API servidor: PATCH /api/admin/providers/:id` | `server.js:1061` | Alta | Incompatibilidad con frontend existente | No cambiar contrato en retheme; si evoluciona API, hacerlo detrás de versión/feature flag |
| `API servidor: PUT /api/admin/providers/:id` | `server.js:1080` | Alta | Incompatibilidad con frontend existente | No cambiar contrato en retheme; si evoluciona API, hacerlo detrás de versión/feature flag |
| `API servidor: DELETE /api/admin/providers/:id` | `server.js:1099` | Alta | Incompatibilidad con frontend existente | No cambiar contrato en retheme; si evoluciona API, hacerlo detrás de versión/feature flag |
| `API servidor: GET /api/admin/collaborators` | `server.js:1138` | Alta | Incompatibilidad con frontend existente | No cambiar contrato en retheme; si evoluciona API, hacerlo detrás de versión/feature flag |
| `API servidor: POST /api/admin/collaborators` | `server.js:1144` | Alta | Incompatibilidad con frontend existente | No cambiar contrato en retheme; si evoluciona API, hacerlo detrás de versión/feature flag |
| `API servidor: PATCH /api/admin/collaborators/:id` | `server.js:1159` | Alta | Incompatibilidad con frontend existente | No cambiar contrato en retheme; si evoluciona API, hacerlo detrás de versión/feature flag |
| `API servidor: GET /api/admin/collaborators/:id/leads` | `server.js:1186` | Alta | Incompatibilidad con frontend existente | No cambiar contrato en retheme; si evoluciona API, hacerlo detrás de versión/feature flag |
| `API servidor: GET /api/admin/leads` | `server.js:1202` | Alta | Incompatibilidad con frontend existente | No cambiar contrato en retheme; si evoluciona API, hacerlo detrás de versión/feature flag |
| `API servidor: GET /api/admin/leads/:id` | `server.js:1214` | Alta | Incompatibilidad con frontend existente | No cambiar contrato en retheme; si evoluciona API, hacerlo detrás de versión/feature flag |
| `API servidor: PATCH /api/admin/leads/:id` | `server.js:1229` | Alta | Incompatibilidad con frontend existente | No cambiar contrato en retheme; si evoluciona API, hacerlo detrás de versión/feature flag |
| `API servidor: DELETE /api/admin/leads/:id` | `server.js:1427` | Alta | Incompatibilidad con frontend existente | No cambiar contrato en retheme; si evoluciona API, hacerlo detrás de versión/feature flag |
| `API servidor: POST /api/admin/leads/:id/assign-manual` | `server.js:1455` | Alta | Incompatibilidad con frontend existente | No cambiar contrato en retheme; si evoluciona API, hacerlo detrás de versión/feature flag |
| `API servidor: POST /api/admin/leads/:id/reassign-auto` | `server.js:1544` | Alta | Incompatibilidad con frontend existente | No cambiar contrato en retheme; si evoluciona API, hacerlo detrás de versión/feature flag |
| `API servidor: POST /api/admin/leads/:id/anonymize` | `server.js:1629` | Alta | Incompatibilidad con frontend existente | No cambiar contrato en retheme; si evoluciona API, hacerlo detrás de versión/feature flag |
| `API servidor: GET /api/admin/events` | `server.js:1653` | Alta | Incompatibilidad con frontend existente | No cambiar contrato en retheme; si evoluciona API, hacerlo detrás de versión/feature flag |
| `API servidor: GET /api/admin/metrics/360` | `server.js:1660` | Alta | Incompatibilidad con frontend existente | No cambiar contrato en retheme; si evoluciona API, hacerlo detrás de versión/feature flag |
| `API servidor: GET /api/admin/metrics/360/leads` | `server.js:1868` | Alta | Incompatibilidad con frontend existente | No cambiar contrato en retheme; si evoluciona API, hacerlo detrás de versión/feature flag |
| `API servidor: GET /api/admin/metrics/by-collaborator` | `server.js:1887` | Alta | Incompatibilidad con frontend existente | No cambiar contrato en retheme; si evoluciona API, hacerlo detrás de versión/feature flag |
| `API servidor: GET /api/admin/metrics/by-provider` | `server.js:1940` | Alta | Incompatibilidad con frontend existente | No cambiar contrato en retheme; si evoluciona API, hacerlo detrás de versión/feature flag |
| `API servidor: GET /api/admin/metrics` | `server.js:1995` | Alta | Incompatibilidad con frontend existente | No cambiar contrato en retheme; si evoluciona API, hacerlo detrás de versión/feature flag |

## 5) Matriz de ruptura - Tracking y CTA contracts

| Contrato | Archivo/Línea | Riesgo | Qué puede romper | Mitigación recomendada |
|---|---|---|---|---|
| `Tracking attr: data-ps-placement` | `blog.html:908` | Alta | Atribución CTA/segmento y analítica de placement | Mantener data-attrs legacy en markup nuevo |
| `Tracking attr: data-ps-segment` | `index.html:1118` | Alta | Atribución CTA/segmento y analítica de placement | Mantener data-attrs legacy en markup nuevo |
| `Tracking event: quiz_started` | `evaluador.html:1581` | Media-Alta | Métricas de funnel/conversión incompletas | Conservar puntos de disparo y payload base; si cambia markup, mantener clases/attrs alias |
| `Tracking event: quiz_completed` | `js/iei-evaluador-user-v1.js:553` | Media-Alta | Métricas de funnel/conversión incompletas | Conservar puntos de disparo y payload base; si cambia markup, mantener clases/attrs alias |
| `Tracking event: result_viewed` | `js/resultado.js:507` | Media-Alta | Métricas de funnel/conversión incompletas | Conservar puntos de disparo y payload base; si cambia markup, mantener clases/attrs alias |
| `Tracking event: cta_proposals_click` | `js/resultado.js:794` | Media-Alta | Métricas de funnel/conversión incompletas | Conservar puntos de disparo y payload base; si cambia markup, mantener clases/attrs alias |
| `Tracking event: lead_declined` | `js/resultado.js:813` | Media-Alta | Métricas de funnel/conversión incompletas | Conservar puntos de disparo y payload base; si cambia markup, mantener clases/attrs alias |
| `Tracking event: lead_form_started` | `js/lead-form.js:126` | Media-Alta | Métricas de funnel/conversión incompletas | Conservar puntos de disparo y payload base; si cambia markup, mantener clases/attrs alias |
| `Tracking event: lead_form_viewed` | `js/lead-form.js:193` | Media-Alta | Métricas de funnel/conversión incompletas | Conservar puntos de disparo y payload base; si cambia markup, mantener clases/attrs alias |
| `Tracking event: lead_submit_success` | `js/lead-form.js:370` | Media-Alta | Métricas de funnel/conversión incompletas | Conservar puntos de disparo y payload base; si cambia markup, mantener clases/attrs alias |
| `Tracking event: lead_submit_error` | `js/lead-form.js:403` | Media-Alta | Métricas de funnel/conversión incompletas | Conservar puntos de disparo y payload base; si cambia markup, mantener clases/attrs alias |
| `Tracking event: lead_submit_clicked` | `js/lead-form.js:596` | Media-Alta | Métricas de funnel/conversión incompletas | Conservar puntos de disparo y payload base; si cambia markup, mantener clases/attrs alias |
| `Tracking event: cta_diagnostico_clicked` | `js/ps-cta.js:27` | Media-Alta | Métricas de funnel/conversión incompletas | Conservar puntos de disparo y payload base; si cambia markup, mantener clases/attrs alias |

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
